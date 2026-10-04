import { supabase } from "./supabaseServer";

// Vercel no deja los logs a mano, así que el resultado del último envío se
// guarda en app_settings: si un aviso no llega al grupo, aquí se ve por qué
// (ver /api/admin/telegram-estado).
async function registrarEnvio(ok, detalle) {
  try {
    await supabase.from("app_settings").upsert({
      key: "telegram_ultimo_envio",
      value: JSON.stringify({ at: new Date().toISOString(), ok, detalle }),
    });
  } catch {
    // el registro es solo diagnóstico, nunca debe romper el aviso
  }
}

/**
 * Aviso a un grupo de Telegram cuando se cierra una jornada — necesita un
 * bot creado con @BotFather (TELEGRAM_BOT_TOKEN) añadido al grupo, y el
 * chat_id de ese grupo (TELEGRAM_CHAT_ID, un número negativo para grupos).
 * Sin esas dos variables no hace nada (no revienta el sync por no estar
 * configurado).
 */
export async function enviarTelegram(texto, { html = false } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    console.warn("Telegram no configurado (falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID) — no se manda el aviso");
    await registrarEnvio(false, "Faltan variables de entorno: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      disable_web_page_preview: true,
      ...(html ? { parse_mode: "HTML" } : {}),
    }),
  });
  if (!res.ok) {
    const cuerpo = await res.text();
    console.warn("No se ha podido enviar el aviso de Telegram:", cuerpo);
    await registrarEnvio(false, `${res.status}: ${cuerpo}`);
    return;
  }
  await registrarEnvio(true, texto.split("\n")[0]);
}
