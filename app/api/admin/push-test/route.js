import { supabase } from "../../../lib/supabaseServer";
import { enviarPushEquipo } from "../../../lib/push";

// Manda una notificación de prueba a TODOS los dispositivos suscritos de
// un equipo — para comprobar de verdad, desde tu propio móvil, que las
// notificaciones llegan (el navegador de pruebas del propio desarrollo no
// puede: tiene los permisos de notificación bloqueados de serie).
export async function POST(request) {
  const { teamId } = await request.json();
  if (!teamId) return Response.json({ error: "Falta el equipo" }, { status: 400 });

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (!count) {
    return Response.json({ error: "Ese equipo no tiene notificaciones activadas en ningún dispositivo" }, { status: 409 });
  }

  const resultado = await enviarPushEquipo(teamId, {
    title: "FALM",
    body: "Notificación de prueba — si ves esto, funciona.",
    url: "/",
  });

  return Response.json({ ok: true, dispositivos: count, ...resultado });
}
