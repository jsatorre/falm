import { supabase } from "./supabaseServer";
import { getPlantilla } from "./integrations/biwenger";

// Equipos "grandes" con tope de 2 fichajes por equipo en el draft (el
// resto de clubes tiene tope de 3). IDs reales de La Liga en Biwenger.
const CLUBES_TOPE_2 = new Set([2, 3, 15]); // Atlético, Barcelona, Real Madrid

const POSICION = { 1: "PT", 2: "DF", 3: "MC", 4: "DL" };

// El pool completo de jugadores de La Liga (nombre, club, posición) viene
// en una sola llamada pública — no cambia cada minuto, así que se cachea
// un rato para no pedirlo en cada refresco del tablero.
let poolCache = null; // { ts, promise }
const POOL_CACHE_MS = 10 * 60 * 1000;

export async function getPoolCompleto() {
  const ahora = Date.now();
  if (!poolCache || ahora - poolCache.ts > POOL_CACHE_MS) {
    poolCache = { ts: ahora, promise: cargarPoolCompleto() };
  }
  return poolCache.promise;
}

async function cargarPoolCompleto() {
  const res = await fetch("https://cf.biwenger.com/api/v2/competitions/la-liga/data?lang=es");
  if (!res.ok) throw new Error(`Biwenger competition data -> ${res.status}`);
  const { data } = await res.json();

  const equiposReales = Object.fromEntries(Object.values(data.teams).map((t) => [t.id, t.name]));

  const jugadores = Object.values(data.players)
    .filter((p) => p.teamID) // fuera equipos ya descendidos/sin club asignado
    .map((p) => ({
      id: p.id,
      nombre: p.name,
      posicionCodigo: POSICION[p.position] ?? "?",
      clubId: p.teamID,
      club: equiposReales[p.teamID] ?? "?",
      valor: p.price ?? null,
      puntos: p.points ?? 0,
    }));

  return { jugadores, equiposReales };
}

/**
 * Quién tiene ya fichado (de verdad, en Biwenger) a cada jugador —
 * independiente del draft. Sirve tanto para excluir del pool disponible
 * como para el tope de jugadores por club real. Son 12 llamadas en
 * paralelo a Biwenger (una por equipo) con la cuenta PERSONAL de Jaime (el
 * login del servidor usa sus credenciales) — así que el límite de
 * peticiones de Biwenger lo comparte con su propio uso normal de la app o
 * la web real. Con el draft en marcha el tablero hace polling cada 5s
 * desde varios móviles a la vez, así que sin un caché largo esto puede
 * dejar a Jaime sin poder ni subir su alineación en Biwenger. 5 min es de
 * sobra (nadie ficha de verdad mientras el draft está en marcha) y, si una
 * carga falla, se sirve la última copia buena en vez de tumbar la página.
 */
let propietariosCache = null; // { ts, data }
const PROPIETARIOS_CACHE_MS = 5 * 60 * 1000;

export async function getPropietariosBiwenger(teams) {
  const ahora = Date.now();
  if (propietariosCache && ahora - propietariosCache.ts < PROPIETARIOS_CACHE_MS) {
    return propietariosCache.data;
  }

  try {
    const porEquipo = await Promise.all(
      teams.map(async (t) => ({ teamId: t.id, plantilla: await getPlantilla(t.biwenger_user_id) }))
    );

    const propietarios = new Map(); // playerId -> teamId
    for (const { teamId, plantilla } of porEquipo) {
      for (const p of plantilla) propietarios.set(p.id, teamId);
    }
    propietariosCache = { ts: ahora, data: propietarios };
    return propietarios;
  } catch (err) {
    // console.warn, no console.error: esto ya está controlado (se sirve la
    // última copia buena o un mapa vacío) — con console.error, el overlay de
    // Next en desarrollo lo pinta como si la página se hubiera roto.
    console.warn("No se ha podido refrescar la propiedad real de Biwenger para el draft:", err);
    if (propietariosCache) return propietariosCache.data; // mejor una copia algo vieja que tumbar la página
    return new Map();
  }
}

/**
 * Estado completo del draft: en qué pick va, de quién es el turno, quién
 * tiene fichado a quién (Biwenger + picks del draft) y el pool completo
 * de jugadores de la Liga con su estado (libre / ocupado y por quién).
 */
export async function getEstadoDraft() {
  const [{ data: estado }, { data: teams }, { data: picks }, pool] = await Promise.all([
    supabase.from("draft_state").select("*").maybeSingle(),
    supabase.from("teams").select("id, name, crest_url, biwenger_user_id"),
    supabase.from("draft_picks").select("pick_index, team_id, player_id, player_name, player_club, created_at").order("pick_index", { ascending: true }),
    getPoolCompleto(),
  ]);

  const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const propietariosBiwenger = await getPropietariosBiwenger(teams);

  // playerId -> { teamId, origen: 'biwenger' | 'draft' }
  const ocupacion = new Map();
  for (const [playerId, teamId] of propietariosBiwenger) {
    ocupacion.set(playerId, { teamId, origen: "biwenger" });
  }
  for (const pick of picks ?? []) {
    if (!ocupacion.has(pick.player_id)) {
      ocupacion.set(pick.player_id, { teamId: pick.team_id, origen: "draft" });
    }
  }

  const enMarcha = Boolean(estado?.started_at) && !estado?.finished_at;
  const teamOrder = estado?.team_order ?? [];
  const pickSize = estado?.pick_size ?? 22;
  const totalPicks = teamOrder.length * pickSize;
  const retiradoTeamIds = new Set(estado?.retired_teams ?? []);

  // Un equipo "retirado" (botón "Ya no quiero más jugadores") se salta
  // automáticamente en cuanto le toca, sin que nadie tenga que hacer nada
  // — y se deja guardado el hueco ya saltado para no repetir el cálculo en
  // cada lectura. Es reversible: si vuelve a activarse, simplemente
  // recupera turno en su siguiente hueco de la serpiente (los que ya se
  // saltaron mientras estaba retirado no se recuperan).
  let currentPick = estado?.current_pick ?? 0;
  if (enMarcha && teamOrder.length > 0 && retiradoTeamIds.size > 0) {
    let avanzado = false;
    while (currentPick < totalPicks) {
      const ronda = Math.floor(currentPick / teamOrder.length);
      const posicionEnRonda = currentPick % teamOrder.length;
      const ordenRonda = ronda % 2 === 0 ? teamOrder : [...teamOrder].reverse();
      if (!retiradoTeamIds.has(ordenRonda[posicionEnRonda])) break;
      currentPick += 1;
      avanzado = true;
    }
    if (avanzado) {
      const { error: skipError } = await supabase
        .from("draft_state")
        .update({ current_pick: currentPick })
        .eq("id", true);
      if (skipError) console.warn("No se ha podido guardar el salto de turnos retirados:", skipError);
    }
  }

  const terminado = Boolean(estado?.finished_at) || (enMarcha && currentPick >= totalPicks);

  let turnoDe = null;
  if (enMarcha && !terminado && teamOrder.length > 0) {
    const ronda = Math.floor(currentPick / teamOrder.length);
    const posicionEnRonda = currentPick % teamOrder.length;
    const ordenRonda = ronda % 2 === 0 ? teamOrder : [...teamOrder].reverse();
    turnoDe = ordenRonda[posicionEnRonda];
  }

  return {
    configurado: Boolean(estado),
    enMarcha,
    terminado,
    currentPick,
    pickSize,
    totalPicks,
    ronda: teamOrder.length > 0 ? Math.floor(currentPick / teamOrder.length) + 1 : null,
    turnoDeTeamId: turnoDe,
    teamOrder,
    equipoPorId,
    picks: picks ?? [],
    ocupacion,
    pool: pool.jugadores,
    retiradoTeamIds,
  };
}

function contarPorClub(teamId, ocupacion, pool) {
  const jugadorPorId = new Map(pool.map((j) => [j.id, j]));
  const conteo = new Map(); // clubId -> cantidad

  for (const [playerId, info] of ocupacion) {
    if (info.teamId !== teamId) continue;
    const jugador = jugadorPorId.get(playerId);
    if (!jugador) continue;
    conteo.set(jugador.clubId, (conteo.get(jugador.clubId) ?? 0) + 1);
  }
  return conteo;
}

/**
 * Aplana el estado de getEstadoDraft() a algo directamente serializable
 * (Map -> objetos planos) para mandarlo al cliente — lo usan tanto la
 * página del draft (carga inicial en servidor) como GET /api/draft
 * (polling), así el cliente siempre recibe la misma forma.
 */
export function shapeEstadoDraft(estado, teamId) {
  return {
    configurado: estado.configurado,
    enMarcha: estado.enMarcha,
    terminado: estado.terminado,
    currentPick: estado.currentPick,
    pickSize: estado.pickSize,
    totalPicks: estado.totalPicks,
    ronda: estado.ronda,
    turnoDeTeamId: estado.turnoDeTeamId,
    esMiTurno: estado.turnoDeTeamId === teamId,
    teamOrder: estado.teamOrder,
    retirados: [...estado.retiradoTeamIds],
    estoyRetirado: estado.retiradoTeamIds.has(teamId),
    equipos: Object.values(estado.equipoPorId).map((e) => ({ id: e.id, name: e.name, crest_url: e.crest_url })),
    picks: estado.picks.map((p) => ({
      pickIndex: p.pick_index,
      teamId: p.team_id,
      teamName: estado.equipoPorId[p.team_id]?.name ?? "?",
      playerId: p.player_id,
      playerName: p.player_name,
      playerClub: p.player_club,
    })),
    pool: estado.pool.map((j) => {
      const ocupado = estado.ocupacion.get(j.id);
      return {
        ...j,
        ocupado: Boolean(ocupado),
        teamId: ocupado?.teamId ?? null,
        teamName: ocupado ? estado.equipoPorId[ocupado.teamId]?.name ?? "?" : null,
        origen: ocupado?.origen ?? null,
      };
    }),
  };
}

/**
 * Si el equipo puede fichar a ese jugador ahora mismo: que esté libre y
 * que no se pase del tope de jugadores por club real (2 para
 * Atlético/Barça/Madrid, 3 para el resto).
 */
export function puedeFichar(teamId, jugador, ocupacion, pool) {
  if (ocupacion.has(jugador.id)) return { ok: false, motivo: "Ese jugador ya está fichado." };

  const conteo = contarPorClub(teamId, ocupacion, pool);
  const actuales = conteo.get(jugador.clubId) ?? 0;
  const tope = CLUBES_TOPE_2.has(jugador.clubId) ? 2 : 3;

  if (actuales >= tope) {
    return { ok: false, motivo: `Ya tienes ${tope} jugadores de ${jugador.club} — es el máximo.` };
  }
  return { ok: true };
}

export { contarPorClub, CLUBES_TOPE_2 };
