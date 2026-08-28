// Palmarés histórico de la FALM (2012-2026), dictado por Jaime desde su
// hoja de resumen. Los nombres de campeones antiguos no siempre coinciden
// con un equipo actual (rosters cambian cada año) — se enlazan a un equipo
// actual solo cuando el nombre coincide claramente.
import fs from "node:fs";

const envFile = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i === -1) continue;
  process.env[line.slice(0, i)] = process.env[line.slice(0, i)] ?? line.slice(i + 1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// season_label, liga, copa (null si no hubo)
const HISTORIAL = [
  ["2025/2026", "Real Jugones Futbol Club", "Ròtova"],
  ["2024/2025", "Real Jugones Futbol Club", "Real Jugones Futbol Club"],
  ["2023/2024", "Parrusal", "Ròtova"],
  ["2022/2023", "Ròtova", "Buitres"],
  ["2021/2022", "Ròtova", "Ròtova"],
  ["2020/2021", "Parrusal", "Real Jugones Futbol Club"],
  ["2019/2020", "Buitres", null],
  ["2018/2019", "Ratatuich", "Buitres"],
  ["2017/2018", "Ròtova", null],
  ["2016/2017", "Marcando el kaki", "Rabos vaskos"],
  ["2015/2016", "Albelmala", null],
  ["2014/2015", "Xavaleo", "Ròtova"],
  ["2013/2014", "Ròtova", "Chanatinaikos"],
  ["2012/2013", "Parrusal", "Chanatinaikos"],
];

// nombre histórico (normalizado) -> nombre de equipo actual
const EQUIVALENCIAS = {
  "ròtova": "Ròtova",
  "real jugones futbol club": "Real Jugones CF",
  "parrusal": "FC Parrusal",
  "buitres": "BUITRES FC",
};

function normaliza(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function main() {
  const { data: teams, error: teamsError } = await supabase.from("teams").select("id, name");
  if (teamsError) throw teamsError;
  const teamIdPorNombreActual = new Map(teams.map((t) => [normaliza(t.name), t.id]));

  function idEquipoActual(nombreHistorico) {
    const actual = EQUIVALENCIAS[normaliza(nombreHistorico)];
    if (!actual) return null;
    return teamIdPorNombreActual.get(normaliza(actual)) ?? null;
  }

  const filas = [];
  for (const [seasonLabel, liga, copa] of HISTORIAL) {
    filas.push({
      season_label: seasonLabel,
      competition: "liga",
      champion_name: liga,
      champion_team_id: idEquipoActual(liga),
    });
    if (copa) {
      filas.push({
        season_label: seasonLabel,
        competition: "copa",
        champion_name: copa,
        champion_team_id: idEquipoActual(copa),
      });
    }
  }

  const { error } = await supabase
    .from("trophies")
    .upsert(filas, { onConflict: "season_label,competition" });
  if (error) throw error;

  console.log(`Insertados/actualizados ${filas.length} títulos (${HISTORIAL.length} temporadas).`);
}

main().catch((err) => {
  console.error("ERROR", err);
  process.exit(1);
});
