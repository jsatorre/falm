import {
  getPlantilla,
  getAlineacionesPorJornada,
  getFichaJugador,
  getLeagueScoreId,
  fotoJugadorUrl,
  puntosPartido,
} from "./integrations/biwenger";
import { getCaraACaraRounds, elegirRondaEnDirecto } from "./caraACaraRounds";

const POSICION = {
  1: { codigo: "PT", nombre: "Portero" },
  2: { codigo: "DF", nombre: "Defensa" },
  3: { codigo: "MC", nombre: "Centrocampista" },
  4: { codigo: "DL", nombre: "Delantero" },
};

/**
 * IDs de jornada de Biwenger (biwenger_round_id) que cuentan para vuestra
 * liga cara a cara — las jornadas de Liga con enfrentamiento asignado
 * HASTA la que le toca ahora mismo al calendario (incluida), en su orden
 * natural. No basta con que Biwenger ya la marque "finished": un partido
 * adelantado de una jornada posterior (p.ej. la 6 jugándose antes que la 4
 * o la 5) no debe contar todavía — se cuenta junto con el resto de esa
 * misma jornada cuando le llegue el turno en el calendario cara a cara.
 * Ni la pretemporada de fichajes ni una jornada aplazada desde /admin
 * cuentan para ninguna estadística de Equipo — mismo criterio que
 * Clasificación/En directo.
 */
async function getJornadasLigaEnJuego() {
  const rounds = await getCaraACaraRounds();
  const actual = elegirRondaEnDirecto(rounds);
  if (!actual) return new Set();

  return new Set(
    rounds.filter((r) => r.jornada <= actual.jornada).map((r) => String(r.biwenger_round_id))
  );
}

/**
 * Estadísticas de cada jugador de la plantilla de un equipo, solo desde
 * que vuestra liga cara a cara está en marcha (ver getJornadasLigaEnJuego).
 * Una llamada por jugador a Biwenger (además de la plantilla y las
 * alineaciones), así que esto NO es para consultar en cada refresco — se
 * cachea aparte (ver calcularEstadisticasEquipoCacheado).
 */
export async function calcularEstadisticasEquipo(biwengerTeamId) {
  const [plantilla, alineacionesTodas, scoreId, jornadasEnJuego] = await Promise.all([
    getPlantilla(biwengerTeamId),
    getAlineacionesPorJornada(biwengerTeamId),
    getLeagueScoreId(),
    getJornadasLigaEnJuego(),
  ]);

  const alineaciones = alineacionesTodas.filter((a) => jornadasEnJuego.has(String(a.round?.id)));

  return Promise.all(
    plantilla.map(async (ownership) => {
      const ficha = await getFichaJugador(ownership.id);
      return construirEstadisticasJugador(ficha, ownership, alineaciones, scoreId, jornadasEnJuego);
    })
  );
}

function construirEstadisticasJugador(ficha, ownership, alineaciones, scoreId, jornadasEnJuego) {
  const todosLosReports = ficha.reports ?? [];
  const reports = todosLosReports.filter((r) => jornadasEnJuego.has(String(r.match?.round?.id)));
  const titularesPorRonda = new Map(alineaciones.map((a) => [a.round?.id, a.players ?? []]));
  // owner.date viene en epoch segundos, igual que match.date — comparables
  // directamente para saber si ya lo tenías fichado cuando se jugó ese partido.
  const fechaFichaje = ownership?.owner?.date ?? 0;

  let minutosTotal = 0;
  let partidosJugados = 0;
  let goles = 0;
  let mvps = 0;
  // "Puntos totales" es SOLO desde que lo fichaste (aprovechados +
  // desperdiciados) — no el total de toda la temporada de Biwenger, que
  // incluiría partidos jugados antes de ser tuyo.
  let puntosAprovechados = 0;
  let puntosDesperdiciados = 0;
  let jornadasEnEquipo = 0; // jornadas de FALM transcurridas desde que lo fichaste, haya jugado o no

  for (const r of reports) {
    const stats = r.rawStats ?? {};
    const minutos = stats.minutesPlayed ?? 0;
    minutosTotal += minutos;
    if (minutos > 0) partidosJugados += 1;
    goles += stats.goals ?? 0;
    if (stats.mvp) mvps += 1;

    const fechaPartido = r.match?.date ?? 0;
    if (fechaPartido >= fechaFichaje) {
      jornadasEnEquipo += 1;
      const puntosRonda = puntosPartido(r, scoreId);
      const titulares = titularesPorRonda.get(r.match?.round?.id) ?? [];
      if (titulares.includes(ficha.id)) {
        puntosAprovechados += puntosRonda;
      } else {
        puntosDesperdiciados += puntosRonda;
      }
    }
  }

  const vecesTitularFalm = alineaciones.filter((a) => (a.players ?? []).includes(ficha.id)).length;
  const posicion = POSICION[ficha.position] ?? { codigo: "?", nombre: "?" };

  return {
    id: ficha.id,
    nombre: ficha.name,
    posicionOrden: ficha.position ?? 99,
    posicionCodigo: posicion.codigo,
    posicion: posicion.nombre,
    club: ficha.team?.name ?? "?",
    disponible: ficha.status === "ok",
    precioFichaje: ownership?.owner?.price ?? null,
    foto: fotoJugadorUrl(ficha.id),
    partidosClub: reports.length,
    partidosJugados,
    minutosTotal,
    minutosMedia: partidosJugados > 0 ? minutosTotal / partidosJugados : 0,
    goles,
    mvps,
    jornadasEnEquipo,
    vecesTitularFalm,
    puntosTotales: puntosAprovechados + puntosDesperdiciados,
    puntosAprovechados,
    puntosDesperdiciados,
  };
}

// Cache en memoria del proceso por equipo. Esto no es como el marcador en
// vivo — la plantilla y sus partidos no cambian aunque no haya nadie
// jugando ahora mismo, así que no hace falta refrescarlo casi nunca; con
// 24h de sobra (como mucho una vez al día por equipo) evita llamadas a
// Biwenger innecesarias con la cuenta personal de Jaime.
const CACHE_MS = 24 * 60 * 60 * 1000;
const cachePorEquipo = new Map(); // biwengerTeamId -> { ts, promise }

export function calcularEstadisticasEquipoCacheado(biwengerTeamId) {
  const ahora = Date.now();
  const entrada = cachePorEquipo.get(biwengerTeamId);
  if (!entrada || ahora - entrada.ts > CACHE_MS) {
    cachePorEquipo.set(biwengerTeamId, { ts: ahora, promise: calcularEstadisticasEquipo(biwengerTeamId) });
  }
  return cachePorEquipo.get(biwengerTeamId).promise;
}
