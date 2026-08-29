import { supabase } from "../../../lib/supabaseServer";
import { getCaraACaraRounds } from "../../../lib/caraACaraRounds";
import { asegurarDeadlineFichajes } from "../../../lib/fichajesEngine";

async function leerConfig() {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["fichajes_dia_semana", "fichajes_hora"]);
  const config = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));
  return {
    diaSemana: config.fichajes_dia_semana != null ? Number(config.fichajes_dia_semana) : null,
    hora: config.fichajes_hora ?? null,
  };
}

export async function GET() {
  const config = await leerConfig();

  const rounds = await getCaraACaraRounds();
  let ronda = rounds.find((r) => r.status === "pending") ?? null;
  if (ronda) ronda = await asegurarDeadlineFichajes(ronda);

  return Response.json({
    ...config,
    proximaJornada: ronda ? { jornadaCaraACara: ronda.jornadaCaraACara, deadline: ronda.fichajes_deadline } : null,
  });
}

export async function POST(request) {
  const { diaSemana, hora } = await request.json();

  if (diaSemana == null || !hora) {
    return Response.json({ error: "Falta el día de la semana o la hora" }, { status: 400 });
  }

  const { error } = await supabase.from("app_settings").upsert([
    { key: "fichajes_dia_semana", value: String(diaSemana) },
    { key: "fichajes_hora", value: hora },
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
