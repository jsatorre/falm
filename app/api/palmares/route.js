import { COOKIE_NAME, equipoDeSesion } from "../../lib/auth";
import { supabase } from "../../lib/supabaseServer";

function equipoAutenticado(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  return equipoDeSesion(cookie);
}

export async function GET() {
  const [{ data: trophies, error: trophiesError }, { data: records, error: recordsError }] = await Promise.all([
    supabase
      .from("trophies")
      .select("id, season_label, note, team:champion_team_id(id, name, crest_url)")
      .order("season_label", { ascending: false }),
    supabase
      .from("records")
      .select("id, label, value, season_label, team:team_id(id, name, crest_url)")
      .order("season_label", { ascending: false }),
  ]);
  if (trophiesError) return Response.json({ error: trophiesError.message }, { status: 500 });
  if (recordsError) return Response.json({ error: recordsError.message }, { status: 500 });

  return Response.json({ trophies, records });
}

// Cualquier equipo logueado puede añadir palmarés — es un grupo de amigos
// de confianza, no hace falta un rol de admin aparte para esto.
export async function POST(request) {
  const teamId = equipoAutenticado(request);
  if (!teamId) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();

  if (body.type === "trophy") {
    const { seasonLabel, championTeamId, note } = body;
    if (!seasonLabel || !championTeamId) {
      return Response.json({ error: "Falta temporada o equipo campeón" }, { status: 400 });
    }
    const { error } = await supabase
      .from("trophies")
      .insert({ season_label: seasonLabel, champion_team_id: championTeamId, note: note || null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  if (body.type === "record") {
    const { label, value, teamId: recordTeamId, seasonLabel } = body;
    if (!label || !value) {
      return Response.json({ error: "Falta el nombre o el valor del récord" }, { status: 400 });
    }
    const { error } = await supabase
      .from("records")
      .insert({ label, value, team_id: recordTeamId || null, season_label: seasonLabel || null });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Tipo desconocido" }, { status: 400 });
}
