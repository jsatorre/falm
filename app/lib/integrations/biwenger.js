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

async function biwengerFetch(path, reintentado = false, intentos429 = 0) {
  const res = await fetch(`${BASE}${path}`, { headers: await headers() });

  if (res.status === 401 && !reintentado) {
    tokenCache = null; // fuerza relogin
    return biwengerFetch(path, true, intentos429);
  }
  // 429: Biwenger nos está limitando (típico cuando se lanzan varias
  // llamadas en paralelo, p.ej. las 12 plantillas del draft) — un par de
  // reintentos con espera corta suele bastar, en vez de tumbar la página.
  if (res.status === 429 && intentos429 < 2) {
    await new Promise((r) => setTimeout(r, 400 * (intentos429 + 1)));
    return biwengerFetch(path, reintentado, intentos429 + 1);
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
 * El sistema de puntuación real que usa la liga (1 = Diario AS, 2 =
 * SofaScore, 3 = Estadísticas...) — cada jugador trae sus puntos
 * desglosados por sistema, hay que saber cuál es el nuestro para no coger
 * el de otro por error.
 */
export async function getLeagueScoreId() {
  const leagueId = process.env.BIWENGER_LEAGUE_ID;
  const data = await biwengerFetch(`/league/${leagueId}?fields=id,scoreID`);
  return data.scoreID;
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
 * llamadas), en paralelo — pero OJO: `lineups` (así, en plural y sin
 * filtro) solo trae las rondas que Biwenger ya ha cerrado del todo, no la
 * que está en juego ahora mismo, aunque ya hayan terminado partidos
 * sueltos de esa jornada.
 *
 * Si se pasa `opciones.biwengerRoundIdEnVivo`, para ESA ronda concreta no
 * se usa ese campo (vendría vacío) — se calcula en vivo con
 * getOncesEnVivoLiga (ver esa función), sumando los puntos de cada
 * titular desde su ficha pública. Así si un partido de esa jornada ya ha
 * terminado, sus puntos cuentan ya, sin esperar a que Biwenger cierre la
 * jornada entera.
 */
export async function getAllTeamsRoundPoints(teamIds, opciones = {}) {
  const { biwengerRoundIdEnVivo, scoreId } = opciones;

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

  if (biwengerRoundIdEnVivo != null) {
    const oncesPorEquipo = await getOncesEnVivoLiga(biwengerRoundIdEnVivo);
    if (oncesPorEquipo) {
      const idsUnicos = new Set();
      oncesPorEquipo.forEach((titulares) => titulares.forEach((id) => idsUnicos.add(id)));

      const fichas = await Promise.all(
        [...idsUnicos].map(async (id) => [id, await getFichaJugador(id).catch(() => null)])
      );
      const fichaPorId = new Map(fichas);

      resultado[biwengerRoundIdEnVivo] ??= {};
      for (const [teamId, titulares] of oncesPorEquipo) {
        let total = 0;
        for (const playerId of titulares) {
          const report = fichaPorId
            .get(playerId)
            ?.reports?.find((r) => String(r.match?.round?.id) === String(biwengerRoundIdEnVivo));
          if (report) total += puntosPartido(report, scoreId);
        }
        resultado[biwengerRoundIdEnVivo][teamId] = total;
      }
    }
  }

  return resultado;
}

/**
 * El once titular de TODOS los equipos de la liga para la ronda que
 * Biwenger considera activa AHORA MISMO — una sola llamada a tu cuenta
 * (/rounds/league), a diferencia de /user/{id}?...lineup&round=X, que solo
 * deja ver el once del equipo propio (confirmado probando con otro equipo
 * de la liga: viene vacío incluso siendo tú el dueño de la liga). Devuelve
 * null si la ronda activa según Biwenger no coincide con la que se pide
 * (p.ej. por un desfase puntual) — mejor no calcular nada que calcularlo
 * mal con el once de otra jornada.
 */
async function getOncesEnVivoLiga(biwengerRoundIdEnVivo) {
  const data = await biwengerFetch("/rounds/league");
  if (String(data.round?.id) !== String(biwengerRoundIdEnVivo)) return null;

  return new Map(
    (data.league?.standings ?? []).map((s) => [
      String(s.id),
      (s.lineup?.players ?? []).filter((id) => id != null),
    ])
  );
}

/**
 * Puntos de UN partido según vuestro sistema de liga "Personalizado"
 * (scoreID 100 en Biwenger), que NO viene precalculado dentro de
 * report.points (ese dict solo trae los sistemas estándar: 1 AS, 2
 * SofaScore, 3 Estadísticas...). Confirmado en el propio panel de
 * Biwenger: Puntos Estadísticas (= score3 de rawStats) + MVP*1 +
 * Victoria*1. Si algún día cambiáis la fórmula desde Biwenger, esta
 * función hay que actualizarla a mano.
 */
export function puntosPartido(report, scoreId) {
  const directo = report.points?.[String(scoreId)];
  if (directo != null) return directo;

  const stats = report.rawStats ?? {};
  return (stats.score3 ?? 0) + (stats.mvp ? 1 : 0) + (stats.win ? 1 : 0);
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
 * Jornadas de la temporada actual de La Liga (sin las "aplazadas", que no
 * cuentan como jornada propia) y si hay algún partido en juego ahora mismo
 * (activeEvents no vacío) — todo en una sola llamada al endpoint público de
 * Biwenger (sin login, no consume tu cuenta personal). No hace falta saber
 * de antemano el calendario ni distinguir horas/días: fuera de las horas
 * con partidos, activeEvents simplemente viene vacío por sí solo.
 */
export async function getSeasonData() {
  const res = await fetch("https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es");
  if (!res.ok) throw new Error(`Biwenger competition data -> ${res.status}`);
  const { data } = await res.json();
  return {
    rounds: data.season.rounds.filter((r) => !r.part),
    hayPartidosEnJuego: (data.activeEvents ?? []).length > 0,
  };
}
