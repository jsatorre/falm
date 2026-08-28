import { syncBiwengerResultsCached } from "../lib/sync";
import { getRondaEnDirecto } from "../lib/liveRound";
import LiveRound from "../components/LiveRound";

export default async function EnDirectoPage() {
  // Un fallo puntual de Biwenger (429, timeout...) no debe tumbar la
  // pantalla — se sigue mostrando lo último que ya teníamos en Supabase.
  try {
    await syncBiwengerResultsCached();
  } catch (err) {
    console.error("No se ha podido sincronizar con Biwenger:", err);
  }

  const inicial = await getRondaEnDirecto();
  return <LiveRound inicial={inicial} />;
}
