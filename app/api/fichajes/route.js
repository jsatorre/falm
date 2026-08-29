import { COOKIE_NAME, equipoDeSesion } from "../../lib/auth";
import { supabase } from "../../lib/supabaseServer";
import { getCaraACaraRounds } from "../../lib/caraACaraRounds";
import { publicarFichajesSiToca, deadlinePasada, asegurarDeadlineFichajes } from "../../lib/fichajesEngine";

function equipoAutenticado(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  return equipoDeSesion(cookie);
}

// La "ventana de fichajes" abierta es siempre la próxima jornada cara a
// cara que todavía está pendiente — no hace falta que nadie la abra ni
// cierre a mano.
async function rondaDeFichajesActual() {
  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status === "pending") ?? null;
  if (!ronda) return null;
  // Si hay una regla semanal configurada en /admin y esta jornada todavía
  // no tiene hora tope, se le asigna aquí (una sola vez, la primera visita).
  return asegurarDeadlineFichajes(ronda);
}

export async function GET(request) {
  const teamId = equipoAutenticado(request);
  if (!teamId) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const ronda = await rondaDeFichajesActual();
  if (!ronda) {
    return Response.json({ player1: "", player2: "", cerrado: true, publicado: false });
  }

  if (deadlinePasada(ronda)) {
    const asignaciones = await publicarFichajesSiToca(ronda);
    const { data: teams } = await supabase.from("teams").select("id, name, crest_url");
    const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));

    return Response.json({
      cerrado: false,
      publicado: true,
      deadline: ronda.fichajes_deadline,
      asignaciones: asignaciones.map((a) => ({
        team: equipoPorId[a.team_id] ?? null,
        player: a.player,
        esTuyo: a.team_id === teamId,
      })),
    });
  }

  const { data } = await supabase
    .from("team_wishlist")
    .select("player_1, player_2")
    .eq("round_id", ronda.id)
    .eq("team_id", teamId)
    .maybeSingle();

  return Response.json({
    player1: data?.player_1 ?? "",
    player2: data?.player_2 ?? "",
    cerrado: false,
    publicado: false,
    deadline: ronda.fichajes_deadline,
  });
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
  if (deadlinePasada(ronda)) {
    return Response.json({ error: "Ya se ha cerrado la ventana de fichajes de esta jornada" }, { status: 409 });
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
