// Cliente de la API real de Biwenger. El servidor hace login con
// BIWENGER_EMAIL/BIWENGER_PASSWORD (cuenta que está en la liga) y cachea el
// token en memoria del proceso; se relogea solo si una petición devuelve 401.
// Nunca se manda nada de esto al cliente.
const BASE = "https://biwenger.as.com/api/v2";

let tokenCache = null; // { token, obtainedAt }

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.BIWENGER_EMAIL,
      password: process.env.BIWENGER_PASSWORD,
    }),
  });
  if (!res.ok) {
    throw new Error(`Biwenger login falló: ${res.status}`);
  }
  const data = await res.json();
  tokenCache = { token: data.token, obtainedAt: Date.now() };
  return tokenCache.token;
}

async function headers() {
  const token = tokenCache?.token ?? (await login());
  return {
    Authorization: `Bearer ${token}`,
    "X-League": process.env.BIWENGER_LEAGUE_ID,
    "X-User": process.env.BIWENGER_USER_ID,
    "X-Lang": "es",
    "X-Version": "631",
    Accept: "application/json",
  };
}

async function biwengerFetch(path, reintentado = false) {
  const res = await fetch(`${BASE}${path}`, { headers: await headers() });

  if (res.status === 401 && !reintentado) {
    tokenCache = null; // fuerza relogin
    return biwengerFetch(path, true);
  }
  if (!res.ok) {
    throw new Error(`Biwenger ${path} -> ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Equipos de la liga con su posición/puntos acumulados de temporada (no por
 * jornada). Sirve para conocer los 12 equipos, nombre y escudo.
 */
export async function getLeagueStandings() {
  const leagueId = process.env.BIWENGER_LEAGUE_ID;
  const data = await biwengerFetch(`/league/${leagueId}?fields=id,name,standings`);
  return data.standings; // [{ id, name, icon, points, position }]
}

/**
 * Histórico jornada a jornada de UN equipo (puntos Biwenger, nº de
 * jugadores puntuables y posición esa semana).
 */
export async function getTeamLineups(biwengerTeamId) {
  const data = await biwengerFetch(
    `/user/${biwengerTeamId}?fields=id,name,lineups(round,points,count,position)`
  );
  return data.lineups; // [{ points, count, position, round: { id, name, short } }]
}

/**
 * Puntos de jornada de TODOS los equipos de la liga, indexados por
 * biwengerRoundId -> biwengerTeamId -> puntos. Una llamada por equipo (12
 * llamadas), en paralelo.
 */
export async function getAllTeamsRoundPoints(teamIds) {
  const porEquipo = await Promise.all(
    teamIds.map(async (teamId) => ({ teamId, lineups: await getTeamLineups(teamId) }))
  );

  const resultado = {}; // roundId -> teamId -> points
  for (const { teamId, lineups } of porEquipo) {
    for (const lineup of lineups) {
      const roundId = lineup.round.id;
      resultado[roundId] ??= {};
      resultado[roundId][teamId] = lineup.points;
    }
  }
  return resultado;
}

export function iconUrl(icon) {
  return `https://cdn.biwenger.com/${icon}`;
}

export function fotoJugadorUrl(playerId) {
  return `https://cdn.biwenger.com/i/p/${playerId}.png`;
}

/**
 * Plantilla de un equipo: IDs de los jugadores que tiene fichados (y lo
 * que pagó por cada uno).
 */
export async function getPlantilla(biwengerTeamId) {
  const data = await biwengerFetch(`/user/${biwengerTeamId}?fields=id,name,players(id,owner)`);
  return data.players ?? []; // [{ id, owner: { date, price } }]
}

/**
 * Alineación puesta cada jornada (once titular), para saber en qué
 * jornadas ha jugado de titular cada jugador en ESTE equipo — no es lo
 * mismo que si jugó con su club de verdad.
 */
export async function getAlineacionesPorJornada(biwengerTeamId) {
  const data = await biwengerFetch(`/user/${biwengerTeamId}?fields=id,name,lineups(round,players)`);
  return data.lineups ?? []; // [{ round: {id,name,short}, players: [playerId|null, ...] }]
}

/**
 * Ficha completa de un jugador: datos básicos (posición, precio, estado,
 * club) + el historial completo de partidos reales con su club
 * (reports[].rawStats: goles, minutos jugados, MVP, etc.). Endpoint
 * público, sin login.
 */
export async function getFichaJugador(playerId) {
  const res = await fetch(
    `https://cf.biwenger.com/api/v2/players/la-liga/${playerId}?fields=*,team,fitness,reports,competition&score=3&lang=es`
  );
  if (!res.ok) throw new Error(`Biwenger player ${playerId} -> ${res.status}`);
  const { data } = await res.json();
  return data;
}

/**
 * Jornadas de la temporada actual de La Liga, en orden, sin las
 * "aplazadas" (partidos que se reprograman fuera de su jornada original —
 * no cuentan como una jornada propia a efectos de nuestro calendario).
 * Endpoint público, sin necesidad de login.
 */
export async function getSeasonRounds() {
  const res = await fetch("https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es");
  if (!res.ok) throw new Error(`Biwenger competition data -> ${res.status}`);
  const { data } = await res.json();
  return data.season.rounds.filter((r) => !r.part);
}
