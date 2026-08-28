// Motor de puntuación de la liga de amigos, portado del Apps Script original
// (`calcularPuntos` / `actualizarClasificacion`). Puro: sin I/O, para poder
// testearlo a mano y reutilizarlo igual en la UI, en una API route o en un
// script de sync.

// Puntos de un equipo en un enfrentamiento según la diferencia de puntos
// Biwenger frente a su rival esa jornada.
export function calcularPuntosEnfrentamiento(puntosEquipo, puntosRival) {
  const diferencia = puntosEquipo - puntosRival;

  if (diferencia >= 5) return 3;
  if (diferencia > 1) return 2; // 1 < diferencia < 5
  if (diferencia >= -1) return 1.5; // -1 <= diferencia <= 1
  if (diferencia > -5) return 1; // -5 < diferencia < -1
  return 0;
}

const fila = () => ({
  pts: 0,
  pj: 0,
  pg: 0, // ganados (3 pts)
  vm: 0, // "victoria mínima" (2 pts)
  pe: 0, // empate (1.5 pts)
  dm: 0, // "derrota mínima" (1 pt)
  pp: 0, // perdidos (0 pts)
  pf: 0, // puntos Biwenger a favor
  pc: 0, // puntos Biwenger en contra
  jg: 0, // jornadas ganadas (máximo individual de la jornada)
  partidos: [], // [{ jornada, puntos }] en el orden en que se van jugando, para la racha
});

/**
 * Calcula la clasificación a partir de los emparejamientos fijos de la
 * temporada y los puntos Biwenger conseguidos cada jornada, hasta (e
 * incluyendo) `hastaJornada` si se indica — así la clasificación "a fecha
 * de la jornada N" es solo filtrar, no una tabla aparte que hay que ir
 * copiando cada semana.
 *
 * @param {Array<{id, name, crestUrl}>} teams
 * @param {Array<{roundId, jornada, teamAId, teamBId}>} fixtures
 * @param {Record<string, Record<string, number>>} results  roundId -> teamId -> puntos Biwenger
 * @param {number} [hastaJornada]
 */
export function calcularClasificacion(teams, fixtures, results, hastaJornada) {
  const tabla = new Map(teams.map((t) => [t.id, { ...fila(), team: t }]));

  const fixturesAConsiderar = fixtures.filter(
    (f) => hastaJornada == null || f.jornada <= hastaJornada
  );

  // Primera pasada: puntos del enfrentamiento cara a cara.
  for (const f of fixturesAConsiderar) {
    const resultadosJornada = results[f.roundId];
    if (!resultadosJornada) continue;
    const ptsA = resultadosJornada[f.teamAId];
    const ptsB = resultadosJornada[f.teamBId];
    if (ptsA == null || ptsB == null) continue; // jornada sin cerrar todavía

    aplicarResultado(tabla, f.teamAId, ptsA, ptsB, f.jornada);
    aplicarResultado(tabla, f.teamBId, ptsB, ptsA, f.jornada);
  }

  // Segunda pasada: jornada ganada (JG) = mayor puntuación Biwenger
  // individual de esa jornada entre los equipos que jugaron.
  const jornadas = new Set(fixturesAConsiderar.map((f) => f.jornada));
  for (const jornada of jornadas) {
    const fixturesDeJornada = fixturesAConsiderar.filter((f) => f.jornada === jornada);
    let max = -Infinity;
    const puntosPorEquipo = [];
    for (const f of fixturesDeJornada) {
      const resultadosJornada = results[f.roundId];
      if (!resultadosJornada) continue;
      for (const teamId of [f.teamAId, f.teamBId]) {
        const pts = resultadosJornada[teamId];
        if (pts == null) continue;
        puntosPorEquipo.push({ teamId, pts });
        if (pts > max) max = pts;
      }
    }
    for (const { teamId, pts } of puntosPorEquipo) {
      if (pts === max) tabla.get(teamId).jg += 1;
    }
  }

  const filas = [...tabla.values()].map((r) => ({
    team: r.team,
    pts: r.pts,
    pj: r.pj,
    pg: r.pg,
    vm: r.vm,
    pe: r.pe,
    dm: r.dm,
    pp: r.pp,
    pf: r.pf,
    pc: r.pc,
    dp: r.pf - r.pc,
    mp: r.pj > 0 ? r.pf / r.pj : 0,
    jg: r.jg,
    racha: [...r.partidos]
      .sort((a, b) => a.jornada - b.jornada)
      .slice(-5)
      .map((p) => ({ categoria: p.puntos, valor: p.puntosAFavor })),
  }));

  filas.sort((a, b) => b.pts - a.pts || b.pf - a.pf);

  return filas;
}

function aplicarResultado(tabla, teamId, puntosAFavor, puntosEnContra, jornada) {
  const r = tabla.get(teamId);
  if (!r) return;
  const puntos = calcularPuntosEnfrentamiento(puntosAFavor, puntosEnContra);

  r.pts += puntos;
  r.pj += 1;
  r.pf += puntosAFavor;
  r.pc += puntosEnContra;
  r.partidos.push({ jornada, puntos, puntosAFavor });

  if (puntos === 3) r.pg += 1;
  else if (puntos === 2) r.vm += 1;
  else if (puntos === 1.5) r.pe += 1;
  else if (puntos === 1) r.dm += 1;
  else r.pp += 1;
}

/**
 * Calendario round-robin (método del círculo) para un número par de
 * equipos: `n - 1` jornadas, `n / 2` partidos por jornada, cada pareja se
 * enfrenta una vez.
 *
 * @param {Array<string>} teamIds
 * @returns {Array<{jornada: number, teamAId: string, teamBId: string}>}
 */
export function generarCalendarioRoundRobin(teamIds) {
  if (teamIds.length % 2 !== 0) {
    throw new Error("generarCalendarioRoundRobin necesita un número par de equipos");
  }

  const equipos = [...teamIds];
  const n = equipos.length;
  const fixtures = [];

  for (let jornada = 1; jornada <= n - 1; jornada++) {
    for (let i = 0; i < n / 2; i++) {
      const teamAId = equipos[i];
      const teamBId = equipos[n - 1 - i];
      fixtures.push({ jornada, teamAId, teamBId });
    }
    // Rotar todos menos el primero.
    equipos.splice(1, 0, equipos.pop());
  }

  return fixtures;
}

/**
 * Doble vuelta: el round-robin de arriba (ida) más una vuelta idéntica con
 * local/visitante invertidos (no afecta a la puntuación, que es simétrica,
 * pero mantiene la semántica de "ida y vuelta" de una liga de verdad).
 *
 * @param {Array<string>} teamIds
 * @returns {Array<{jornada: number, teamAId: string, teamBId: string}>}
 */
export function generarCalendarioDobleVuelta(teamIds) {
  const ida = generarCalendarioRoundRobin(teamIds);
  const jornadasIda = ida.at(-1).jornada;

  const vuelta = ida.map((f) => ({
    jornada: f.jornada + jornadasIda,
    teamAId: f.teamBId,
    teamBId: f.teamAId,
  }));

  return [...ida, ...vuelta];
}

const HISTORIAL_VACIO = { titulos: 0, campeonVigenteLiga: false };

/**
 * Elige el "Partido de la Jornada" entre los enfrentamientos de una
 * jornada, a partir de la clasificación ANTES de jugarse esa jornada (lo
 * que había en juego al pitar el inicio, no el resultado), más el peso
 * histórico del palmarés: si alguno de los dos es el campeón de Liga
 * vigente o entre los dos suman muchos títulos (de Liga o de la Sudden
 * Death League), el cruce sube en el ranking aunque no estén cerca en la
 * tabla esta temporada. Solo se mira el título de LIGA para "quién
 * defiende el trono" — la Sudden Death League no se juega en paralelo a
 * esta liga cara a cara, así que "defender" ese título aquí no tendría
 * sentido; sí suma como peso histórico general (rivalidad/prestigio).
 *
 * No arma el texto del motivo (para eso hace falta el nombre de los
 * equipos, que esto no conoce) — devuelve los datos crudos para que quien
 * llame construya la frase. Ver formatearMotivoDestacado.
 *
 * @param {Array<{teamAId: string, teamBId: string}>} fixturesDeJornada
 * @param {Map<string, number>} posicionPorEquipoId  1 = primero
 * @param {Map<string, {titulos: number, campeonVigenteLiga: boolean}>} [historial]
 * @returns {{ index: number, posA: number, posB: number, gap: number, totalEquipos: number, histA: object, histB: object } | null}
 */
export function elegirPartidoDestacado(fixturesDeJornada, posicionPorEquipoId, historial = new Map()) {
  const totalEquipos = posicionPorEquipoId.size;
  if (totalEquipos === 0) return null;

  let mejor = null;

  fixturesDeJornada.forEach((f, index) => {
    const posA = posicionPorEquipoId.get(f.teamAId);
    const posB = posicionPorEquipoId.get(f.teamBId);
    if (posA == null || posB == null) return;

    const histA = historial.get(f.teamAId) ?? HISTORIAL_VACIO;
    const histB = historial.get(f.teamBId) ?? HISTORIAL_VACIO;

    const gap = Math.abs(posA - posB);
    const bonusCampeon = puntosCampeon(histA) + puntosCampeon(histB);
    const pesoHistorico = (histA.titulos + histB.titulos) * 0.5;
    const importancia =
      (totalEquipos + 1 - posA) + (totalEquipos + 1 - posB) - gap * 0.5 + bonusCampeon + pesoHistorico;

    if (!mejor || importancia > mejor.importancia) {
      mejor = { index, importancia, posA, posB, gap, totalEquipos, histA, histB };
    }
  });

  return mejor;
}

/**
 * Variante para cuando no hay clasificación previa que consultar (jornada
 * 1 de la temporada): destaca un cruce solo si el palmarés da pie a ello
 * (campeón vigente o clásico entre laureados), nunca por posiciones.
 *
 * @param {Array<{teamAId: string, teamBId: string}>} fixturesDeJornada
 * @param {Map<string, {titulos: number, campeonVigenteLiga: boolean}>} historial
 * @returns {{ index: number, histA: object, histB: object } | null}
 */
export function elegirPartidoPorHistorial(fixturesDeJornada, historial) {
  let mejor = null;

  fixturesDeJornada.forEach((f, index) => {
    const histA = historial.get(f.teamAId) ?? HISTORIAL_VACIO;
    const histB = historial.get(f.teamBId) ?? HISTORIAL_VACIO;
    const puntuacion = puntosCampeon(histA) + puntosCampeon(histB) + (histA.titulos + histB.titulos) * 0.5;

    if (puntuacion > 0 && (!mejor || puntuacion > mejor.puntuacion)) {
      mejor = { index, puntuacion, histA, histB };
    }
  });

  return mejor;
}

function puntosCampeon(hist) {
  return hist.campeonVigenteLiga ? 5 : 0;
}

/**
 * Construye el texto del "Partido de la Jornada" a partir de lo que
 * devuelven elegirPartidoDestacado/elegirPartidoPorHistorial, con los
 * nombres reales de los equipos.
 *
 * @param {{ posA?: number, posB?: number, gap?: number, totalEquipos?: number, histA: object, histB: object }} elegido
 * @param {{ nombreA: string, nombreB: string }} nombres
 */
export function formatearMotivoDestacado(elegido, { nombreA, nombreB }) {
  const { histA, histB } = elegido;

  // Solo el título de LIGA cuenta como "defender el trono" — la Sudden
  // Death League no se juega en paralelo a esta liga cara a cara.
  if (histA.campeonVigenteLiga) return `${nombreA} defiende su título de Liga`;
  if (histB.campeonVigenteLiga) return `${nombreB} defiende su título de Liga`;
  if (histA.titulos + histB.titulos >= 5) {
    return "Clásico entre los más laureados de la liga";
  }

  const { posA, posB, gap, totalEquipos } = elegido;
  if (posA == null || posB == null) return "El cruce con más en juego de la jornada";
  if (posA <= 3 && posB <= 3) return "Choque de arriba de la tabla";
  if (gap === 1) return "Se juegan la posición directamente";
  if (posA >= totalEquipos - 2 && posB >= totalEquipos - 2) return "Duelo por no ser el farolillo rojo";
  return "El cruce con más en juego de la jornada";
}
