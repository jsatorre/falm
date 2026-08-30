import { supabase } from "../../../../lib/supabaseServer";
import { getPropietariosBiwenger } from "../../../../lib/draftEngine";

// Arranca el draft: sortea el orden de equipos (orden serpiente a partir de
// ahí, ver draftEngine.getEstadoDraft), deja el marcador de picks a 0, y
// toma UNA foto de quién tiene fichado a quién de verdad en Biwenger (12
// llamadas, la única vez que el draft gasta peticiones de la cuenta
// personal de Jaime) — esa foto es la que se usa durante TODO el draft, no
// se vuelve a consultar Biwenger hasta el próximo "Empezar draft".
// Si ya había un draft configurado antes, lo pisa (para reiniciar hay que
// pasar por /api/admin/draft/reset primero, que además borra los picks).
export async function POST() {
  const { data: teams, error: teamsError } = await supabase.from("teams").select("id, biwenger_user_id");
  if (teamsError) return Response.json({ error: teamsError.message }, { status: 500 });
  if (!teams || teams.length === 0) {
    return Response.json({ error: "No hay equipos" }, { status: 400 });
  }

  const teamOrder = [...teams.map((t) => t.id)];
  for (let i = teamOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamOrder[i], teamOrder[j]] = [teamOrder[j], teamOrder[i]];
  }

  let ocupacionBiwenger = [];
  try {
    const propietarios = await getPropietariosBiwenger(teams);
    ocupacionBiwenger = [...propietarios.entries()];
  } catch (err) {
    console.warn("No se ha podido tomar la foto inicial de propiedad de Biwenger para el draft:", err);
    // Se sigue arrancando el draft igual — peor tener el tablero sin esa
    // foto (todo libre hasta que se reinicie) que no poder empezar.
  }

  const { error: upsertError } = await supabase.from("draft_state").upsert({
    id: true,
    team_order: teamOrder,
    current_pick: 0,
    pick_size: 22,
    started_at: new Date().toISOString(),
    finished_at: null,
    retired_teams: [],
    ocupacion_biwenger: ocupacionBiwenger,
  });
  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });

  return Response.json({ ok: true, teamOrder });
}
