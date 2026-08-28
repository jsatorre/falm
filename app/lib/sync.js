import { supabase } from "./supabaseServer";
import { getAllTeamsRoundPoints, getSeasonRounds } from "./integrations/biwenger";

/**
 * El estado de cada jornada (pendiente/cerrada) viene del calendario
 * público de Biwenger — hay que refrescarlo en cada sync, si no se queda
 * congelado en lo que fuera cuando se sembró la base de datos y la
 * pantalla "en directo" no avanza nunca de jornada aunque pasen semanas.
 */
async function syncEstadosDeJornada() {
  const [seasonRounds, { data: rounds, error }] = await Promise.all([
    getSeasonRounds(),
    supabase.from("rounds").select("id, biwenger_round_id, status"),
  ]);
  if (error) throw error;

  const estadoPorBiwengerId = new Map(seasonRounds.map((r) => [String(r.id), r.status]));
  const cambios = rounds
    .filter((r) => {
      const nuevo = estadoPorBiwengerId.get(String(r.biwenger_round_id));
      return nuevo && nuevo !== r.status;
    })
    .map((r) => ({ id: r.id, status: estadoPorBiwengerId.get(String(r.biwenger_round_id)) }));

  for (const cambio of cambios) {
    const { error: updateError } = await supabase
      .from("rounds")
      .update({ status: cambio.status })
      .eq("id", cambio.id);
    if (updateError) throw updateError;
  }
}

/**
 * Trae de Biwenger los puntos de TODAS las jornadas para TODOS los
 * equipos (12 llamadas en paralelo, cada una ya trae el histórico
 * completo de esa "manager") y los vuelca en `round_results`, y de paso
 * refresca qué jornadas ha cerrado ya Biwenger. Se puede llamar tan a
 * menudo como haga falta — es upsert puro, idempotente.
 */
export async function syncBiwengerResults() {
  await syncEstadosDeJornada();

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
