import {
  getPlantilla,
  getAlineacionesPorJornada,
  getFichaJugador,
  getLeagueScoreId,
  fotoJugadorUrl,
} from "./integrations/biwenger";

const POSICION = {
  1: { codigo: "PT", nombre: "Portero" },
  2: { codigo: "DF", nombre: "Defensa" },
  3: { codigo: "MC", nombre: "Centrocampista" },
  4: { codigo: "DL", nombre: "Delantero" },
};

/**
 * Estadísticas de cada jugador de la plantilla de un equipo: una llamada
 * por jugador a Biwenger (además de la plantilla y las alineaciones), así
 * que esto NO es para consultar en cada refresco — se cachea aparte (ver
 * calcularEstadisticasEquipoCacheado).
 */
export async function calcularEstadisticasEquipo(biwengerTeamId) {
  const [plantilla, alineaciones, scoreId] = await Promise.all([
    getPlantilla(biwengerTeamId),
    getAlineacionesPorJornada(biwengerTeamId),
    getLeagueScoreId(),
  ]);

  return Promise.all(
    plantilla.map(async (ownership) => {
      const ficha = await getFichaJugador(ownership.id);
      return construirEstadisticasJugador(ficha, ownership, alineaciones, scoreId);
    })
  );
}

// Vuestra liga usa un sistema de puntuación "Personalizado" (scoreID 100 en
// Biwenger), que NO viene precalculado dentro de report.points (ese dict
// solo trae los sistemas estándar: 1 AS, 2 SofaScore, 3 Estadísticas...).
// Confirmado en el propio panel de Biwenger: Puntos Estadísticas (= score3
// de rawStats) + MVP*1 + Victoria*1. Si algún día cambiáis la fórmula desde
// Biwenger, esta función hay que actualizarla a mano.
function puntosSegunLiga(report, scoreId) {
  const directo = report.points?.[String(scoreId)];
  if (directo != null) return directo;

  const stats = report.rawStats ?? {};
  return (stats.score3 ?? 0) + (stats.mvp ? 1 : 0) + (stats.win ? 1 : 0);
}

function construirEstadisticasJugador(ficha, ownership, alineaciones, scoreId) {
  const reports = ficha.reports ?? [];
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

  for (const r of reports) {
    const stats = r.rawStats ?? {};
    const minutos = stats.minutesPlayed ?? 0;
    minutosTotal += minutos;
    if (minutos > 0) partidosJugados += 1;
    goles += stats.goals ?? 0;
    if (stats.mvp) mvps += 1;

    const fechaPartido = r.match?.date ?? 0;
    if (fechaPartido >= fechaFichaje) {
      const puntosRonda = puntosSegunLiga(r, scoreId);
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
    vecesTitularFalm,
    puntosTotales: puntosAprovechados + puntosDesperdiciados,
    puntosAprovechados,
    puntosDesperdiciados,
  };
}

// Cache en memoria del proceso por equipo. Esto no es como el marcador en
// vivo — la plantilla y sus partidos no cambian aunque no haya nadie
// jugando ahora mismo, así que no hace falta refrescarlo casi nunca; 30
// min es de sobra y evita llamadas a Biwenger innecesarias fuera de días
// de partido.
const CACHE_MS = 30 * 60 * 1000;
const cachePorEquipo = new Map(); // biwengerTeamId -> { ts, promise }

export function calcularEstadisticasEquipoCacheado(biwengerTeamId) {
  const ahora = Date.now();
  const entrada = cachePorEquipo.get(biwengerTeamId);
  if (!entrada || ahora - entrada.ts > CACHE_MS) {
    cachePorEquipo.set(biwengerTeamId, { ts: ahora, promise: calcularEstadisticasEquipo(biwengerTeamId) });
  }
  return cachePorEquipo.get(biwengerTeamId).promise;
}
