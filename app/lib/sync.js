import { supabase } from "./supabaseServer";
import { getAllTeamsRoundPoints, getSeasonRounds } from "./integrations/biwenger";
import { getCaraACaraRounds, elegirRondaEnDirecto } from "./caraACaraRounds";

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
    if (updateError) console.warn(`No se ha podido actualizar el estado de la ronda ${cambio.id}:`, updateError);
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
// (una por equipo) en paralelo, así que este margen es también el
// "cooldown" compartido del botón de actualizar en el cliente: da igual
// quién lo pulse o cuántos amigos tengan la pantalla abierta a la vez, en
// esa ventana solo se dispara una sincronización real.
//
// El margen no es fijo: si la jornada en directo está de verdad en juego
// ("live"), 60s para que se note ágil; si ya ha terminado (o todavía no ha
// empezado) los puntos no van a cambiar de un minuto para otro, así que no
// tiene sentido seguir preguntándole a Biwenger cada vez que alguien entra
// — con 20 min de sobra (el auto-refresco del cliente es cada 15 min).
const CACHE_MS_LIVE = 60000;
const CACHE_MS_INACTIVA = 20 * 60 * 1000;
let cache = null; // { ts, promise }

async function margenActual() {
  try {
    const rounds = await getCaraACaraRounds();
    const ronda = elegirRondaEnDirecto(rounds);
    return ronda?.status === "live" ? CACHE_MS_LIVE : CACHE_MS_INACTIVA;
  } catch {
    return CACHE_MS_LIVE; // si esta comprobación falla, mejor pecar de refrescar de más que de menos
  }
}

export async function syncBiwengerResultsCached() {
  const ahora = Date.now();
  const margen = await margenActual();
  if (!cache || ahora - cache.ts > margen) {
    cache = { ts: ahora, promise: syncBiwengerResults() };
  }
  return cache.promise;
}

// Para que el cliente sepa cuánto falta hasta que un refresco manual vaya
// a disparar una llamada real (en vez de servir el mismo caché de otro).
export function ultimaSincronizacion() {
  return cache?.ts ?? null;
}
