import { supabase } from "../../../lib/supabaseServer";

// Misma lógica que scripts/aplazar-jornada.mjs, pero accesible desde la
// zona /admin en vez de por terminal: mueve los enfrentamientos de la
// jornada de Liga indicada a la siguiente jornada de Liga libre.
export async function POST(request) {
  const { jornadaLiga } = await request.json();
  const jornadaASaltar = Number(jornadaLiga);
  if (!jornadaASaltar) {
    return Response.json({ error: "Falta la jornada de Liga a saltar" }, { status: 400 });
  }

  const { data: rondaASaltar, error: rondaError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .eq("jornada", jornadaASaltar)
    .maybeSingle();
  if (rondaError) return Response.json({ error: rondaError.message }, { status: 500 });
  if (!rondaASaltar) {
    return Response.json({ error: `No existe ninguna jornada de Liga número ${jornadaASaltar}` }, { status: 404 });
  }

  const { data: fixturesASaltar, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id")
    .eq("round_id", rondaASaltar.id);
  if (fixturesError) return Response.json({ error: fixturesError.message }, { status: 500 });
  if (fixturesASaltar.length === 0) {
    return Response.json({ error: `La Jornada de Liga ${jornadaASaltar} no tiene enfrentamientos asignados` }, { status: 400 });
  }

  const { data: todosFixtures, error: todosFixturesError } = await supabase
    .from("fixtures")
    .select("round_id");
  if (todosFixturesError) return Response.json({ error: todosFixturesError.message }, { status: 500 });
  const roundIdsUsados = new Set(todosFixtures.map((f) => f.round_id));

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .order("jornada", { ascending: true });
  if (roundsError) return Response.json({ error: roundsError.message }, { status: 500 });

  const maxJornadaUsada = Math.max(...rounds.filter((r) => roundIdsUsados.has(r.id)).map((r) => r.jornada));
  const siguienteRondaLibre = rounds.find((r) => r.jornada > maxJornadaUsada && !roundIdsUsados.has(r.id));
  if (!siguienteRondaLibre) {
    return Response.json({ error: "No queda ninguna jornada de Liga libre más adelante" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("fixtures")
    .update({ round_id: siguienteRondaLibre.id })
    .eq("round_id", rondaASaltar.id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({
    ok: true,
    jornadaSaltada: jornadaASaltar,
    jornadaNueva: siguienteRondaLibre.jornada,
  });
}
