import { supabase } from "./supabaseServer";

/**
 * Las jornadas de Liga que forman parte del calendario cara a cara (las
 * que tienen fixtures) — no se asume que empiecen en la Jornada 1 ni que
 * sean un rango fijo: se derivan de qué rounds tienen de verdad un
 * enfrentamiento asignado. Devuelve las jornadas ordenadas, con un índice
 * `jornadaCaraACara` 1-based (independiente del número real de Jornada de
 * Liga) para que el resto de la app pueda seguir hablando de "jornada 1,
 * 2, 3..." de la competición de amigos.
 */
export async function getCaraACaraRounds() {
  const { data: fixtureRoundIds, error: fixturesError } = await supabase
    .from("fixtures")
    .select("round_id");
  if (fixturesError) throw fixturesError;

  const roundIds = [...new Set(fixtureRoundIds.map((f) => f.round_id))];
  if (roundIds.length === 0) return [];

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, jornada, status, fichajes_deadline")
    .in("id", roundIds)
    .order("jornada", { ascending: true });
  if (roundsError) throw roundsError;

  return rounds.map((r, i) => ({ ...r, jornadaCaraACara: i + 1 }));
}

/**
 * De la lista de getCaraACaraRounds(), cuál es "la jornada en directo": la
 * primera que no esté ya cerrada, o la última si la temporada ha
 * terminado sus 22 jornadas. Mismo criterio que usa getRondaEnDirecto — se
 * saca aparte porque también lo necesita sync.js para decidir si merece
 * la pena volver a preguntarle a Biwenger (ver syncBiwengerResultsCached).
 */
export function elegirRondaEnDirecto(rounds) {
  return rounds.find((r) => r.status !== "finished") ?? rounds.at(-1) ?? null;
}
