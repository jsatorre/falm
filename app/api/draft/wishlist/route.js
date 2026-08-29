import { COOKIE_NAME, equipoDeSesion } from "../../../lib/auth";
import { supabase } from "../../../lib/supabaseServer";

// Wishlist privada: cada equipo solo puede ver/tocar la suya (teamId sale
// de la cookie firmada, nunca del cliente — mismo patrón que /api/fichajes).
export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("draft_wishlist")
    .select("player_id")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ playerIds: data.map((w) => w.player_id) });
}

export async function POST(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { playerId } = await request.json();
  if (!playerId) return Response.json({ error: "Falta el jugador" }, { status: 400 });

  const { error } = await supabase
    .from("draft_wishlist")
    .upsert({ team_id: teamId, player_id: playerId }, { onConflict: "team_id,player_id" });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const playerId = Number(searchParams.get("playerId"));
  if (!playerId) return Response.json({ error: "Falta el jugador" }, { status: 400 });

  const { error } = await supabase
    .from("draft_wishlist")
    .delete()
    .eq("team_id", teamId)
    .eq("player_id", playerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
