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
 * el de otro por error. Es una configuración fija de la liga (no cambia
 * de una sincronización a otra), así que se cachea un día entero en vez
 * de preguntarlo cada vez — si alguna vez cambiáis el sistema de
 * puntuación desde Biwenger, tardará como mucho un día en notarse.
 */
let scoreIdCache = null; // { ts, valor }
const SCORE_ID_CACHE_MS = 24 * 60 * 60 * 1000;

export async function getLeagueScoreId() {
  const ahora = Date.now();
  if (scoreIdCache && ahora - scoreIdCache.ts < SCORE_ID_CACHE_MS) {
    return scoreIdCache.valor;
  }
  const leagueId = process.env.BIWENGER_LEAGUE_ID;
  const data = await biwengerFetch(`/league/${leagueId}?fields=id,scoreID`);
  scoreIdCache = { ts: ahora, valor: data.scoreID };
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
 * biwengerRoundId -> biwengerTeamId -> puntos — SOLO de las jornadas que
 * Biwenger ya ha cerrado del todo (no de la que está en juego ahora
 * mismo, para eso ver getLiveRoundPoints). Una llamada por equipo (12
 * llamadas a tu cuenta), en paralelo.
 *
 * Esto casi nunca cambia una vez cerrada una jornada, así que quien llame
 * a esto (ver sync.js) puede — y debe — cachearlo con un margen mucho más
 * largo que la ronda en directo, en vez de repetir estas 12 llamadas en
 * cada ciclo corto.
 */
export async function getHistoricalRoundPoints(teamIds) {
  // Un solo equipo con un biwenger_user_id inválido (p.ej. un equipo de
  // prueba mal borrado) no debe tumbar la sincronización de TODA la liga
  // real — confirmado que pasaba: Promise.all sin capturar por equipo
  // hacía que un único 404 abortara todo, dejando "En directo" congelado
  // indefinidamente sin que nadie se enterara del motivo real.
  const porEquipo = await Promise.all(
    teamIds.map(async (teamId) => {
      try {
        return { teamId, lineups: await getTeamLineups(teamId) };
      } catch (err) {
        console.warn(`No se han podido traer las jornadas cerradas del equipo ${teamId}:`, err);
        return { teamId, lineups: [] };
      }
    })
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

/**
 * Reports (rawStats completas) de TODOS los jugadores que han disputado
 * algún partido de la ronda ACTUAL de La Liga — en UNA sola llamada
 * pública (sin login, gratis). Sustituye lo que antes costaba hasta ~130
 * llamadas sueltas (una por jugador, ver el antiguo getFichaJugador en
 * bucle): ese volumen es justo lo que Cloudflare acababa bloqueando con
 * 429 de forma sostenida bajo carga real (confirmado también en los logs
 * de producción, no solo en local). Verificado dato a dato contra la
 * ficha individual de un jugador: mismas rawStats exactas (score3, mvp,
 * win, goals...).
 */
async function getReportesRondaActual(scoreId, intentos429 = 0) {
  // El parámetro `score` es obligatorio: sin él (probado sin querer)
  // Biwenger devuelve otra forma de respuesta con las rawStats vacías y
  // todos los jugadores a 0 puntos, aunque el partido ya haya terminado.
  // `v` es la versión de la app oficial (la que manda su propio frontend,
  // capturada de una sesión real) — se incluye para pedir exactamente la
  // misma forma de respuesta que ya se verificó dato a dato como correcta.
  const res = await fetch(
    `https://cf.biwenger.com/api/v2/rounds/la-liga?score=${scoreId}&lang=es&v=631&_=${Date.now()}`,
    { cache: "no-store" }
  );
  // Esta es ahora LA llamada de la que depende todo el marcador en directo
  // (antes el reintento importaba poco, un jugador de ~130 fallando apenas
  // se notaba — ahora si esta falla no hay nada). Un reintento corto para
  // un pico puntual; si Cloudflare está en bloqueo sostenido, más
  // reintentos no van a arreglarlo y solo alargan la espera.
  if (res.status === 429 && intentos429 < 1) {
    await new Promise((r) => setTimeout(r, 300));
    return getReportesRondaActual(scoreId, intentos429 + 1);
  }
  if (!res.ok) throw new Error(`Biwenger rounds/la-liga -> ${res.status}`);
  const { data } = await res.json();

  const reportePorJugador = new Map(); // playerId -> report (con match.status añadido, para caso de necesitarlo)
  for (const game of data.games ?? []) {
    for (const lado of [game.home, game.away]) {
      for (const report of lado?.reports ?? []) {
        if (report.player?.id == null) continue;
        reportePorJugador.set(report.player.id, { ...report, match: { status: game.status } });
      }
    }
  }
  return { roundId: data.id, reportePorJugador };
}

/**
 * Puntos EN VIVO de todos los equipos para la ronda que está en juego
 * ahora mismo — no se fía del campo oficial de Biwenger (no lo rellena
 * hasta cerrar la jornada ENTERA, aunque partidos sueltos ya hayan
 * terminado): se calcula sumando los puntos de cada titular con la misma
 * fórmula que ya usa "Equipo" (ver puntosPartido), a partir de los
 * reports en bloque de getReportesRondaActual. El once de cada equipo
 * sale de getOncesEnVivoLiga (1 sola llamada a tu cuenta para los 12
 * equipos).
 *
 * Solo se pide la ficha individual (cara, con reintentos) de un jugador
 * cuando NO aparece en absoluto en los reports en bloque — o su partido
 * todavía no ha empezado, o está descartado (lesión/sanción) y hace
 * falta mirar su "status" para decidir si toca sustitución automática.
 * En un ciclo normal esto son 0-2 llamadas, no ~130.
 *
 * Devuelve un Map teamId -> { total, jugadores }, donde `jugadores` es la
 * lista de titulares que YA tienen datos de su partido (ya jugado o en
 * juego). O null si Biwenger no considera esta ronda como la activa
 * ahora mismo.
 */
export async function getLiveRoundPoints(biwengerRoundIdEnVivo, scoreId) {
  const oncesPorEquipo = await getOncesEnVivoLiga(biwengerRoundIdEnVivo);
  if (!oncesPorEquipo) return null;

  const { roundId, reportePorJugador } = await getReportesRondaActual(scoreId);
  if (String(roundId) !== String(biwengerRoundIdEnVivo)) return null; // desfase puntual, mejor no calcular nada mal

  const idsSinReporte = new Set();
  oncesPorEquipo.forEach(({ titulares, reservas }) => {
    [...titulares, ...reservas].forEach((id) => {
      if (!reportePorJugador.has(id)) idsSinReporte.add(id);
    });
  });

  const fichasSinReporte = await mapConLimite([...idsSinReporte], 5, async (id) => [
    id,
    await getFichaJugador(id, { roundIdEnVivo: biwengerRoundIdEnVivo }).catch((err) => {
      console.warn(`No se ha podido traer la ficha del jugador ${id} (sin report en bloque):`, err);
      return null;
    }),
  ]);
  const statusPorIdSinReporte = new Map(fichasSinReporte.map(([id, ficha]) => [id, ficha?.status ?? null]));
  // El endpoint en bloque a veces va un pelín por detrás del real para
  // algún jugador suelto (su partido acaba de actualizarse y todavía no
  // se refleja ahí) — como de todas formas ya se pide su ficha individual
  // para mirar el "status", se aprovecha esa misma respuesta para rellenar
  // el report si lo trae, en vez de dejarlo fuera del cómputo sin más.
  for (const [id, ficha] of fichasSinReporte) {
    const report = ficha?.reports?.find((r) => String(r.match?.round?.id) === String(biwengerRoundIdEnVivo));
    if (report) reportePorJugador.set(id, report);
  }

  const resultado = new Map();
  for (const [teamId, { titulares, reservas, capitanId, arieteId }] of oncesPorEquipo) {
    let total = 0;
    const jugadores = [];
    // Sustitución automática: `lineup.players` (/rounds/league) es el once
    // TAL COMO SE ALINEÓ, no se actualiza si luego un titular queda
    // descartado (lesión/sanción confirmada tras el cierre de alineaciones)
    // — pero Biwenger sí lo sustituye por el primer suplente disponible a
    // la hora de sumar puntos (confirmado en la propia ficha del suplente:
    // "Sustituye a X"). Sin esto, ese hueco cuenta como si no hubiera
    // jugado nadie, y el total del equipo sale por debajo del real.
    const reservasDisponibles = [...reservas];
    let indiceReserva = 0;
    const efectivos = titulares.map((playerId) => {
      const status = reportePorJugador.has(playerId) ? "ok" : statusPorIdSinReporte.get(playerId);
      if (status && status !== "ok") {
        const suplenteId = reservasDisponibles[indiceReserva++];
        if (suplenteId != null) return suplenteId;
      }
      return playerId;
    });

    for (const playerId of efectivos) {
      const report = reportePorJugador.get(playerId);
      if (!report) continue; // todavía no ha jugado su partido esta ronda
      const esCapitan = String(playerId) === String(capitanId);
      const esAriete = String(playerId) === String(arieteId);
      // El capitán cuenta DOBLE en el total del equipo (confirmado: la
      // ficha del jugador muestra su puntuación tal cual, pero la
      // clasificación de Biwenger solo cuadra si al capitán se le suma otra
      // vez lo mismo) — sin esto el total del equipo siempre sale por
      // debajo del real cuando el capitán ha puntuado.
      const puntosBase = puntosPartido(report, scoreId);
      // El ariete suma 1 punto EXTRA por cada gol suyo (ajuste "Ariete" de
      // Ajustes de liga > Alineaciones — solo en ligas Premium/Ultra), y
      // esto va POR ENCIMA de su puntuación normal, no sustituye nada de
      // "Puntos Estadísticas" (confirmado con un ariete de 3 goles: su
      // ficha ya mostraba su puntuación normal completa, y el total del
      // equipo solo cuadraba sumando 3 puntos más aparte).
      const bonusAriete = esAriete ? (report.rawStats?.goals ?? 0) : 0;
      const puntos = (esCapitan ? puntosBase * 2 : puntosBase) + bonusAriete;
      total += puntos;
      jugadores.push({ id: playerId, nombre: report.player?.name ?? "?", puntos, capitan: esCapitan, ariete: esAriete });
    }
    jugadores.sort((a, b) => b.puntos - a.puntos);
    resultado.set(teamId, { total, jugadores });
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
      {
        titulares: (s.lineup?.players ?? []).filter((id) => id != null),
        reservas: (s.lineup?.reserves ?? []).filter((id) => id != null),
        capitanId: s.lineup?.captain?.id ?? null,
        arieteId: s.lineup?.striker?.id ?? null,
      },
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

  // Las tarjetas ya van incluidas dentro de "Estadísticas" (score3) —
  // no se restan aparte, sería contarlas dos veces.
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
async function fetchFichaJugador(playerId, intentos429 = 0) {
  // El CDN de Cloudflare cachea esta URL por su cuenta durante HORAS
  // (confirmado: una respuesta con "Age: 7326" — más de 2h vieja — no
  // tenía todavía el partido de un jugador que llevaba toda la segunda
  // parte jugado). `cache: "no-store"` evita que Next.js la cachee por su
  // lado, pero no basta para saltarse el caché de Cloudflare — hace falta
  // que la URL sea distinta cada vez, de ahí el parámetro `_`.
  const res = await fetch(
    `https://cf.biwenger.com/api/v2/players/la-liga/${playerId}?fields=*,team,fitness,reports,competition&score=3&lang=es&_=${Date.now()}`,
    { cache: "no-store" }
  );
  // Confirmado en pruebas reales (local Y en Vercel, por logs): si se
  // lanzan muchas de golpe (la ronda en directo puede necesitar hasta
  // ~130, una por jugador con algún titular jugando), Cloudflare responde
  // 429 — y el bloqueo puede mantenerse sostenido varios minutos, no es
  // solo un pico puntual. Reintentar mucho en ese caso no arregla nada y
  // solo alarga la carga (con 3 intentos y ~130 jugadores se iba a más de
  // 1 minuto) — mejor UN reintento corto (para el caso de un pico breve) y
  // rendirse rápido; lo que de verdad evita repetir la petición es la
  // caché de getFichaJugador más abajo, no insistir aquí.
  if (res.status === 429 && intentos429 < 1) {
    await new Promise((r) => setTimeout(r, 250));
    return fetchFichaJugador(playerId, intentos429 + 1);
  }
  if (!res.ok) throw new Error(`Biwenger player ${playerId} -> ${res.status}`);
  const { data } = await res.json();
  return data;
}

// Caché corta en memoria del proceso, por jugador. No es por el caché de
// Cloudflare (ese ya se salta con el `_` de arriba) — es nuestro: durante
// una ronda en directo, syncBiwengerResultsCached() vuelve a llamar a esto
// cada 60s para los mismos ~130 jugadores, y ese volumen repetido es lo
// que dispara los 429. Un fallo no se cachea (se borra la entrada), para
// poder reintentarlo en el siguiente ciclo.
//
// El TTL no es fijo: si quien llama indica para qué ronda en directo
// necesita el dato (roundIdEnVivo) y el partido de ESE jugador en ESA
// ronda ya aparece "finished", sus puntos no van a cambiar más — se
// cachea mucho tiempo. Si sigue en juego (o no se sabe), se cachea poco,
// para no servir un marcador desactualizado mientras el partido continúa.
// Sin esta distinción, cachear todo por igual varios minutos deja el
// marcador en directo sistemáticamente por debajo del real mientras el
// partido avanza (confirmado: puntos algo más bajos que Biwenger en todos
// los equipos con partido en juego, exactamente el mismo nº de jugadores).
const FICHA_CACHE_MS_EN_JUEGO = 30 * 1000;
const FICHA_CACHE_MS_CERRADO = 30 * 60 * 1000;
const fichaCache = new Map(); // playerId -> { ts, ttl, promise }

export async function getFichaJugador(playerId, { roundIdEnVivo } = {}) {
  const ahora = Date.now();
  const entrada = fichaCache.get(playerId);
  if (entrada && ahora - entrada.ts < entrada.ttl) return entrada.promise;

  const promise = fetchFichaJugador(playerId);
  fichaCache.set(playerId, { ts: ahora, ttl: FICHA_CACHE_MS_EN_JUEGO, promise });

  try {
    const ficha = await promise;
    if (roundIdEnVivo != null) {
      const report = ficha.reports?.find((r) => String(r.match?.round?.id) === String(roundIdEnVivo));
      const ttl = report?.match?.status === "finished" ? FICHA_CACHE_MS_CERRADO : FICHA_CACHE_MS_EN_JUEGO;
      fichaCache.set(playerId, { ts: ahora, ttl, promise });
    }
    return ficha;
  } catch (err) {
    fichaCache.delete(playerId);
    throw err;
  }
}

/**
 * Igual que Promise.all pero como mucho `limite` promesas de `fn` en
 * marcha a la vez. La ronda en directo puede necesitar hasta ~130 fichas
 * de jugador de golpe — lanzarlas todas en paralelo (sin límite) es lo que
 * provoca los 429 de Cloudflare descritos en getFichaJugador.
 */
async function mapConLimite(items, limite, fn) {
  const resultado = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultado[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultado;
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
  // Mismo problema de caché de Cloudflare que getFichaJugador — sin el
  // cache-busting, activeEvents puede quedarse con una copia de hace
  // horas, y si esa copia venía vacía, ni siquiera se intenta sincronizar
  // nada nuevo aunque haya partidos en juego de verdad.
  const res = await fetch(`https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es&_=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Biwenger competition data -> ${res.status}`);
  const { data } = await res.json();
  return {
    rounds: data.season.rounds.filter((r) => !r.part),
    hayPartidosEnJuego: (data.activeEvents ?? []).length > 0,
  };
}
