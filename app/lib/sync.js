import { supabase } from "./supabaseServer";
import { getAllTeamsRoundPoints } from "./integrations/biwenger";

/**
 * Trae de Biwenger los puntos de TODAS las jornadas para TODOS los
 * equipos (12 llamadas en paralelo, cada una ya trae el histórico
 * completo de esa "manager") y los vuelca en `round_results`. Se puede
 * llamar tan a menudo como haga falta — es upsert puro, idempotente.
 */
export async function syncBiwengerResults() {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, biwenger_user_id");
  if (teamsError) throw teamsError;

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, biwenger_round_id");
  if (roundsError) throw roundsError;

  const roundIdPorBiwengerId = new Map(rounds.map((r) => [String(r.biwenger_round_id), r.id]));

  const puntosPorJornadaBiwenger = await getAllTeamsRoundPoints(teams.map((t) => t.biwenger_user_id));

  const filas = [];
  for (const [biwengerRoundId, puntosPorEquipoBiwenger] of Object.entries(puntosPorJornadaBiwenger)) {
    const roundId = roundIdPorBiwengerId.get(String(biwengerRoundId));
    if (!roundId) continue; // jornada de Biwenger fuera de nuestro calendario (p.ej. de otra fase)

    for (const team of teams) {
      const puntos = puntosPorEquipoBiwenger[team.biwenger_user_id];
      if (puntos == null) continue;
      filas.push({
        round_id: roundId,
        team_id: team.id,
        biwenger_points: puntos,
        synced_at: new Date().toISOString(),
      });
    }
  }

  if (filas.length === 0) return { synced: 0 };

  const { error: upsertError } = await supabase
    .from("round_results")
    .upsert(filas, { onConflict: "round_id,team_id" });
  if (upsertError) throw upsertError;

  return { synced: filas.length };
}

// Cache corta en memoria del proceso, compartida por /api/live y por la
// carga inicial de la página "en directo" — si varios amigos entran a la
// vez no se multiplican las llamadas a Biwenger.
const CACHE_MS = 15000;
let cache = null; // { ts, promise }

export function syncBiwengerResultsCached() {
  const ahora = Date.now();
  if (!cache || ahora - cache.ts > CACHE_MS) {
    cache = { ts: ahora, promise: syncBiwengerResults() };
  }
  return cache.promise;
}
