import { supabase } from "./supabaseServer";
import { getCaraACaraRounds } from "./caraACaraRounds";
import { calcularClasificacion, elegirPartidoDestacado } from "./scoring";

/**
 * Snapshot de la jornada cara a cara "en directo" (la próxima no cerrada,
 * o la última si la temporada ya terminó sus 22 jornadas): equipos,
 * puntos Biwenger actuales de cada uno, y cuál es el "Partido de la
 * Jornada" según la clasificación que había ANTES de empezar esa jornada.
 * No sincroniza con Biwenger — eso lo hace quien llame a esto primero (ver
 * app/lib/sync.js).
 */
export async function getRondaEnDirecto() {
  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status !== "finished") ?? rounds.at(-1) ?? null;
  if (!ronda) return { jornada: null, fixtures: [] };

  const [
    { data: fixturesRonda },
    { data: resultsRonda },
    { data: teams },
    { data: todosFixturesRaw },
    { data: todosResultsRaw },
  ] = await Promise.all([
    supabase.from("fixtures").select("team_a_id, team_b_id").eq("round_id", ronda.id),
    supabase.from("round_results").select("team_id, biwenger_points").eq("round_id", ronda.id),
    supabase.from("teams").select("id, name, crest_url"),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
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

  marcarPartidoDestacado(fixtures, ronda, rounds, teams, todosFixturesRaw, todosResultsRaw);

  return { jornada: ronda.jornadaCaraACara, status: ronda.status, fixtures };
}

// Calcula la clasificación tal y como estaba justo antes de esta jornada
// (jornadaCaraACara - 1) y usa esas posiciones para decidir qué cruce de
// la jornada en directo es el "Partido de la Jornada" (ver
// elegirPartidoDestacado en scoring.js). Marca el fixture elegido in-place
// con { destacado: true, motivo }.
function marcarPartidoDestacado(fixtures, ronda, rounds, teams, todosFixturesRaw, todosResultsRaw) {
  if (ronda.jornadaCaraACara <= 1) return; // nada que consultar todavía

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

  const elegido = elegirPartidoDestacado(fixtures, posicionPorEquipoId);
  if (elegido) {
    fixtures[elegido.index].destacado = true;
    fixtures[elegido.index].motivo = elegido.motivo;
  }
}
