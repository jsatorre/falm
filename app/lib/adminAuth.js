import crypto from "crypto";

// Sesión de admin independiente de la de los equipos: una única
// contraseña (ADMIN_PASSWORD), separada de los PIN — para acciones que
// afectan a toda la liga (aplazar una jornada, etc.), no a un equipo
// concreto.
export const ADMIN_COOKIE_NAME = "biwenger_liga_admin_session";

function tokenAdmin() {
  const secret = process.env.SESSION_SECRET;
  return crypto.createHmac("sha256", secret).update("admin-authenticated").digest("hex");
}

export function crearCookieAdmin() {
  return tokenAdmin();
}

export function esSesionAdminValida(cookieValue) {
  if (!cookieValue) return false;
  const esperado = tokenAdmin();
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(esperado));
  } catch {
    return false;
  }
}
