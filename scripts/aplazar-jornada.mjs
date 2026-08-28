// Cuando una jornada de Liga no se va a jugar/computar para la liga cara a
// cara (aplazamientos raros, decisión del grupo, etc.): le quita los
// enfrentamientos asignados y se los da a la siguiente jornada de Liga
// libre (todavía sin fixtures) que haya más adelante en el calendario.
//
// No hace falta tocar nada más: la numeración "Jornada 1, 2, 3..." de la
// app sale de qué jornadas de Liga tienen fixtures, así que se recalcula
// sola (ver app/lib/caraACaraRounds.js).
//
// Uso: node scripts/aplazar-jornada.mjs <jornada-de-liga-a-saltar>
// Ejemplo: node scripts/aplazar-jornada.mjs 10
import fs from "node:fs";

const jornadaASaltar = Number(process.argv[2]);
if (!jornadaASaltar) {
  console.error("Uso: node scripts/aplazar-jornada.mjs <jornada-de-liga-a-saltar>");
  process.exit(1);
}

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function main() {
  const { data: rondaASaltar, error: rondaError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .eq("jornada", jornadaASaltar)
    .maybeSingle();
  if (rondaError) throw rondaError;
  if (!rondaASaltar) throw new Error(`No existe ninguna jornada de Liga número ${jornadaASaltar}`);

  const { data: fixturesASaltar, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id")
    .eq("round_id", rondaASaltar.id);
  if (fixturesError) throw fixturesError;
  if (fixturesASaltar.length === 0) {
    console.log(`La Jornada de Liga ${jornadaASaltar} no tiene enfrentamientos asignados — nada que hacer.`);
    return;
  }

  const { data: todosFixtures, error: todosFixturesError } = await supabase
    .from("fixtures")
    .select("round_id");
  if (todosFixturesError) throw todosFixturesError;
  const roundIdsUsados = new Set(todosFixtures.map((f) => f.round_id));

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("id, jornada")
    .order("jornada", { ascending: true });
  if (roundsError) throw roundsError;

  const maxJornadaUsada = Math.max(...rounds.filter((r) => roundIdsUsados.has(r.id)).map((r) => r.jornada));
  const siguienteRondaLibre = rounds.find(
    (r) => r.jornada > maxJornadaUsada && !roundIdsUsados.has(r.id)
  );
  if (!siguienteRondaLibre) {
    throw new Error("No queda ninguna jornada de Liga libre más adelante para reubicar los enfrentamientos.");
  }

  const { error: updateError } = await supabase
    .from("fixtures")
    .update({ round_id: siguienteRondaLibre.id })
    .eq("round_id", rondaASaltar.id);
  if (updateError) throw updateError;

  console.log(
    `Listo: los ${fixturesASaltar.length} enfrentamientos de la Jornada de Liga ${jornadaASaltar} se han movido a la Jornada de Liga ${siguienteRondaLibre.jornada}.`
  );
  console.log("La numeración interna (Jornada 1, 2, 3... de la app) se recalcula sola.");
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
