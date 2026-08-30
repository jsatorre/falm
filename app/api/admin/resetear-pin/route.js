import bcrypt from "bcryptjs";
import { supabase } from "../../../lib/supabaseServer";

function pinAleatorio() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// Para cuando a alguien se le olvida el PIN y no puede ni entrar a
// cambiárselo él mismo (ver /cuenta) — genera uno nuevo al azar, lo guarda
// cifrado y lo devuelve EN CLARO una sola vez, para que el admin se lo
// pase a mano (Telegram, WhatsApp...). No queda guardado en ningún sitio
// en texto plano.
export async function POST(request) {
  const { teamId } = await request.json();
  if (!teamId) return Response.json({ error: "Falta el equipo" }, { status: 400 });

  const pin = pinAleatorio();
  const { error } = await supabase
    .from("teams")
    .update({ pin_hash: bcrypt.hashSync(pin, 10) })
    .eq("id", teamId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, pin });
}
