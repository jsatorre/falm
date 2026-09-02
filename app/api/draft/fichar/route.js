import { COOKIE_NAME, equipoDeSesion } from "../../../lib/auth";
import { supabase } from "../../../lib/supabaseServer";
import { getEstadoDraft, puedeFichar } from "../../../lib/draftEngine";
import { enviarPushEquipo } from "../../../lib/push";

export async function POST(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { playerId } = await request.json();
  if (!playerId) return Response.json({ error: "Falta el jugador" }, { status: 400 });

  const estado = await getEstadoDraft();

  if (!estado.enMarcha || estado.terminado) {
    return Response.json({ error: "El draft no está en marcha ahora mismo" }, { status: 409 });
  }
  if (estado.turnoDeTeamId !== teamId) {
    return Response.json({ error: "No es tu turno" }, { status: 409 });
  }

  const jugador = estado.pool.find((j) => j.id === playerId);
  if (!jugador) return Response.json({ error: "Jugador no encontrado" }, { status: 404 });

  const check = puedeFichar(teamId, jugador, estado.ocupacion, estado.pool);
  if (!check.ok) return Response.json({ error: check.motivo }, { status: 409 });

  const { error: insertError } = await supabase.from("draft_picks").insert({
    pick_index: estado.currentPick,
    team_id: teamId,
    player_id: jugador.id,
    player_name: jugador.nombre,
    player_club: jugador.club,
  });
  if (insertError) {
    // Conflicto típico: alguien más se adelantó en ese mismo pick_index o
    // ese jugador ya se acaba de fichar (carreras poco probables, pero
    // las constraints UNIQUE de la tabla lo evitan igualmente).
    return Response.json({ error: "No se ha podido fichar (puede que ya se te hayan adelantado) — recarga y prueba otra vez" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("draft_state")
    .update({ current_pick: estado.currentPick + 1 })
    .eq("id", true);
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  // Avisar por push al equipo al que le toca ahora — se relee el estado
  // porque el turno real puede haber saltado más de un pick (equipos
  // retirados). Es solo un aviso de cortesía: si falla, no debe tumbar la
  // respuesta ni el fichaje ya hecho.
  try {
    const siguiente = await getEstadoDraft();
    if (siguiente.enMarcha && !siguiente.terminado && siguiente.turnoDeTeamId) {
      await enviarPushEquipo(siguiente.turnoDeTeamId, {
        title: "¡Te toca fichar!",
        body: `${estado.equipoPorId[teamId]?.name ?? "Un equipo"} ha fichado a ${jugador.nombre} — ahora te toca a ti.`,
        url: "/draft",
      });
    }
  } catch (err) {
    console.warn("No se ha podido avisar por push del siguiente turno del draft:", err);
  }

  return Response.json({ ok: true });
}
