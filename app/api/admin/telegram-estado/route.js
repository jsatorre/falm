import { supabase } from "../../../lib/supabaseServer";

// Diagnóstico del aviso a Telegram SIN mandar ningún mensaje al grupo: si
// las variables llegan a este despliegue, si el bot sigue siendo admin del
// grupo, y qué pasó en el último envío real (ver app/lib/telegram.js).
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  const { data } = await supabase.from("app_settings").select("value").eq("key", "telegram_ultimo_envio").maybeSingle();
  let ultimoEnvio = null;
  try {
    ultimoEnvio = data?.value ? JSON.parse(data.value) : null;
  } catch {}

  const resultado = { tokenPresente: Boolean(token), chatIdPresente: Boolean(chatId), ultimoEnvio };
  if (!token || !chatId) return Response.json(resultado);

  try {
    const yo = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
    resultado.bot = yo.ok ? yo.result.username : yo;
    if (yo.ok) {
      const miembro = await fetch(
        `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${yo.result.id}`
      ).then((r) => r.json());
      resultado.enElGrupo = miembro.ok
        ? { estado: miembro.result.status, puedeEscribir: miembro.result.can_post_messages ?? null }
        : miembro;
    }
  } catch (err) {
    resultado.errorAlConsultarTelegram = String(err);
  }
  return Response.json(resultado);
}
