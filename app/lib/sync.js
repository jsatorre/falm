import { supabase } from "./supabaseServer";
import { getHistoricalRoundPoints, getLiveRoundPoints, getSeasonData, getLeagueScoreId } from "./integrations/biwenger";
import { getCaraACaraRounds, elegirRondaEnDirecto } from "./caraACaraRounds";

// El histórico de jornadas ya cerradas (12 llamadas a tu cuenta) casi
// nunca cambia una vez cerrada la jornada — repetirlo cada 60s como la
// ronda en directo sería tirar peticiones a la basura. Con refrescarlo
// cada 20 min sobra para pillar el número oficial de Biwenger si alguna
// vez lo corrige a posteriori.
const HISTORICO_CACHE_MS = 20 * 60 * 1000;
let historicoCache = null; // { ts, promise }

function getHistoricoCacheado(teamIds) {
  const ahora = Date.now();
  if (!historicoCache || ahora - historicoCache.ts > HISTORICO_CACHE_MS) {
    historicoCache = { ts: ahora, promise: getHistoricalRoundPoints(teamIds) };
  }
  return historicoCache.promise;
}

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

async function syncEstadosDeJornada(seasonRounds) {
  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("id, biwenger_round_id, status");
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
 * equipos y los vuelca en `round_results`, y de paso refresca qué
 * jornadas ha cerrado ya Biwenger. Dos fuentes distintas, cada una con su
 * propio ritmo:
 * - Histórico de jornadas ya cerradas: 12 llamadas a tu cuenta, pero con
 *   caché de 20 min (ver getHistoricoCacheado) — casi nunca cambia.
 * - Jornada en directo: se recalcula cada vez que se llama a esto (1
 *   llamada a tu cuenta + fichas públicas gratis) — es la única que de
 *   verdad necesita frescura.
 *
 * El estado de las jornadas (pending/live/finished) se refresca SIEMPRE —
 * es una única llamada pública, gratis, no toca tu cuenta. Pero todo lo
 * demás (histórico + en directo) solo se hace si Biwenger dice que hay
 * algún partido en juego ahora mismo (`activeEvents`): fuera de esas
 * horas no hay puntos nuevos que traer, así que no tiene sentido gastar tu
 * cuota. Como la comprobación gratuita se hace en cada llamada, en cuanto
 * arranca un partido se detecta de inmediato — no hay ninguna ventana en la
 * que nos podamos "perder" el inicio de una jornada.
 */
export async function syncBiwengerResults() {
  const { rounds: seasonRounds, hayPartidosEnJuego } = await getSeasonData();
  await syncEstadosDeJornada(seasonRounds);

  if (!hayPartidosEnJuego) return { synced: 0, motivo: "sin partidos en juego" };

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, biwenger_user_id");
  if (teamsError) throw teamsError;

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, biwenger_round_id");
  if (roundsError) throw roundsError;

  const roundIdPorBiwengerId = new Map(rounds.map((r) => [String(r.biwenger_round_id), r.id]));
  const teamIds = teams.map((t) => t.biwenger_user_id);

  // Histórico de jornadas ya cerradas — 12 llamadas, pero con su propia
  // caché larga (ver getHistoricoCacheado), no se repiten en cada ciclo.
  const puntosPorJornadaBiwenger = await getHistoricoCacheado(teamIds);

  // Un Map por "round_id:team_id" en vez de un array — así, si alguna vez
  // el histórico y el cálculo en vivo coincidieran en la misma ronda (no
  // debería, pero mejor no arriesgarse), el segundo valor simplemente pisa
  // al primero en vez de mandar la misma clave dos veces en el mismo
  // upsert (eso sí revienta, Postgres no admite tocar la misma fila dos
  // veces en un solo ON CONFLICT).
  const filasPorClave = new Map();
  function anotarFila(roundId, teamId, puntos, jugadoresEnVivo = null) {
    if (puntos == null) return;
    filasPorClave.set(`${roundId}:${teamId}`, {
      round_id: roundId,
      team_id: teamId,
      biwenger_points: puntos,
      jugadores_en_vivo: jugadoresEnVivo,
      synced_at: new Date().toISOString(),
    });
  }

  for (const [biwengerRoundId, puntosPorEquipoBiwenger] of Object.entries(puntosPorJornadaBiwenger)) {
    const roundId = roundIdPorBiwengerId.get(String(biwengerRoundId));
    if (!roundId) continue; // jornada de Biwenger fuera de nuestro calendario (p.ej. de otra fase)

    for (const team of teams) {
      // Sin desglose por jugador para el histórico ya cerrado (jugadores_en_vivo
      // a null) — así no se queda un desglose obsoleto de cuando esta
      // ronda todavía era "la de en directo".
      anotarFila(roundId, team.id, puntosPorEquipoBiwenger[team.biwenger_user_id]);
    }
  }

  // La jornada "en directo" del calendario cara a cara: sus puntos no se
  // fían del campo oficial de Biwenger (no lo rellena hasta cerrar la
  // jornada ENTERA, aunque partidos sueltos ya hayan terminado) — se
  // calculan en vivo cada ciclo (barato: 1 llamada a tu cuenta + fichas
  // públicas gratis), pisando lo que traiga el histórico para esa ronda
  // concreta (que ahí vendría vacío de todas formas mientras siga abierta).
  const caraACaraRounds = await getCaraACaraRounds();
  const rondaEnDirecto = elegirRondaEnDirecto(caraACaraRounds);
  if (rondaEnDirecto) {
    const roundId = roundIdPorBiwengerId.get(String(rondaEnDirecto.biwenger_round_id));
    const scoreId = await getLeagueScoreId();
    const puntosEnVivo = await getLiveRoundPoints(rondaEnDirecto.biwenger_round_id, scoreId);

    if (roundId && puntosEnVivo) {
      for (const team of teams) {
        const datos = puntosEnVivo.get(String(team.biwenger_user_id));
        anotarFila(roundId, team.id, datos?.total, datos?.jugadores ?? null);
      }
    }
  }

  const filas = [...filasPorClave.values()];

  if (filas.length === 0) return { synced: 0 };

  const { error: upsertError } = await supabase
    .from("round_results")
    .upsert(filas, { onConflict: "round_id,team_id" });
  if (upsertError) throw upsertError;

  return { synced: filas.length };
}

// Cache en memoria del proceso, compartida por /api/live y por la carga
// inicial de la página "en directo". Margen fijo y corto: da igual cuántos
// amigos tengan la pantalla abierta a la vez, en esa ventana solo se
// dispara una llamada real — y esa llamada, internamente, ya decide sola
// (vía activeEvents, gratis) si merece la pena gastar las 12 peticiones
// caras o no (ver syncBiwengerResults). Por eso no hace falta alargar este
// margen cuando no hay nada en juego: la parte cara ya se salta sola.
const CACHE_MS = 60000;
let cache = null; // { ts, promise }

export async function syncBiwengerResultsCached() {
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
