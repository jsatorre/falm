import { supabase } from "./supabaseServer";
import { calcularClasificacion } from "./scoring";
import { priorizarEquipos, asignarFichajes } from "./fichajes";
import { getCaraACaraRounds } from "./caraACaraRounds";

/**
 * Si ya pasó la hora tope de una jornada de fichajes, calcula (la primera
 * vez) o devuelve (las siguientes — es idempotente) quién ficha a quién:
 * prioridad = quien no fichó la jornada anterior primero, y entre esos el
 * peor clasificado; cada equipo se lleva su 1ª opción libre, si no la 2ª.
 *
 * @param {{ id: string, jornadaCaraACara: number }} ronda
 * @returns {Promise<Array<{ team_id: string, player: string }>>}
 */
export async function publicarFichajesSiToca(ronda) {
  const { data: existentes, error: existentesError } = await supabase
    .from("fichaje_assignments")
    .select("team_id, player")
    .eq("round_id", ronda.id);
  if (existentesError) throw existentesError;
  if (existentes.length > 0) return existentes;

  const rounds = await getCaraACaraRounds();
  const rondaAnterior = rounds.find((r) => r.jornadaCaraACara === ronda.jornadaCaraACara - 1);

  const [
    { data: teams },
    { data: wishlistRaw },
    { data: asignacionesAnteriores },
    { data: fixturesRaw },
    { data: resultsRaw },
  ] = await Promise.all([
    supabase.from("teams").select("id"),
    supabase.from("team_wishlist").select("team_id, player_1, player_2").eq("round_id", ronda.id),
    rondaAnterior
      ? supabase.from("fichaje_assignments").select("team_id").eq("round_id", rondaAnterior.id)
      : Promise.resolve({ data: [] }),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
  ]);

  const fichoAnteriorSet = new Set((asignacionesAnteriores ?? []).map((a) => a.team_id));

  const jornadaPorRoundId = new Map(rounds.map((r) => [r.id, r.jornadaCaraACara]));
  const fixtures = fixturesRaw
    .filter((f) => jornadaPorRoundId.has(f.round_id))
    .map((f) => ({
      roundId: f.round_id,
      jornada: jornadaPorRoundId.get(f.round_id),
      teamAId: f.team_a_id,
      teamBId: f.team_b_id,
    }));

  const results = {};
  for (const r of resultsRaw) {
    results[r.round_id] ??= {};
    results[r.round_id][r.team_id] = r.biwenger_points;
  }

  const equiposClasificacion = teams.map((t) => ({ id: t.id }));
  const clasificacion = calcularClasificacion(
    equiposClasificacion,
    fixtures,
    results,
    ronda.jornadaCaraACara - 1
  );
  const posicionPorEquipoId = new Map(clasificacion.map((fila, i) => [fila.team.id, i + 1]));

  const wishlistPorEquipo = {};
  for (const w of wishlistRaw) {
    wishlistPorEquipo[w.team_id] = [w.player_1, w.player_2];
  }

  const equiposParaPriorizar = teams.map((t) => ({
    teamId: t.id,
    fichoJornadaAnterior: fichoAnteriorSet.has(t.id),
    posicion: posicionPorEquipoId.get(t.id) ?? teams.length,
  }));

  const priorizados = priorizarEquipos(equiposParaPriorizar);
  const asignaciones = asignarFichajes(priorizados, wishlistPorEquipo);

  if (asignaciones.length > 0) {
    const { error: insertError } = await supabase
      .from("fichaje_assignments")
      .insert(asignaciones.map((a) => ({ round_id: ronda.id, team_id: a.teamId, player: a.player })));
    if (insertError) throw insertError;
  }

  return asignaciones.map((a) => ({ team_id: a.teamId, player: a.player }));
}

export function deadlinePasada(ronda) {
  return Boolean(ronda.fichajes_deadline) && new Date(ronda.fichajes_deadline) <= new Date();
}

/**
 * Próxima ocurrencia de un día de la semana + hora, estrictamente después
 * de `desde` (nunca devuelve "ahora mismo" ni el pasado). diaSemana usa el
 * mismo criterio que Date#getDay(): 0 = domingo ... 6 = sábado.
 */
export function calcularProximaHoraTope(diaSemana, horaStr, desde = new Date()) {
  const [horas, minutos] = horaStr.split(":").map(Number);
  const candidato = new Date(desde);
  candidato.setHours(horas, minutos, 0, 0);

  const diasHastaObjetivo = (diaSemana - candidato.getDay() + 7) % 7;
  candidato.setDate(candidato.getDate() + diasHastaObjetivo);

  if (candidato <= desde) {
    candidato.setDate(candidato.getDate() + 7);
  }

  return candidato;
}

async function leerConfigFichajes() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["fichajes_dia_semana", "fichajes_hora"]);
  if (error) throw error;

  const config = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
  if (config.fichajes_dia_semana == null || !config.fichajes_hora) return null;

  return { diaSemana: Number(config.fichajes_dia_semana), hora: config.fichajes_hora };
}

/**
 * Si la jornada de fichajes activa todavía no tiene hora tope asignada, y
 * hay una regla semanal configurada (ver /admin), le calcula y guarda la
 * próxima ocurrencia de esa regla — una sola vez por jornada (una vez
 * fijada, no se recalcula aunque pase el tiempo, para que no "huya" del
 * usuario). Devuelve la ronda con `fichajes_deadline` ya relleno si
 * procede.
 */
export async function asegurarDeadlineFichajes(ronda) {
  if (ronda.fichajes_deadline) return ronda;

  const config = await leerConfigFichajes();
  if (!config) return ronda;

  const deadline = calcularProximaHoraTope(config.diaSemana, config.hora);
  const { error } = await supabase
    .from("rounds")
    .update({ fichajes_deadline: deadline.toISOString() })
    .eq("id", ronda.id);
  if (error) throw error;

  return { ...ronda, fichajes_deadline: deadline.toISOString() };
}
