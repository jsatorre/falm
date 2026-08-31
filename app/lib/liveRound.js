import { supabase } from "./supabaseServer";
import { getCaraACaraRounds, elegirRondaEnDirecto } from "./caraACaraRounds";
import {
  calcularClasificacion,
  elegirPartidoDestacado,
  elegirPartidoPorHistorial,
  formatearMotivoDestacado,
} from "./scoring";

/**
 * Snapshot de la jornada cara a cara "en directo" (la próxima no cerrada,
 * o la última si la temporada ya terminó sus 22 jornadas): equipos,
 * puntos Biwenger actuales de cada uno, y cuál es el "Partido de la
 * Jornada" según la clasificación que había ANTES de empezar esa jornada
 * más el peso del palmarés histórico. No sincroniza con Biwenger — eso lo
 * hace quien llame a esto primero (ver app/lib/sync.js).
 */
export async function getRondaEnDirecto() {
  const rounds = await getCaraACaraRounds();
  const ronda = elegirRondaEnDirecto(rounds);
  if (!ronda) return { jornada: null, fixtures: [] };

  const [
    { data: fixturesRonda },
    { data: resultsRonda },
    { data: teams },
    { data: todosFixturesRaw },
    { data: todosResultsRaw },
    { data: trophies },
  ] = await Promise.all([
    supabase.from("fixtures").select("team_a_id, team_b_id").eq("round_id", ronda.id),
    supabase.from("round_results").select("team_id, biwenger_points").eq("round_id", ronda.id),
    supabase.from("teams").select("id, name, crest_url"),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
    supabase.from("trophies").select("season_label, competition, champion_team_id"),
  ]);

  const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const puntosPorEquipo = Object.fromEntries(resultsRonda.map((r) => [r.team_id, r.biwenger_points]));

  const fixtures = fixturesRonda.map((f) => ({
    teamAId: f.team_a_id,
    teamBId: f.team_b_id,
    teamA: equipoPorId[f.team_a_id],
    teamB: equipoPorId[f.team_b_id],
    pointsA: puntosPorEquipo[f.team_a_id] ?? null,
    pointsB: puntosPorEquipo[f.team_b_id] ?? null,
  }));

  marcarPartidoDestacado(fixtures, ronda, rounds, teams, todosFixturesRaw, todosResultsRaw, trophies);

  return { jornada: ronda.jornadaCaraACara, status: ronda.status, fixtures };
}

// Cuántos títulos (Liga + Sudden Death League) tiene cada equipo ACTUAL en
// el palmarés, y si es el campeón de LIGA vigente (temporada más reciente
// registrada) — solo Liga, porque la Sudden Death League no se juega en
// paralelo a esta liga cara a cara y "defender" ese título aquí no
// tendría sentido; los títulos de Sudden sí cuentan para el peso
// histórico general (rivalidad/prestigio). Solo cuentan títulos ya
// enlazados a un equipo actual (champion_team_id) — los de equipos de
// temporadas pasadas que ya no existen no aportan peso a ningún cruce de
// hoy.
function construirHistorial(trophies) {
  const conEquipoActual = trophies.filter((t) => t.champion_team_id);
  if (conEquipoActual.length === 0) return new Map();

  const temporadaMasReciente = conEquipoActual.reduce(
    (max, t) => (t.season_label > max ? t.season_label : max),
    conEquipoActual[0].season_label
  );

  const historial = new Map();
  for (const t of conEquipoActual) {
    const actual = historial.get(t.champion_team_id) ?? { titulos: 0, campeonVigenteLiga: false };
    actual.titulos += 1;
    if (t.season_label === temporadaMasReciente && t.competition === "liga") {
      actual.campeonVigenteLiga = true;
    }
    historial.set(t.champion_team_id, actual);
  }
  return historial;
}

// Calcula la clasificación tal y como estaba justo antes de esta jornada
// (jornadaCaraACara - 1) y, junto con el palmarés histórico, decide qué
// cruce de la jornada en directo es el "Partido de la Jornada" (ver
// scoring.js). Marca el fixture elegido in-place con { destacado, motivo }.
function marcarPartidoDestacado(fixtures, ronda, rounds, teams, todosFixturesRaw, todosResultsRaw, trophies) {
  const historial = construirHistorial(trophies);
  const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));

  function marcar(elegido) {
    if (!elegido) return;
    const fixture = fixtures[elegido.index];
    fixture.destacado = true;
    fixture.motivo = formatearMotivoDestacado(elegido, {
      nombreA: equipoPorId[fixture.teamAId]?.name ?? "",
      nombreB: equipoPorId[fixture.teamBId]?.name ?? "",
    });
  }

  if (ronda.jornadaCaraACara <= 1) {
    // Todavía no hay clasificación de esta temporada — solo el palmarés
    // puede justificar un destacado (campeón vigente / clásico).
    marcar(elegirPartidoPorHistorial(fixtures, historial));
    return;
  }

  const jornadaPorRoundId = new Map(rounds.map((r) => [r.id, r.jornadaCaraACara]));

  const todosFixtures = todosFixturesRaw
    .filter((f) => jornadaPorRoundId.has(f.round_id))
    .map((f) => ({
      roundId: f.round_id,
      jornada: jornadaPorRoundId.get(f.round_id),
      teamAId: f.team_a_id,
      teamBId: f.team_b_id,
    }));

  const todosResults = {};
  for (const r of todosResultsRaw) {
    todosResults[r.round_id] ??= {};
    todosResults[r.round_id][r.team_id] = r.biwenger_points;
  }

  const equipos = teams.map((t) => ({ id: t.id, name: t.name, crestUrl: t.crest_url }));
  const clasificacionPrevia = calcularClasificacion(
    equipos,
    todosFixtures,
    todosResults,
    ronda.jornadaCaraACara - 1
  );
  const posicionPorEquipoId = new Map(clasificacionPrevia.map((fila, i) => [fila.team.id, i + 1]));

  marcar(elegirPartidoDestacado(fixtures, posicionPorEquipoId, historial));
}
