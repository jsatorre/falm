// Premios en metálico y liquidación final ("quién le debe a quién"). Puro,
// sin I/O — reutiliza calcularClasificacion/ganadoresPorJornada de
// scoring.js para no duplicar las reglas de la liga (el mismo criterio de
// reparto en empates que ya usa JG se aplica también al premio por
// jornada).

import { calcularClasificacion, ganadoresPorJornada } from "./scoring";

/**
 * Bote total: cuota por equipo × equipos que participan (los que no
 * quieren jugarse dinero ni ponen ni pueden ganar nada).
 *
 * @param {Array<{id, participaDinero}>} teams
 * @param {number} cuotaPorEquipo
 */
export function calcularBote(teams, cuotaPorEquipo) {
  const participantes = teams.filter((t) => t.participaDinero);
  return { total: participantes.length * cuotaPorEquipo, equiposParticipantes: participantes.length };
}

/**
 * En cuántas jornadas se divide cada vuelta de una temporada de doble
 * vuelta con `n` equipos (round-robin: n-1 jornadas por vuelta). Vuelta 1 =
 * jornadas 1..n-1, vuelta 2 = jornadas n..2(n-1).
 *
 * @param {number} numEquipos
 * @returns {Array<{numero: number, desde: number, hasta: number}>}
 */
export function jornadasPorVuelta(numEquipos) {
  const jornadasPorVuelta = Math.max(numEquipos - 1, 0);
  if (jornadasPorVuelta === 0) return [];
  return [
    { numero: 1, desde: 1, hasta: jornadasPorVuelta },
    { numero: 2, desde: jornadasPorVuelta + 1, hasta: jornadasPorVuelta * 2 },
  ];
}

/**
 * Cuánto ha ganado cada equipo participante en premios, con el desglose
 * por concepto — a partir de la clasificación actual (Liga), los
 * ganadores de cada jornada y de cada vuelta, y (a mano, ver /admin) el
 * campeón/subcampeón de la Sudden, que esta app no rastrea.
 *
 * @param {Array<{id, name, participaDinero}>} teams
 * @param {Array<{roundId, jornada, teamAId, teamBId}>} fixtures
 * @param {Record<string, Record<string, number>>} results
 * @param {{ ligaCampeon: number, ligaSubcampeon: number, suddenCampeon: number, suddenSubcampeon: number, jornada: number, vuelta: number }} importes  en €
 * @param {{ campeonTeamId: string|null, subcampeonTeamId: string|null }} sudden
 */
export function calcularGanancias(teams, fixtures, results, importes, sudden) {
  const participantes = new Set(teams.filter((t) => t.participaDinero).map((t) => t.id));
  const ganancias = new Map(teams.map((t) => [t.id, { total: 0, desglose: [] }]));

  function sumar(teamId, concepto, importe) {
    if (!teamId || !importe || !participantes.has(teamId)) return;
    const g = ganancias.get(teamId);
    g.total += importe;
    g.desglose.push({ concepto, importe });
  }

  // Campeón / subcampeón de Liga — clasificación completa actual (si la
  // temporada no ha terminado, es el "campeón a día de hoy").
  const clasificacionLiga = calcularClasificacion(teams, fixtures, results);
  if (clasificacionLiga[0]) sumar(clasificacionLiga[0].team.id, "Campeón de Liga", importes.ligaCampeon);
  if (clasificacionLiga[1]) sumar(clasificacionLiga[1].team.id, "Subcampeón de Liga", importes.ligaSubcampeon);

  // Sudden — no se juega en esta app, se fija a mano desde /admin.
  sumar(sudden?.campeonTeamId, "Campeón de Sudden", importes.suddenCampeon);
  sumar(sudden?.subcampeonTeamId, "Subcampeón de Sudden", importes.suddenSubcampeon);

  // Premio por jornada — mismo reparto por empate que la columna JG.
  for (const [jornada, ganadores] of ganadoresPorJornada(fixtures, results)) {
    for (const { teamId, parte } of ganadores) {
      sumar(teamId, `Jornada ${jornada}`, importes.jornada * parte);
    }
  }

  // Premio por vuelta — clasificación acotada a los partidos de esa vuelta.
  for (const vuelta of jornadasPorVuelta(teams.length)) {
    const clasificacionVuelta = calcularClasificacion(teams, fixtures, results, vuelta.hasta, vuelta.desde);
    if (clasificacionVuelta[0]?.pj > 0) {
      sumar(clasificacionVuelta[0].team.id, `Vuelta ${vuelta.numero}`, importes.vuelta);
    }
  }

  return ganancias;
}

/**
 * Saldo neto de cada equipo participante: lo ganado en premios menos la
 * cuota que puso. Positivo = le deben, negativo = debe.
 *
 * @param {Array<{id, name, participaDinero}>} teams
 * @param {Map<string, {total: number, desglose: Array}>} ganancias
 * @param {number} cuotaPorEquipo
 */
export function calcularSaldos(teams, ganancias, cuotaPorEquipo) {
  return teams
    .filter((t) => t.participaDinero)
    .map((t) => {
      const ganado = ganancias.get(t.id)?.total ?? 0;
      const saldo = Math.round((ganado - cuotaPorEquipo) * 100) / 100;
      return { team: t, ganado, puesto: cuotaPorEquipo, saldo, desglose: ganancias.get(t.id)?.desglose ?? [] };
    })
    .sort((a, b) => b.saldo - a.saldo);
}

/**
 * Lista mínima de transferencias para saldar todos los saldos a la vez:
 * empareja repetidamente a quien más debe con a quien más le deben, hasta
 * que todo el mundo queda a cero. Es el típico "quién hace el bizum a
 * quién" — nadie paga nada hasta que se calcula esto al final de la Liga.
 *
 * @param {Array<{team, saldo: number}>} saldos
 * @returns {Array<{de, a, cantidad: number}>}
 */
export function calcularLiquidacion(saldos) {
  const deudores = saldos
    .filter((s) => s.saldo < -0.01)
    .map((s) => ({ team: s.team, cantidad: -s.saldo }))
    .sort((a, b) => b.cantidad - a.cantidad);
  const acreedores = saldos
    .filter((s) => s.saldo > 0.01)
    .map((s) => ({ team: s.team, cantidad: s.saldo }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const transferencias = [];
  let i = 0;
  let j = 0;
  while (i < deudores.length && j < acreedores.length) {
    const deudor = deudores[i];
    const acreedor = acreedores[j];
    const cantidad = Math.round(Math.min(deudor.cantidad, acreedor.cantidad) * 100) / 100;
    if (cantidad > 0) transferencias.push({ de: deudor.team, a: acreedor.team, cantidad });
    deudor.cantidad -= cantidad;
    acreedor.cantidad -= cantidad;
    if (deudor.cantidad < 0.01) i += 1;
    if (acreedor.cantidad < 0.01) j += 1;
  }

  return transferencias;
}
