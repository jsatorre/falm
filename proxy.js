import { NextResponse } from "next/server";
import { COOKIE_NAME, equipoDeSesion } from "./app/lib/auth";

const RUTAS_PUBLICAS = ["/login", "/api/auth/login"];

function esRutaPublica(pathname) {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export default function proxy(request) {
  const { pathname } = request.nextUrl;

  if (esRutaPublica(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);

  if (teamId) {
    // Se propaga el equipo autenticado a las rutas vía header, para que
    // /api/fichajes (y cualquier otra ruta con datos privados por equipo)
    // nunca tenga que fiarse de un teamId que venga del cliente.
    const headers = new Headers(request.headers);
    headers.set("x-team-id", teamId);
    return NextResponse.next({ request: { headers } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
