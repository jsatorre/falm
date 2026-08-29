import { COOKIE_NAME, equipoDeSesion } from "../../../lib/auth";
import { supabase } from "../../../lib/supabaseServer";

// Alterna "ya no quiero más jugadores" para el equipo autenticado — un
// equipo retirado se salta automáticamente en sus turnos futuros (ver
// getEstadoDraft en draftEngine.js) hasta que vuelva a llamar aquí para
// deshacerlo. No hace falta ser admin: cada equipo decide por sí mismo.
export async function POST(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { data: estado, error } = await supabase
    .from("draft_state")
    .select("retired_teams")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!estado) return Response.json({ error: "El draft no está configurado" }, { status: 409 });

  const actuales = new Set(estado.retired_teams ?? []);
  const yaRetirado = actuales.has(teamId);
  if (yaRetirado) {
    actuales.delete(teamId);
  } else {
    actuales.add(teamId);
  }

  const { error: updateError } = await supabase
    .from("draft_state")
    .update({ retired_teams: [...actuales] })
    .eq("id", true);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ ok: true, retirado: !yaRetirado });
}
