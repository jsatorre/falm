// Vuelve a generar el calendario cara a cara (fixtures), pero empezando en
// la Jornada 4 de Liga en vez de la 1 (así arrancó la liga de verdad este
// año). Borra los fixtures existentes y los sustituye — no toca teams,
// rounds ni round_results.
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const { generarCalendarioDobleVuelta } = await import("../app/lib/scoring.js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const JORNADA_INICIO = 4; // la cara a cara arranca en la Jornada 4 de Liga
const JORNADAS_TOTALES = 22; // doble vuelta con 12 equipos

async function main() {
  console.log("Borrando fixtures existentes...");
  const { error: delError } = await supabase.from("fixtures").delete().not("id", "is", null);
  if (delError) throw delError;

  console.log("Leyendo equipos y jornadas...");
  const { data: teams, error: teamsError } = await supabase.from("teams").select("id").order("name");
  if (teamsError) throw teamsError;

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .gte("jornada", JORNADA_INICIO)
    .lte("jornada", JORNADA_INICIO + JORNADAS_TOTALES - 1)
    .order("jornada", { ascending: true });
  if (roundsError) throw roundsError;

  if (rounds.length !== JORNADAS_TOTALES) {
    throw new Error(`Esperaba ${JORNADAS_TOTALES} jornadas desde la ${JORNADA_INICIO}, encontré ${rounds.length}`);
  }

  console.log("Generando calendario (doble vuelta, 22 jornadas, empezando en Jornada 4)...");
  const calendario = generarCalendarioDobleVuelta(teams.map((t) => t.id));
  const roundIdPorJornadaCaraACara = new Map(rounds.map((r, i) => [i + 1, r.id]));

  const fixturesAInsertar = calendario.map((f) => ({
    round_id: roundIdPorJornadaCaraACara.get(f.jornada),
    team_a_id: f.teamAId,
    team_b_id: f.teamBId,
  }));

  const { error: insertError } = await supabase.from("fixtures").insert(fixturesAInsertar);
  if (insertError) throw insertError;

  console.log(`Listo: ${fixturesAInsertar.length} enfrentamientos, Jornada de Liga ${JORNADA_INICIO} a ${JORNADA_INICIO + JORNADAS_TOTALES - 1}.`);
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
