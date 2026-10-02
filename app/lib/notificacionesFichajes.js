import { enviarTelegram } from "./telegram";

function escaparHtml(texto) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Avisa por Telegram de los fichajes recién resueltos de una jornada —
 * mismo estilo que el aviso de jornada cerrada (ver notificacionesJornada.js):
 * negrita para lo importante, sin <pre> (Telegram lo trata como bloque de
 * código y corta líneas en móvil), cada sección en <blockquote>, sin
 * emojis, enlace a la app al final.
 *
 * @param {{ jornadaCaraACara: number }} ronda
 * @param {Array<{ teamId: string, player: string }>} asignaciones
 * @param {Array<{ id: string, name: string }>} teams
 * @param {boolean} esExtra  true si es una Ventana Extra (no la de una jornada)
 */
export async function avisarFichajesResueltos(ronda, asignaciones, teams, esExtra = false) {
  if (asignaciones.length === 0) return; // nadie ha fichado esta jornada, nada que avisar

  const nombrePorId = new Map(teams.map((t) => [t.id, t.name]));
  const lineas = asignaciones.map(
    (a) => `<b>${escaparHtml(nombrePorId.get(a.teamId) ?? "?")}</b> → ${escaparHtml(a.player)}`
  );

  const titulo = esExtra ? "Fichajes de la Ventana Extra resueltos" : `Fichajes de la Jornada ${ronda.jornadaCaraACara} resueltos`;

  const mensaje = [
    `<b>${titulo}</b>`,
    "",
    `<blockquote>${lineas.join("\n")}</blockquote>`,
    "",
    `<a href="https://falm.vercel.app/fichajes">Ver en la app</a>`,
    "",
    "Enhorabuena a las premiadas.",
  ].join("\n");

  try {
    await enviarTelegram(mensaje, { html: true });
  } catch (err) {
    console.warn(`No se ha podido avisar por Telegram de los fichajes (${esExtra ? "ventana extra" : `jornada ${ronda.jornadaCaraACara}`}):`, err);
  }
}
