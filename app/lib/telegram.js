/**
 * Aviso a un grupo de Telegram cuando se cierra una jornada — necesita un
 * bot creado con @BotFather (TELEGRAM_BOT_TOKEN) añadido al grupo, y el
 * chat_id de ese grupo (TELEGRAM_CHAT_ID, un número negativo para grupos).
 * Sin esas dos variables no hace nada (no revienta el sync por no estar
 * configurado).
 */
export async function enviarTelegram(texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram no configurado (falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID) — no se manda el aviso");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    console.warn("No se ha podido enviar el aviso de Telegram:", await res.text());
  }
}
