import { supabase } from "./supabaseServer";
import { getCaraACaraRounds } from "./caraACaraRounds";

/**
 * Snapshot de la jornada cara a cara "en directo" (la próxima no cerrada,
 * o la última si la temporada ya terminó sus 22 jornadas): equipos,
 * puntos Biwenger actuales de cada uno. No sincroniza con Biwenger — eso
 * lo hace quien llame a esto primero (ver app/lib/sync.js).
 */
export async function getRondaEnDirecto() {
  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status !== "finished") ?? rounds.at(-1) ?? null;
  if (!ronda) return { jornada: null, fixtures: [] };

  const [{ data: fixturesRaw }, { data: resultsRaw }, { data: teams }] = await Promise.all([
    supabase.from("fixtures").select("team_a_id, team_b_id").eq("round_id", ronda.id),
    supabase.from("round_results").select("team_id, biwenger_points").eq("round_id", ronda.id),
    supabase.from("teams").select("id, name, crest_url"),
  ]);

  const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const puntosPorEquipo = Object.fromEntries(resultsRaw.map((r) => [r.team_id, r.biwenger_points]));

  const fixtures = fixturesRaw.map((f) => ({
    teamA: equipoPorId[f.team_a_id],
    teamB: equipoPorId[f.team_b_id],
    pointsA: puntosPorEquipo[f.team_a_id] ?? null,
    pointsB: puntosPorEquipo[f.team_b_id] ?? null,
  }));

  return { jornada: ronda.jornadaCaraACara, status: ronda.status, fixtures };
}
