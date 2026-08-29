import { supabase } from "./supabaseServer";
import { getPoolCompleto, getPropietariosBiwenger } from "./draftEngine";

/**
 * Jugadores de La Liga que ahora mismo NO tiene nadie de la liga en
 * Biwenger — son los únicos que tiene sentido poder pedir en la wishlist
 * de fichajes (a diferencia del draft, aquí solo cuenta la propiedad real
 * en Biwenger, no los picks del draft — alguien puede tener un jugador
 * "apuntado" en el draft sin haberlo comprado todavía de verdad).
 */
export async function getJugadoresLibres() {
  const [{ jugadores }, { data: teams }] = await Promise.all([
    getPoolCompleto(),
    supabase.from("teams").select("id, biwenger_user_id"),
  ]);

  const propietarios = await getPropietariosBiwenger(teams);

  return jugadores
    .filter((j) => !propietarios.has(j.id))
    .map((j) => ({ id: j.id, nombre: j.nombre, club: j.club, posicionCodigo: j.posicionCodigo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
