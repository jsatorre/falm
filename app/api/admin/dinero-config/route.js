import { supabase } from "../../../lib/supabaseServer";
import { getConfigDinero } from "../../../lib/dineroConfig";

export async function GET() {
  const config = await getConfigDinero();
  return Response.json({
    cuota: config.cuota,
    ...config.importes,
    suddenCampeonTeamId: config.sudden.campeonTeamId,
    suddenSubcampeonTeamId: config.sudden.subcampeonTeamId,
    teams: config.teams,
  });
}

export async function POST(request) {
  const body = await request.json();

  const filasSettings = [
    ["dinero_cuota", body.cuota],
    ["dinero_premio_liga_campeon", body.ligaCampeon],
    ["dinero_premio_liga_subcampeon", body.ligaSubcampeon],
    ["dinero_premio_sudden_campeon", body.suddenCampeon],
    ["dinero_premio_sudden_subcampeon", body.suddenSubcampeon],
    ["dinero_premio_jornada", body.jornada],
    ["dinero_premio_vuelta", body.vuelta],
    ["dinero_sudden_campeon_team_id", body.suddenCampeonTeamId ?? null],
    ["dinero_sudden_subcampeon_team_id", body.suddenSubcampeonTeamId ?? null],
  ].map(([key, value]) => ({ key, value: value == null ? null : String(value) }));

  const { error: settingsError } = await supabase.from("app_settings").upsert(filasSettings, { onConflict: "key" });
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500 });

  if (body.participaDinero) {
    for (const [teamId, participa] of Object.entries(body.participaDinero)) {
      const { error } = await supabase.from("teams").update({ participa_dinero: participa }).eq("id", teamId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
