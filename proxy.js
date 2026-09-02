import { NextResponse } from "next/server";
import { COOKIE_NAME, equipoDeSesion } from "./app/lib/auth";
import { ADMIN_COOKIE_NAME, esSesionAdminValida } from "./app/lib/adminAuth";

const RUTAS_PUBLICAS = ["/login", "/api/auth/login", "/admin/login", "/api/admin/login"];

function esRutaPublica(pathname) {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

function esRutaAdmin(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

export default function proxy(request) {
  const { pathname } = request.nextUrl;

  if (esRutaPublica(pathname)) {
    return NextResponse.next();
  }

  // /admin va con su propia sesión (contraseña única, independiente de los
  // PIN de equipo) — nunca se mezcla con la lógica de abajo.
  if (esRutaAdmin(pathname)) {
    const cookieAdmin = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (esSesionAdminValida(cookieAdmin)) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
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

// Recursos del PWA (manifest, iconos, service worker) — tienen que
// servirse sin sesión, igual que favicon.ico: si el middleware los
// redirige a /login para quien no tiene cookie de equipo, Chrome recibe
// HTML en vez de JSON/JS/PNG y no puede considerar la web instalable.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192|icon-512|apple-icon|icon.svg).*)",
  ],
};
