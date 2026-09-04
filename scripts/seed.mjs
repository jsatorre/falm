// Siembra Supabase con la liga real de Biwenger: equipos (12), la
// temporada, todas las jornadas de Liga (para poder sincronizar resultados
// durante toda la temporada) y el calendario cara a cara de doble vuelta
// (22 jornadas) para los 12 equipos.
//
// Uso: node scripts/seed.mjs   (lee .env.local a mano, esto no corre dentro
// de Next así que no hay carga automática de env vars)
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { getLeagueStandings, getSeasonData, iconUrl } = await import("../app/lib/integrations/biwenger.js");
const { generarCalendarioDobleVuelta } = await import("../app/lib/scoring.js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function pinAleatorio() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function main() {
  console.log("Leyendo equipos reales de la liga Falm...");
  const standings = await getLeagueStandings();

  console.log("Leyendo jornadas de la temporada...");
  const { rounds } = await getSeasonData();

  console.log("Creando temporada...");
  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .insert({ label: "2026-2027", is_current: true })
    .select()
    .single();
  if (seasonError) throw seasonError;

  console.log("Creando equipos y PINs...");
  const pinesParaRepartir = [];
  const teamsInsertados = [];
  for (const equipo of standings) {
    const pin = pinAleatorio();
    const pinHash = bcrypt.hashSync(pin, 10);
    const { data: team, error } = await supabase
      .from("teams")
      .insert({
        name: equipo.name,
        biwenger_user_id: String(equipo.id),
        crest_url: iconUrl(equipo.icon),
        pin_hash: pinHash,
      })
      .select()
      .single();
    if (error) throw error;
    teamsInsertados.push(team);
    pinesParaRepartir.push({ name: equipo.name, pin });
  }

  console.log("Creando todas las jornadas de la temporada...");
  // El número de jornada sale de `short` (p.ej. "J4" -> 4), NUNCA de la
  // posición en el array — Biwenger no garantiza que `rounds` venga
  // ordenado por jornada real (en una temporada real J6 apareció antes que
  // J4/J5 en la lista), y usar el índice del array desalineó 3 jornadas
  // enteras (resultados/estado de una jornada aplicándose a otra).
  const roundsInsertados = [];
  for (const r of rounds) {
    const jornada = parseInt(r.short.replace(/\D/g, ""), 10);
    const { data: round, error } = await supabase
      .from("rounds")
      .insert({
        season_id: season.id,
        biwenger_round_id: String(r.id),
        jornada,
        status: r.status === "finished" ? "finished" : "pending",
      })
      .select()
      .single();
    if (error) throw error;
    roundsInsertados.push(round);
  }

  console.log("Generando calendario cara a cara (doble vuelta, 22 jornadas)...");
  const calendario = generarCalendarioDobleVuelta(teamsInsertados.map((t) => t.id));
  const roundIdPorJornada = new Map(roundsInsertados.map((r) => [r.jornada, r.id]));

  const fixturesAInsertar = calendario
    .filter((f) => roundIdPorJornada.has(f.jornada))
    .map((f) => ({
      round_id: roundIdPorJornada.get(f.jornada),
      team_a_id: f.teamAId,
      team_b_id: f.teamBId,
    }));

  const { error: fixturesError } = await supabase.from("fixtures").insert(fixturesAInsertar);
  if (fixturesError) throw fixturesError;

  console.log("\n¡Listo! Resumen:");
  console.log(`- ${teamsInsertados.length} equipos, ${roundsInsertados.length} jornadas de temporada`);
  console.log(`- ${fixturesAInsertar.length} enfrentamientos cara a cara (22 jornadas, doble vuelta)`);
  console.log("\nPINs para repartir a cada amigo:");
  for (const p of pinesParaRepartir) {
    console.log(`  ${p.name.padEnd(24)} ${p.pin}`);
  }
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
