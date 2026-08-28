import crypto from "crypto";

// A diferencia de reposiciones-app (contraseña única compartida), aquí cada
// equipo tiene su propio PIN, así que la cookie de sesión lleva QUÉ equipo
// es (`teamId.hmac`), firmado con SESSION_SECRET — quien no conozca el
// secreto del servidor no puede fabricar una cookie válida ni suplantar a
// otro equipo para leer su wishlist de fichajes.
export const COOKIE_NAME = "biwenger_liga_session";

function firmar(teamId) {
  const secret = process.env.SESSION_SECRET;
  return crypto.createHmac("sha256", secret).update(`team:${teamId}`).digest("hex");
}

export function crearCookieSesion(teamId) {
  return `${teamId}.${firmar(teamId)}`;
}

/**
 * Devuelve el teamId si la cookie es válida, o null si no lo es (o no hay
 * cookie). No confía en el teamId de la cookie sin verificar el HMAC.
 */
export function equipoDeSesion(cookieValue) {
  if (!cookieValue) return null;
  const separador = cookieValue.lastIndexOf(".");
  if (separador === -1) return null;

  const teamId = cookieValue.slice(0, separador);
  const firma = cookieValue.slice(separador + 1);
  const firmaEsperada = firmar(teamId);

  try {
    const valido = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(firmaEsperada));
    return valido ? teamId : null;
  } catch {
    return null;
  }
}
