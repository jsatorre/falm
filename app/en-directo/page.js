import { ultimaSincronizacion } from "../lib/sync";
import { getRondaEnDirecto } from "../lib/liveRound";
import LiveRound from "../components/LiveRound";

// Ojo: esta página NO espera a syncBiwengerResultsCached() antes de pintar.
// La ronda en directo puede necesitar traer hasta ~130 fichas de jugador
// (con reintentos si Cloudflare devuelve 429) — bloquear la carga inicial
// con eso deja al usuario mirando una pantalla en blanco 30s o más. Se
// pinta al instante con lo último que ya había en Supabase, y el cliente
// (ver LiveRound.js) pide un sync fresco nada más montarse — misma llamada
// que ya hace el botón "Actualizar", solo que automática al entrar.
export default async function EnDirectoPage() {
  const datos = await getRondaEnDirecto();
  return <LiveRound inicial={{ ...datos, syncedAt: ultimaSincronizacion() }} />;
}
