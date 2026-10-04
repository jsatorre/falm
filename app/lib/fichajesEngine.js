import { supabase } from "./supabaseServer";
import { calcularClasificacion } from "./scoring";
import { priorizarEquipos, asignarFichajes } from "./fichajes";
import { getCaraACaraRounds } from "./caraACaraRounds";
import { enviarPushEquipo } from "./push";
import { avisarFichajesResueltos } from "./notificacionesFichajes";

/**
 * Prioridad + reparto de una ventana de fichajes, común a la ventana normal
 * de cada jornada y a la Ventana Extra (ver ventanaExtra.js): quien NO
 * fichó en la ventana previa va primero y, entre esos, el peor clasificado
 * (hasta `hastaJornada`); cada equipo se lleva su 1ª opción libre, si no la
 * 2ª. `excluidos` son jugadores ya fichados en otra ventana que no se
 * pueden volver a asignar.
 *
 * @param {{ roundIdPrevio: string|null, hastaJornada: number, wishlistPorEquipo: Record<string, [string|null, string|null]>, excluidos?: Set<string> }} opciones
 * @returns {Promise<{ asignaciones: Array<{ teamId: string, player: string }>, teams: Array<{ id: string, name: string }> }>}
 */
export async function calcularAsignaciones({ roundIdPrevio, hastaJornada, wishlistPorEquipo, excluidos = new Set() }) {
  const rounds = await getCaraACaraRounds();

  const [
    { data: teams },
    { data: asignacionesAnteriores },
    { data: fixturesRaw },
    { data: resultsRaw },
  ] = await Promise.all([
    supabase.from("teams").select("id, name"),
    roundIdPrevio
      ? supabase.from("fichaje_assignments").select("team_id").eq("round_id", roundIdPrevio)
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

  const clasificacion = calcularClasificacion(
    teams.map((t) => ({ id: t.id })),
    fixtures,
    results,
    hastaJornada
  );
  const posicionPorEquipoId = new Map(clasificacion.map((fila, i) => [fila.team.id, i + 1]));

  const wishlistFiltrada = {};
  for (const [teamId, opciones] of Object.entries(wishlistPorEquipo)) {
    wishlistFiltrada[teamId] = opciones.map((p) => (p && !excluidos.has(p) ? p : null));
  }

  const equiposParaPriorizar = teams.map((t) => ({
    teamId: t.id,
    fichoJornadaAnterior: fichoAnteriorSet.has(t.id),
    posicion: posicionPorEquipoId.get(t.id) ?? teams.length,
  }));

  const priorizados = priorizarEquipos(equiposParaPriorizar);
  return { asignaciones: asignarFichajes(priorizados, wishlistFiltrada), teams };
}

/**
 * Avisa del resultado de una ventana de fichajes: push a cada equipo (un
 * fallo no debe tirar el cálculo en sí) y mensaje al grupo de Telegram.
 * Solo se llama la primera vez que se calcula una ventana, así que no se
 * repite.
 *
 * @param {{ jornadaCaraACara: number }} ronda
 * @param {Array<{ teamId: string, player: string }>} asignaciones
 * @param {Array<{ id: string, name: string }>} teams
 * @param {boolean} esExtra
 */
export async function avisarVentanaResuelta(ronda, asignaciones, teams, esExtra = false) {
  // Primero el grupo de Telegram: es lo que más se echa en falta si algo
  // falla, y no depende de cuántos dispositivos haya que avisar por push.
  await avisarFichajesResueltos(ronda, asignaciones, teams, esExtra);

  try {
    const jugadorPorEquipo = new Map(asignaciones.map((a) => [a.teamId, a.player]));
    await Promise.all(
      teams.map((t) => {
        const jugador = jugadorPorEquipo.get(t.id);
        return enviarPushEquipo(t.id, {
          title: esExtra ? "Fichajes de la Ventana Extra resueltos" : "Fichajes resueltos",
          body: jugador
            ? `Te has llevado a ${jugador}`
            : esExtra
              ? "No has fichado a nadie en la Ventana Extra"
              : "No has fichado a nadie esta jornada",
          url: "/fichajes",
        });
      })
    );
  } catch (err) {
    console.warn("No se han podido mandar los avisos push de fichajes:", err);
  }

}

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

  const { data: wishlistRaw, error: wishlistError } = await supabase
    .from("team_wishlist")
    .select("team_id, player_1, player_2")
    .eq("round_id", ronda.id);
  if (wishlistError) throw wishlistError;

  const wishlistPorEquipo = {};
  for (const w of wishlistRaw) {
    wishlistPorEquipo[w.team_id] = [w.player_1, w.player_2];
  }

  const { asignaciones, teams } = await calcularAsignaciones({
    roundIdPrevio: rondaAnterior?.id ?? null,
    hastaJornada: ronda.jornadaCaraACara - 1,
    wishlistPorEquipo,
  });

  if (asignaciones.length > 0) {
    const { error: insertError } = await supabase
      .from("fichaje_assignments")
      .insert(asignaciones.map((a) => ({ round_id: ronda.id, team_id: a.teamId, player: a.player })));
    if (insertError) throw insertError;
  }

  // Esto solo se ejecuta la primera vez que se calculan los fichajes de
  // esta jornada (la siguiente vez, el early return de arriba ya no pasa
  // por aquí), así que nunca se manda dos veces el mismo aviso.
  await avisarVentanaResuelta(ronda, asignaciones, teams);

  return asignaciones.map((a) => ({ team_id: a.teamId, player: a.player }));
}

export function deadlinePasada(ronda) {
  return Boolean(ronda.fichajes_deadline) && new Date(ronda.fichajes_deadline) <= new Date();
}

const ZONA_HORA_TOPE = "Europe/Madrid";

/**
 * Instante UTC real que corresponde a año/mes/día + hora:minuto tal como
 * se leerían en un reloj de `zona` (con cambio de horario verano/invierno
 * ya resuelto). Hace falta porque el servidor (Vercel) corre en UTC, no
 * en hora de España — sin esto, "14:00" se guardaba tal cual como 14:00
 * UTC (16:00 en Madrid en verano), dos horas tarde.
 */
function horaLocalAFechaUTC(anio, mes, dia, horas, minutos, zona) {
  const comoSiFueraUTC = new Date(Date.UTC(anio, mes - 1, dia, horas, minutos));
  const enZona = new Date(comoSiFueraUTC.toLocaleString("en-US", { timeZone: zona }));
  const enUTC = new Date(comoSiFueraUTC.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = enZona.getTime() - enUTC.getTime();
  return new Date(comoSiFueraUTC.getTime() - offsetMs);
}

/**
 * Próxima ocurrencia de un día de la semana + hora EN HORA DE ESPAÑA,
 * estrictamente después de `desde` (nunca devuelve "ahora mismo" ni el
 * pasado). diaSemana usa el mismo criterio que Date#getDay(): 0 = domingo
 * ... 6 = sábado, tomando el día tal como cae en Madrid, no en el
 * servidor.
 */
export function calcularProximaHoraTope(diaSemana, horaStr, desde = new Date()) {
  const [horas, minutos] = horaStr.split(":").map(Number);

  const partesHoy = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA_HORA_TOPE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(desde)
      .map((p) => [p.type, p.value])
  );
  const hoyUTC = Date.UTC(Number(partesHoy.year), Number(partesHoy.month) - 1, Number(partesHoy.day));
  const diaSemanaHoy = new Date(hoyUTC).getUTCDay();

  const candidatoEnDia = (offsetDias) => {
    const d = new Date(hoyUTC + offsetDias * 86400000);
    return horaLocalAFechaUTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), horas, minutos, ZONA_HORA_TOPE);
  };

  let diasHastaObjetivo = (diaSemana - diaSemanaHoy + 7) % 7;
  let candidato = candidatoEnDia(diasHastaObjetivo);

  if (candidato <= desde) {
    candidato = candidatoEnDia(diasHastaObjetivo + 7);
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
