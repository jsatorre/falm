import { getPlantilla, getAlineacionesPorJornada, getFichaJugador, fotoJugadorUrl } from "./integrations/biwenger";

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
  const [plantilla, alineaciones] = await Promise.all([
    getPlantilla(biwengerTeamId),
    getAlineacionesPorJornada(biwengerTeamId),
  ]);

  return Promise.all(
    plantilla.map(async (ownership) => {
      const ficha = await getFichaJugador(ownership.id);
      return construirEstadisticasJugador(ficha, ownership, alineaciones);
    })
  );
}

function construirEstadisticasJugador(ficha, ownership, alineaciones) {
  const reports = ficha.reports ?? [];

  let minutosTotal = 0;
  let partidosJugados = 0;
  let goles = 0;
  let mvps = 0;

  for (const r of reports) {
    const stats = r.rawStats ?? {};
    const minutos = stats.minutesPlayed ?? 0;
    minutosTotal += minutos;
    if (minutos > 0) partidosJugados += 1;
    goles += stats.goals ?? 0;
    if (stats.mvp) mvps += 1;
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
    valor: ficha.price ?? null,
    precioFichaje: ownership?.owner?.price ?? null,
    foto: fotoJugadorUrl(ficha.id),
    partidosClub: reports.length,
    partidosJugados,
    minutosTotal,
    minutosMedia: partidosJugados > 0 ? minutosTotal / partidosJugados : 0,
    goles,
    mvps,
    vecesTitularFalm,
  };
}

// Cache en memoria del proceso por equipo — la plantilla y sus partidos no
// cambian segundo a segundo, así que un TTL de varios minutos evita
// machacar Biwenger con una llamada por jugador cada vez que alguien mira
// su pestaña Equipo.
const CACHE_MS = 5 * 60 * 1000;
const cachePorEquipo = new Map(); // biwengerTeamId -> { ts, promise }

export function calcularEstadisticasEquipoCacheado(biwengerTeamId) {
  const ahora = Date.now();
  const entrada = cachePorEquipo.get(biwengerTeamId);
  if (!entrada || ahora - entrada.ts > CACHE_MS) {
    cachePorEquipo.set(biwengerTeamId, { ts: ahora, promise: calcularEstadisticasEquipo(biwengerTeamId) });
  }
  return cachePorEquipo.get(biwengerTeamId).promise;
}
