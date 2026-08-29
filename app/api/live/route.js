import { syncBiwengerResultsCached, ultimaSincronizacion } from "../../lib/sync";
import { getRondaEnDirecto } from "../../lib/liveRound";

export async function GET() {
  // Un fallo puntual de Biwenger (429, timeout...) no debe tumbar la
  // pantalla — se sigue devolviendo lo último que ya teníamos en Supabase.
  try {
    await syncBiwengerResultsCached();
  } catch (err) {
    console.error("No se ha podido sincronizar con Biwenger:", err);
  }

  const datos = await getRondaEnDirecto();
  return Response.json({ ...datos, syncedAt: ultimaSincronizacion() });
}
