import webpush from "web-push";
import { supabase } from "./supabaseServer";

let configurado = false;
function asegurarConfig() {
  if (configurado) return;
  webpush.setVapidDetails(
    "https://falm.vercel.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configurado = true;
}

/**
 * Manda una notificación push a TODOS los dispositivos suscritos de un
 * equipo. Si algún dispositivo ya no existe (el usuario desinstaló la app,
 * borró datos del navegador...) Web Push devuelve 404/410 — esa
 * suscripción se borra sola, no hace falta que nadie la limpie a mano.
 *
 * @param {string} teamId
 * @param {{ title: string, body: string, url?: string }} payload
 */
export async function enviarPushEquipo(teamId, payload) {
  asegurarConfig();

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("team_id", teamId);
  if (error) {
    console.warn("No se han podido leer las suscripciones push:", error);
    return;
  }
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.warn(`No se ha podido enviar el push a ${sub.endpoint}:`, err.message ?? err);
        }
      }
    })
  );
}
