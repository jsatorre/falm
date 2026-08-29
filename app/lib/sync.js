import { supabase } from "./supabaseServer";
import { getAllTeamsRoundPoints, getSeasonRounds } from "./integrations/biwenger";

/**
 * El estado de cada jornada (pendiente/cerrada) viene del calendario
 * público de Biwenger — hay que refrescarlo en cada sync, si no se queda
 * congelado en lo que fuera cuando se sembró la base de datos y la
 * pantalla "en directo" no avanza nunca de jornada aunque pasen semanas.
 */
// Biwenger habla de "pending"/"active"/"finished"; nuestra columna admite
// "pending"/"live"/"finished" — hay que traducir, no copiar tal cual (un
// valor que no encaje revienta el CHECK y, como este paso va antes que la
// sincronización de puntos, se llevaba por delante el sync entero).
const ESTADO_BIWENGER_A_NUESTRO = {
  pending: "pending",
  active: "live",
  finished: "finished",
};

async function syncEstadosDeJornada() {
  const [seasonRounds, { data: rounds, error }] = await Promise.all([
    getSeasonRounds(),
    supabase.from("rounds").select("id, biwenger_round_id, status"),
  ]);
  if (error) throw error;

  const estadoPorBiwengerId = new Map(seasonRounds.map((r) => [String(r.id), r.status]));
  const cambios = rounds
    .map((r) => {
      const estadoBiwenger = estadoPorBiwengerId.get(String(r.biwenger_round_id));
      const nuevo = ESTADO_BIWENGER_A_NUESTRO[estadoBiwenger];
      return nuevo && nuevo !== r.status ? { id: r.id, status: nuevo } : null;
    })
    .filter(Boolean);

  for (const cambio of cambios) {
    // Un fallo puntual en una jornada no debe abortar el resto del sync
    // (puntos incluidos) — se registra y se sigue con las demás.
    const { error: updateError } = await supabase
      .from("rounds")
      .update({ status: cambio.status })
      .eq("id", cambio.id);
    if (updateError) console.error(`No se ha podido actualizar el estado de la ronda ${cambio.id}:`, updateError);
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

// Cache en memoria del proceso, compartida por /api/live y por la carga
// inicial de la página "en directo". Cada sync son 12 llamadas a Biwenger
// (una por equipo) en paralelo, así que este minuto de margen es también
// el "cooldown" compartido del botón de actualizar en el cliente: da igual
// quién lo pulse o cuántos amigos tengan la pantalla abierta a la vez, en
// esta ventana de 60s solo se dispara una sincronización real.
const CACHE_MS = 60000;
let cache = null; // { ts, promise }

export function syncBiwengerResultsCached() {
  const ahora = Date.now();
  if (!cache || ahora - cache.ts > CACHE_MS) {
    cache = { ts: ahora, promise: syncBiwengerResults() };
  }
  return cache.promise;
}

// Para que el cliente sepa cuánto falta hasta que un refresco manual vaya
// a disparar una llamada real (en vez de servir el mismo caché de otro).
export function ultimaSincronizacion() {
  return cache?.ts ?? null;
}
