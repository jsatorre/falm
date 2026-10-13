import { supabase } from "../../../lib/supabaseServer";
import { getCaraACaraRounds } from "../../../lib/caraACaraRounds";
import { getRondasBloqueadas, bloquearRonda, desbloquearRonda } from "../../../lib/jornadasManuales";
import { avisarJornadasCerradas } from "../../../lib/notificacionesJornada";

// Sin roundId: lista de jornadas con su estado de bloqueo. Con roundId: además
// los enfrentamientos de esa jornada con los puntos que hay ahora mismo.
export async function GET(request) {
  const roundId = new URL(request.url).searchParams.get("roundId");
  const [rounds, bloqueadas] = await Promise.all([getCaraACaraRounds(), getRondasBloqueadas()]);

  const jornadas = rounds.map((r) => ({
    id: r.id,
    jornadaCaraACara: r.jornadaCaraACara,
    jornada: r.jornada,
    status: r.status,
    bloqueada: bloqueadas.has(r.id),
  }));
  if (!roundId) return Response.json({ jornadas });

  const [{ data: fixtures }, { data: teams }, { data: results }] = await Promise.all([
    supabase.from("fixtures").select("team_a_id, team_b_id").eq("round_id", roundId),
    supabase.from("teams").select("id, name"),
    supabase.from("round_results").select("team_id, biwenger_points").eq("round_id", roundId),
  ]);
  const nombre = new Map(teams.map((t) => [t.id, t.name]));
  const puntos = new Map(results.map((r) => [r.team_id, r.biwenger_points]));

  return Response.json({
    jornadas,
    enfrentamientos: (fixtures ?? []).map((f) => ({
      teamA: { id: f.team_a_id, name: nombre.get(f.team_a_id) ?? "?", puntos: puntos.get(f.team_a_id) ?? null },
      teamB: { id: f.team_b_id, name: nombre.get(f.team_b_id) ?? "?", puntos: puntos.get(f.team_b_id) ?? null },
    })),
  });
}

export async function POST(request) {
  const { accion, roundId, puntos, avisar } = await request.json();

  const rounds = await getCaraACaraRounds();
  if (!rounds.some((r) => r.id === roundId)) {
    return Response.json({ error: "Esa jornada no está en el calendario cara a cara" }, { status: 404 });
  }

  if (accion === "bloquear") {
    await bloquearRonda(roundId);
    return Response.json({ ok: true });
  }

  if (accion === "desbloquear") {
    await desbloquearRonda(roundId);
    return Response.json({ ok: true });
  }

  if (accion === "guardar") {
    // Solo con la jornada bloqueada: si no, el siguiente sync pisaría lo escrito.
    const bloqueadas = await getRondasBloqueadas();
    if (!bloqueadas.has(roundId)) {
      return Response.json({ error: "Bloquea la jornada antes de guardar puntos a mano" }, { status: 409 });
    }

    const filas = [];
    for (const [teamId, valor] of Object.entries(puntos ?? {})) {
      if (valor === "" || valor == null) continue;
      const numero = Number(valor);
      if (!Number.isFinite(numero)) {
        return Response.json({ error: "Hay puntos que no son un número" }, { status: 400 });
      }
      filas.push({
        round_id: roundId,
        team_id: teamId,
        biwenger_points: numero,
        jugadores_en_vivo: null, // el desglose en vivo ya no cuadra con lo escrito a mano
        synced_at: new Date().toISOString(),
      });
    }
    if (filas.length === 0) {
      return Response.json({ error: "No hay ningún punto que guardar" }, { status: 400 });
    }

    const { error } = await supabase.from("round_results").upsert(filas, { onConflict: "round_id,team_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (avisar) await avisarJornadasCerradas([roundId]);
    return Response.json({ ok: true, guardados: filas.length });
  }

  return Response.json({ error: "Acción desconocida" }, { status: 400 });
}
