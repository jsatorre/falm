// Borra los resultados de prueba metidos por fill-test-data.mjs (jornadas
// 1-3 cara a cara). Los resultados reales que ya haya sincronizado
// Biwenger para esas mismas jornadas se pierden también — solo usar esto
// antes de que la liga real haya empezado a jugarse de verdad.
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const JORNADAS_A_BORRAR = [1, 2, 3];

async function main() {
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

  const idsABorrar = rounds
    .map((r, i) => ({ ...r, jornadaCaraACara: i + 1 }))
    .filter((r) => JORNADAS_A_BORRAR.includes(r.jornadaCaraACara))
    .map((r) => r.id);

  const { error, count } = await supabase
    .from("round_results")
    .delete({ count: "exact" })
    .in("round_id", idsABorrar);
  if (error) throw error;

  console.log(`Borrados ${count} resultados de las jornadas ${JORNADAS_A_BORRAR.join(", ")}.`);
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
