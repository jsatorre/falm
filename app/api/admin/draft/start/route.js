import { supabase } from "../../../../lib/supabaseServer";

// Arranca el draft: sortea el orden de equipos (orden serpiente a partir de
// ahí, ver draftEngine.getEstadoDraft), y deja el marcador de picks a 0.
// Si ya había un draft configurado antes, lo pisa (para reiniciar hay que
// pasar por /api/admin/draft/reset primero, que además borra los picks).
export async function POST() {
  const { data: teams, error: teamsError } = await supabase.from("teams").select("id");
  if (teamsError) return Response.json({ error: teamsError.message }, { status: 500 });
  if (!teams || teams.length === 0) {
    return Response.json({ error: "No hay equipos" }, { status: 400 });
  }

  const teamOrder = [...teams.map((t) => t.id)];
  for (let i = teamOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamOrder[i], teamOrder[j]] = [teamOrder[j], teamOrder[i]];
  }

  const { error: upsertError } = await supabase.from("draft_state").upsert({
    id: true,
    team_order: teamOrder,
    current_pick: 0,
    pick_size: 22,
    started_at: new Date().toISOString(),
    finished_at: null,
  });
  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });

  return Response.json({ ok: true, teamOrder });
}
