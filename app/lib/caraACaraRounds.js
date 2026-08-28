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
    .select("id, jornada, status")
    .in("id", roundIds)
    .order("jornada", { ascending: true });
  if (roundsError) throw roundsError;

  return rounds.map((r, i) => ({ ...r, jornadaCaraACara: i + 1 }));
}
