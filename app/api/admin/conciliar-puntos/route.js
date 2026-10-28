import { syncBiwengerResults } from "../../../lib/sync";

// Fuerza el volcado de los puntos OFICIALES de Biwenger de todas las
// jornadas ya cerradas, aunque no haya ningún partido en juego y sin usar
// la caché del histórico. Las jornadas bloqueadas a mano (ver
// jornadasManuales.js) se respetan: el sync no las toca.
export async function POST() {
  try {
    const resultado = await syncBiwengerResults({ forzarHistorico: true });
    return Response.json({ ok: true, synced: resultado?.synced ?? 0 });
  } catch (err) {
    return Response.json({ error: err?.message ?? "No se ha podido sincronizar con Biwenger" }, { status: 502 });
  }
}
