import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, crearCookieAdmin } from "../../../lib/adminAuth";

export async function POST(request) {
  const { password } = await request.json();

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, crearCookieAdmin(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return Response.json({ ok: true });
}
