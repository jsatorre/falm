import { supabase } from "./supabaseServer";
import { calcularAsignaciones, avisarVentanaResuelta } from "./fichajesEngine";

// Ventana Extra: una ventana de fichajes que abre el admin a mano cuando no
// se cierra ninguna jornada de Liga (parón de selecciones...) pero el
// mercado de Biwenger sigue abierto. Las tablas de wishlist/asignaciones
// cuelgan de una jornada concreta (una sola ventana por jornada), así que
// la Extra se guarda aparte en app_settings, sin tocar el esquema:
//
//   fichajes_extra            { roundId, deadline|null, abiertaAt }
//   fichajes_extra_wl_<team>  [jugador1, jugador2]
//   fichajes_extra_asig       [{ team_id, player }]   (se escribe una sola vez)
//
// Va "pegada" a la jornada pendiente en el momento de abrirla: en cuanto esa
// jornada se cierra, la Extra caduca sola y vuelve la ventana normal.

const CLAVE = "fichajes_extra";
const CLAVE_WISHLIST = (teamId) => `fichajes_extra_wl_${teamId}`;
const CLAVE_ASIGNACIONES = "fichajes_extra_asig";

async function leerClaves(claves) {
  const { data, error } = await supabase.from("app_settings").select("key, value").in("key", claves);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
}

function parsear(valor, porDefecto) {
  if (!valor) return porDefecto;
  try {
    return JSON.parse(valor);
  } catch {
    return porDefecto;
  }
}

/**
 * La Ventana Extra vigente de esta jornada pendiente, o null si no hay
 * (nunca se abrió, o era de una jornada que ya se cerró).
 *
 * @param {{ id: string }} ronda  jornada de fichajes activa (primera pendiente)
 * @returns {Promise<{ roundId: string, deadline: string|null, abiertaAt: string, asignaciones: Array<{ team_id: string, player: string }>|null }|null>}
 */
export async function getVentanaExtra(ronda) {
  const claves = await leerClaves([CLAVE, CLAVE_ASIGNACIONES]);
  const extra = parsear(claves[CLAVE], null);
  if (!extra || extra.roundId !== ronda.id) return null;

  return { ...extra, asignaciones: parsear(claves[CLAVE_ASIGNACIONES], null) };
}

export function extraAbierta(extra) {
  return Boolean(extra) && !extra.asignaciones && !deadlineExtraPasada(extra);
}

export function deadlineExtraPasada(extra) {
  return Boolean(extra?.deadline) && new Date(extra.deadline) <= new Date();
}

async function borrarDatosExtra() {
  const { error } = await supabase.from("app_settings").delete().like("key", "fichajes_extra%");
  if (error) throw error;
}

/** Abre una Ventana Extra sobre `ronda`, sustituyendo cualquier anterior. */
export async function abrirVentanaExtra(ronda, deadline) {
  await borrarDatosExtra();
  const extra = { roundId: ronda.id, deadline: deadline ?? null, abiertaAt: new Date().toISOString() };
  const { error } = await supabase.from("app_settings").insert({ key: CLAVE, value: JSON.stringify(extra) });
  if (error) throw error;
  return extra;
}

export async function cancelarVentanaExtra() {
  await borrarDatosExtra();
}

/** Cambia la hora tope de la Extra abierta (null = sin hora tope). */
export async function fijarDeadlineExtra(extra, deadline) {
  const nueva = { roundId: extra.roundId, deadline: deadline ?? null, abiertaAt: extra.abiertaAt };
  const { error } = await supabase.from("app_settings").upsert({ key: CLAVE, value: JSON.stringify(nueva) });
  if (error) throw error;
  return nueva;
}

export async function leerWishlistExtra(teamId) {
  const claves = await leerClaves([CLAVE_WISHLIST(teamId)]);
  const [player1, player2] = parsear(claves[CLAVE_WISHLIST(teamId)], []);
  return { player1: player1 ?? "", player2: player2 ?? "" };
}

export async function guardarWishlistExtra(teamId, player1, player2) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: CLAVE_WISHLIST(teamId), value: JSON.stringify([player1 ?? null, player2 ?? null]) });
  if (error) throw error;
}

/** Jugadores que ya se llevó cada equipo en la ventana normal de esta jornada. */
export async function fichadosEnVentanaNormal(ronda) {
  const { data, error } = await supabase.from("fichaje_assignments").select("player").eq("round_id", ronda.id);
  if (error) throw error;
  return new Set((data ?? []).map((a) => a.player));
}

/**
 * Cierra la Extra (la primera vez que se pide pasada la hora tope):
 * calcula quién ficha a quién y lo guarda. Idempotente — el INSERT sobre
 * una clave única hace de cerrojo, así que si dos visitas coinciden solo
 * una escribe y avisa.
 *
 * @param {{ id: string, jornadaCaraACara: number }} ronda
 * @returns {Promise<Array<{ team_id: string, player: string }>>}
 */
export async function publicarVentanaExtraSiToca(ronda, extra) {
  if (extra.asignaciones) return extra.asignaciones;

  const claves = await leerClaves([CLAVE_ASIGNACIONES]);
  if (claves[CLAVE_ASIGNACIONES]) return parsear(claves[CLAVE_ASIGNACIONES], []);

  const { data: equipos, error: equiposError } = await supabase.from("teams").select("id");
  if (equiposError) throw equiposError;
  const wishlists = await leerClaves(equipos.map((t) => CLAVE_WISHLIST(t.id)));
  const wishlistPorEquipo = {};
  for (const t of equipos) {
    const opciones = parsear(wishlists[CLAVE_WISHLIST(t.id)], null);
    if (opciones) wishlistPorEquipo[t.id] = opciones;
  }

  // Previa = la ventana normal de esta misma jornada: quien ya fichó en ella
  // va el último; y sus jugadores no se pueden volver a asignar.
  const { asignaciones, teams } = await calcularAsignaciones({
    roundIdPrevio: ronda.id,
    hastaJornada: ronda.jornadaCaraACara - 1,
    wishlistPorEquipo,
    excluidos: await fichadosEnVentanaNormal(ronda),
  });

  const resultado = asignaciones.map((a) => ({ team_id: a.teamId, player: a.player }));
  const { error } = await supabase
    .from("app_settings")
    .insert({ key: CLAVE_ASIGNACIONES, value: JSON.stringify(resultado) });
  if (error) {
    // 23505 = otra visita se nos adelantó: que aviste ella, aquí solo se lee.
    if (error.code === "23505") {
      const ya = await leerClaves([CLAVE_ASIGNACIONES]);
      return parsear(ya[CLAVE_ASIGNACIONES], []);
    }
    throw error;
  }

  await avisarVentanaResuelta(ronda, asignaciones, teams, true);
  return resultado;
}
