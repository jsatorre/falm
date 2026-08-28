import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { COOKIE_NAME, crearCookieSesion } from "../../../lib/auth";
import { supabase } from "../../../lib/supabaseServer";

export async function POST(request) {
  const { teamId, pin } = await request.json();

  const { data: equipo } = await supabase
    .from("teams")
    .select("id, name, pin_hash")
    .eq("id", teamId)
    .maybeSingle();

  if (!equipo || !pin || !bcrypt.compareSync(pin, equipo.pin_hash)) {
    return Response.json({ error: "PIN incorrecto" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, crearCookieSesion(equipo.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });

  return Response.json({ ok: true, teamName: equipo.name });
}

export async function GET() {
  const { data: equipos, error } = await supabase
    .from("teams")
    .select("id, name, crest_url")
    .order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ equipos });
}
