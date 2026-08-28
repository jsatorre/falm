import { COOKIE_NAME, equipoDeSesion } from "../../lib/auth";
import { supabase } from "../../lib/supabaseServer";

function equipoAutenticado(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  return equipoDeSesion(cookie);
}

// La "ventana de fichajes" abierta es siempre la próxima jornada cara a
// cara (1-22) que todavía está pendiente — no hace falta que nadie la abra
// ni cierre a mano.
async function rondaDeFichajesActual() {
  const { data, error } = await supabase
    .from("rounds")
    .select("id, jornada")
    .lte("jornada", 22)
    .eq("status", "pending")
    .order("jornada", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request) {
  const teamId = equipoAutenticado(request);
  if (!teamId) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const ronda = await rondaDeFichajesActual();
  if (!ronda) {
    return Response.json({ player1: "", player2: "", cerrado: true });
  }

  const { data } = await supabase
    .from("team_wishlist")
    .select("player_1, player_2")
    .eq("round_id", ronda.id)
    .eq("team_id", teamId)
    .maybeSingle();

  return Response.json({ player1: data?.player_1 ?? "", player2: data?.player_2 ?? "", cerrado: false });
}

export async function POST(request) {
  const teamId = equipoAutenticado(request);
  if (!teamId) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const ronda = await rondaDeFichajesActual();
  if (!ronda) {
    return Response.json({ error: "No hay ventana de fichajes abierta" }, { status: 409 });
  }

  const { player1, player2 } = await request.json();
  const { error } = await supabase.from("team_wishlist").upsert(
    {
      round_id: ronda.id,
      team_id: teamId,
      player_1: (player1 ?? "").trim() || null,
      player_2: (player2 ?? "").trim() || null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "round_id,team_id" }
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
