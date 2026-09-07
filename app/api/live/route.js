import { syncBiwengerResultsCached, ultimaSincronizacion } from "../../lib/sync";
import { getRondaEnDirecto } from "../../lib/liveRound";

// El primer ciclo de una ronda nueva (caché de fichas de jugador vacía,
// ver getFichaJugador en biwenger.js) puede necesitar traer hasta ~130
// fichas con reintentos incluidos — más que el límite de 10s por defecto
// de una función de Vercel.
export const maxDuration = 60;

export async function GET() {
  // Un fallo puntual de Biwenger (429, timeout...) no debe tumbar la
  // pantalla — se sigue devolviendo lo último que ya teníamos en Supabase.
  try {
    await syncBiwengerResultsCached();
  } catch (err) {
    console.warn("No se ha podido sincronizar con Biwenger:", err);
  }

  const datos = await getRondaEnDirecto();
  return Response.json({ ...datos, syncedAt: ultimaSincronizacion() });
}
