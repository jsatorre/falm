// Algoritmo de prioridades de fichajes, portado de
// `asignarFichajesConPrioridades` del Apps Script. Puro: recibe el estado
// de los equipos y sus wishlists (2 jugadores por equipo, en orden de
// preferencia) y devuelve quién ficha a quién.

/**
 * Ordena los equipos por prioridad de fichaje: primero quien NO fichó la
 * semana pasada, y entre esos (o entre los que sí ficharon), el peor
 * clasificado tiene preferencia.
 *
 * @param {Array<{teamId: string, fichoJornadaAnterior: boolean, posicion: number}>} equipos
 */
export function priorizarEquipos(equipos) {
  return [...equipos].sort((a, b) => {
    if (a.fichoJornadaAnterior !== b.fichoJornadaAnterior) {
      return Number(a.fichoJornadaAnterior) - Number(b.fichoJornadaAnterior);
    }
    return b.posicion - a.posicion; // peor clasificado (número más alto) primero
  });
}

/**
 * Recorre los equipos en orden de prioridad y les asigna su primera opción
 * de wishlist libre; si ya se la ha llevado otro equipo con más prioridad,
 * prueba con la segunda opción.
 *
 * @param {Array<{teamId: string}>} equiposPriorizados  ya ordenados por priorizarEquipos
 * @param {Record<string, [string|null, string|null]>} wishlists  teamId -> [jugador1, jugador2]
 * @returns {Array<{teamId: string, player: string}>}
 */
export function asignarFichajes(equiposPriorizados, wishlists) {
  const jugadoresAsignados = new Set();
  const asignaciones = [];

  for (const equipo of equiposPriorizados) {
    const [player1, player2] = wishlists[equipo.teamId] ?? [];

    if (player1 && !jugadoresAsignados.has(player1)) {
      jugadoresAsignados.add(player1);
      asignaciones.push({ teamId: equipo.teamId, player: player1 });
    } else if (player2 && !jugadoresAsignados.has(player2)) {
      jugadoresAsignados.add(player2);
      asignaciones.push({ teamId: equipo.teamId, player: player2 });
    }
  }

  return asignaciones;
}
