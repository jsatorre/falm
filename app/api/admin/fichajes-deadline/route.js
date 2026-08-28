import { supabase } from "../../../lib/supabaseServer";
import { getCaraACaraRounds } from "../../../lib/caraACaraRounds";

export async function GET() {
  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status === "pending") ?? null;
  if (!ronda) return Response.json({ ronda: null });

  return Response.json({
    ronda: { jornadaCaraACara: ronda.jornadaCaraACara, deadline: ronda.fichajes_deadline },
  });
}

export async function POST(request) {
  const { deadline } = await request.json();

  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status === "pending") ?? null;
  if (!ronda) {
    return Response.json({ error: "No hay ninguna jornada de fichajes abierta ahora mismo" }, { status: 409 });
  }

  const { error } = await supabase
    .from("rounds")
    .update({ fichajes_deadline: deadline || null })
    .eq("id", ronda.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, jornadaCaraACara: ronda.jornadaCaraACara });
}
