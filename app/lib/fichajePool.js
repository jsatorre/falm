import { supabase } from "./supabaseServer";
import { getPoolCompleto, getPropietariosBiwenger } from "./draftEngine";

// Quién tiene fichado a quién de verdad en Biwenger solo hace falta
// comprobarlo una vez por jornada de fichajes (en la práctica, una vez a
// la semana) — no en cada visita a /fichajes. Se cachea por roundId: la
// primera visita a una jornada nueva refresca, las siguientes hasta que
// cambie la jornada activa se sirven de la misma copia.
let libresCache = null; // { roundId, data }

export async function getJugadoresLibres(roundId) {
  if (libresCache && libresCache.roundId === roundId) {
    return libresCache.data;
  }

  const [{ jugadores }, { data: teams }] = await Promise.all([
    getPoolCompleto(),
    supabase.from("teams").select("id, biwenger_user_id"),
  ]);

  const propietarios = await getPropietariosBiwenger(teams);

  const libres = jugadores
    .filter((j) => !propietarios.has(j.id))
    .map((j) => ({ id: j.id, nombre: j.nombre, club: j.club, posicionCodigo: j.posicionCodigo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  libresCache = { roundId, data: libres };
  return libres;
}
