// Rellena round_results con puntos de mentira para poder ver la app con
// pinta real (clasificación, jornada en directo) antes de que la liga
// cara a cara empiece a tener datos reales. NO toca rounds.status (eso lo
// sigue llevando el sync real contra Biwenger) — la clasificación cuenta
// cualquier fixture con resultado en los dos lados, así que esto basta.
//
// Uso: node scripts/fill-test-data.mjs
// Para quitarlo: node scripts/clear-test-data.mjs
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Jornada 1: a medias (para ver la pantalla "en directo" con partidos
// todavía jugándose). Jornadas 2 y 3: completas (para ver la
// clasificación con datos).
const JORNADA_A_MEDIAS = 1;
const JORNADAS_COMPLETAS = [2, 3];

function puntosDeterministas(teamIndex, jornada) {
  return 32 + ((teamIndex * 11 + jornada * 17) % 42);
}

async function jornadasCaraACara() {
  const { data: fixtureRoundIds, error: fixturesError } = await supabase
    .from("fixtures")
    .select("round_id");
  if (fixturesError) throw fixturesError;

  const roundIds = [...new Set(fixtureRoundIds.map((f) => f.round_id))];
  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .in("id", roundIds)
    .order("jornada", { ascending: true });
  if (roundsError) throw roundsError;

  return rounds.map((r, i) => ({ ...r, jornadaCaraACara: i + 1 }));
}

async function main() {
  const [rounds, { data: teams, error: teamsError }, { data: fixturesRaw, error: fixturesError }] =
    await Promise.all([
      jornadasCaraACara(),
      supabase.from("teams").select("id, name").order("name"),
      supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    ]);
  if (teamsError) throw teamsError;
  if (fixturesError) throw fixturesError;

  const teamIndexPorId = new Map(teams.map((t, i) => [t.id, i]));
  const roundIdPorJornada = new Map(rounds.map((r) => [r.jornadaCaraACara, r.id]));

  const filas = [];

  // Jornada a medias: la mitad de los equipos ya tienen puntos, la otra
  // mitad todavía no (simula partidos en marcha).
  const roundIdMedias = roundIdPorJornada.get(JORNADA_A_MEDIAS);
  if (roundIdMedias) {
    const fixturesMedias = fixturesRaw.filter((f) => f.round_id === roundIdMedias);
    fixturesMedias.forEach((f, i) => {
      filas.push({
        round_id: roundIdMedias,
        team_id: f.team_a_id,
        biwenger_points: puntosDeterministas(teamIndexPorId.get(f.team_a_id), JORNADA_A_MEDIAS),
      });
      if (i % 2 === 0) {
        filas.push({
          round_id: roundIdMedias,
          team_id: f.team_b_id,
          biwenger_points: puntosDeterministas(teamIndexPorId.get(f.team_b_id), JORNADA_A_MEDIAS),
        });
      }
    });
  }

  for (const jornada of JORNADAS_COMPLETAS) {
    const roundId = roundIdPorJornada.get(jornada);
    if (!roundId) continue;
    for (const [teamId, teamIndex] of teamIndexPorId) {
      filas.push({
        round_id: roundId,
        team_id: teamId,
        biwenger_points: puntosDeterministas(teamIndex, jornada),
      });
    }
  }

  const { error } = await supabase
    .from("round_results")
    .upsert(filas, { onConflict: "round_id,team_id" });
  if (error) throw error;

  console.log(`Rellenados ${filas.length} resultados de prueba (jornada ${JORNADA_A_MEDIAS} a medias, jornadas ${JORNADAS_COMPLETAS.join(", ")} completas).`);
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
