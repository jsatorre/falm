import { getCaraACaraRounds } from "../../../lib/caraACaraRounds";
import { asegurarDeadlineFichajes, deadlinePasada, publicarFichajesSiToca } from "../../../lib/fichajesEngine";
import { getVentanaExtra, deadlineExtraPasada, publicarVentanaExtraSiToca } from "../../../lib/ventanaExtra";
import { syncBiwengerResults } from "../../../lib/sync";

// Punto de entrada para un programador externo (Vercel Cron, cron-job.org...):
// hace lo que hasta ahora solo ocurría cuando alguien abría la app.
//  1. Si ya pasó la hora tope de la ventana de fichajes (normal o Extra) y no
//     se ha publicado, la publica — y con ello manda el push y el Telegram.
//  2. Refresca el estado de las jornadas de Biwenger, que dispara el aviso de
//     "jornada cerrada" (con los puntos oficiales) sin esperar a una visita.
// Es idempotente: llamarlo mil veces no repite nada, así que puede ir cada
// pocos minutos. Se protege con CRON_SECRET (Vercel Cron lo manda solo como
// "Authorization: Bearer <CRON_SECRET>"; un programador externo, igual).
export async function GET(request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = {};

  try {
    const rounds = await getCaraACaraRounds();
    const pendiente = rounds.find((r) => r.status === "pending") ?? null;
    if (!pendiente) {
      resultado.fichajes = "sin ventana abierta";
    } else {
      const ronda = await asegurarDeadlineFichajes(pendiente);
      // Primero la ventana normal (la Extra se apoya en sus fichajes).
      if (deadlinePasada(ronda)) {
        const asignaciones = await publicarFichajesSiToca(ronda);
        resultado.fichajes = `ventana normal cerrada (${asignaciones.length} fichajes)`;
      } else {
        resultado.fichajes = "ventana normal abierta";
      }

      const extra = await getVentanaExtra(ronda);
      if (extra && !extra.asignaciones && deadlineExtraPasada(extra)) {
        const asignaciones = await publicarVentanaExtraSiToca(ronda, extra);
        resultado.extra = `ventana extra cerrada (${asignaciones.length} fichajes)`;
      } else if (extra) {
        resultado.extra = extra.asignaciones ? "ventana extra ya publicada" : "ventana extra abierta";
      }
    }
  } catch (err) {
    console.error("Cron de fichajes falló:", err);
    resultado.fichajesError = err?.message ?? String(err);
  }

  try {
    const sync = await syncBiwengerResults();
    resultado.sync = sync?.motivo ?? `${sync?.synced ?? 0} filas`;
  } catch (err) {
    console.error("Cron: sync con Biwenger falló:", err);
    resultado.syncError = err?.message ?? String(err);
  }

  return Response.json(resultado);
}
