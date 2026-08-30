import bcrypt from "bcryptjs";
import { COOKIE_NAME, equipoDeSesion } from "../../../lib/auth";
import { supabase } from "../../../lib/supabaseServer";

export async function POST(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { pinActual, pinNuevo } = await request.json();
  if (!/^\d{4}$/.test(pinNuevo ?? "")) {
    return Response.json({ error: "El PIN nuevo tiene que ser de 4 dígitos" }, { status: 400 });
  }

  const { data: equipo, error: equipoError } = await supabase
    .from("teams")
    .select("pin_hash")
    .eq("id", teamId)
    .maybeSingle();
  if (equipoError) return Response.json({ error: equipoError.message }, { status: 500 });
  if (!equipo || !pinActual || !bcrypt.compareSync(pinActual, equipo.pin_hash)) {
    return Response.json({ error: "El PIN actual no es correcto" }, { status: 401 });
  }

  const { error: updateError } = await supabase
    .from("teams")
    .update({ pin_hash: bcrypt.hashSync(pinNuevo, 10) })
    .eq("id", teamId);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
