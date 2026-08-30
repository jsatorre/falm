import { supabase } from "./supabaseServer";
import { getCaraACaraRounds } from "./caraACaraRounds";
import { calcularBote, calcularGanancias, calcularSaldos, calcularLiquidacion } from "./money";

const CLAVES = [
  "dinero_cuota",
  "dinero_premio_liga_campeon",
  "dinero_premio_liga_subcampeon",
  "dinero_premio_sudden_campeon",
  "dinero_premio_sudden_subcampeon",
  "dinero_premio_jornada",
  "dinero_premio_vuelta",
  "dinero_sudden_campeon_team_id",
  "dinero_sudden_subcampeon_team_id",
];

const CLAVE_LIQUIDACION = "dinero_liquidacion";
const CLAVE_LIQUIDACION_FECHA = "dinero_liquidacion_calculada_at";

/**
 * Configuración de premios en metálico (cuota, importe de cada premio,
 * quién participa en el bote y el campeón/subcampeón de la Sudden fijado
 * a mano) — la usan tanto el formulario de /admin como la página pública
 * de Premios, para no duplicar la consulta.
 */
export async function getConfigDinero() {
  const [{ data: settingsRaw }, { data: teams }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", CLAVES),
    supabase.from("teams").select("id, name, crest_url, participa_dinero").order("name", { ascending: true }),
  ]);

  const settings = Object.fromEntries((settingsRaw ?? []).map((s) => [s.key, s.value]));

  return {
    importes: {
      ligaCampeon: Number(settings.dinero_premio_liga_campeon ?? 0),
      ligaSubcampeon: Number(settings.dinero_premio_liga_subcampeon ?? 0),
      suddenCampeon: Number(settings.dinero_premio_sudden_campeon ?? 0),
      suddenSubcampeon: Number(settings.dinero_premio_sudden_subcampeon ?? 0),
      jornada: Number(settings.dinero_premio_jornada ?? 0),
      vuelta: Number(settings.dinero_premio_vuelta ?? 0),
    },
    cuota: Number(settings.dinero_cuota ?? 0),
    sudden: {
      campeonTeamId: settings.dinero_sudden_campeon_team_id || null,
      subcampeonTeamId: settings.dinero_sudden_subcampeon_team_id || null,
    },
    teams: (teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      crestUrl: t.crest_url,
      participaDinero: t.participa_dinero,
    })),
  };
}

async function getFixturesYResultados() {
  const [rounds, { data: fixturesRaw }, { data: resultsRaw }] = await Promise.all([
    getCaraACaraRounds(),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
  ]);

  const jornadaPorRoundId = new Map(rounds.map((r) => [r.id, r.jornadaCaraACara]));
  const fixtures = fixturesRaw
    .filter((f) => jornadaPorRoundId.has(f.round_id))
    .map((f) => ({
      roundId: f.round_id,
      jornada: jornadaPorRoundId.get(f.round_id),
      teamAId: f.team_a_id,
      teamBId: f.team_b_id,
    }));

  const results = {};
  for (const r of resultsRaw) {
    results[r.round_id] ??= {};
    results[r.round_id][r.team_id] = r.biwenger_points;
  }

  return { fixtures, results };
}

/**
 * Bote y saldo de cada equipo a día de hoy — esto sí se recalcula siempre
 * en vivo (es solo informativo: cuánto lleva ganado cada uno). Lo que NO
 * se recalcula en vivo es la liquidación ("quién debe a quién"): a mitad
 * de temporada la mayoría de premios (jornadas futuras, la vuelta 2, el
 * campeón final...) todavía no tienen ganador, así que una liquidación en
 * vivo reparte de forma un poco arbitraria entre equipos que en realidad
 * están en la misma situación — mejor que el admin la calcule y publique
 * cuando de verdad tenga sentido (ver calcularYGuardarLiquidacion).
 */
export async function calcularEstadoDineroActual() {
  const [config, { fixtures, results }] = await Promise.all([getConfigDinero(), getFixturesYResultados()]);

  const bote = calcularBote(config.teams, config.cuota);
  const ganancias = calcularGanancias(config.teams, fixtures, results, config.importes, config.sudden);
  const saldos = calcularSaldos(config.teams, ganancias, config.cuota);

  return { config, bote, saldos };
}

/**
 * Calcula la liquidación final a partir del estado actual y la deja
 * guardada (con fecha) para que la página pública la muestre tal cual,
 * sin recalcularla en cada visita — la dispara el admin a mano desde
 * /admin cuando la Liga ya ha terminado (o cuando quiera ver un cierre
 * "de verdad", no una foto a medias).
 */
export async function calcularYGuardarLiquidacion() {
  const { saldos } = await calcularEstadoDineroActual();
  const liquidacion = calcularLiquidacion(saldos);
  const calculadaAt = new Date().toISOString();

  const filas = [
    { key: CLAVE_LIQUIDACION, value: JSON.stringify(liquidacion.map((t) => ({ deTeamId: t.de.id, aTeamId: t.a.id, cantidad: t.cantidad }))) },
    { key: CLAVE_LIQUIDACION_FECHA, value: calculadaAt },
  ];
  const { error } = await supabase.from("app_settings").upsert(filas, { onConflict: "key" });
  if (error) throw error;

  return { liquidacion, calculadaAt };
}

/**
 * Última liquidación guardada (o null si el admin todavía no la ha
 * calculado nunca) — con los equipos ya resueltos desde sus IDs, lista
 * para pintar en la página pública.
 */
export async function getLiquidacionGuardada() {
  const [{ data: settingsRaw }, { data: teams }] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", [CLAVE_LIQUIDACION, CLAVE_LIQUIDACION_FECHA]),
    supabase.from("teams").select("id, name, crest_url"),
  ]);
  const settings = Object.fromEntries((settingsRaw ?? []).map((s) => [s.key, s.value]));
  if (!settings[CLAVE_LIQUIDACION] || !settings[CLAVE_LIQUIDACION_FECHA]) return null;

  const equipoPorId = Object.fromEntries((teams ?? []).map((t) => [t.id, { id: t.id, name: t.name, crestUrl: t.crest_url }]));
  const transferencias = JSON.parse(settings[CLAVE_LIQUIDACION]);

  return {
    calculadaAt: settings[CLAVE_LIQUIDACION_FECHA],
    transferencias: transferencias
      .map((t) => ({ de: equipoPorId[t.deTeamId], a: equipoPorId[t.aTeamId], cantidad: t.cantidad }))
      .filter((t) => t.de && t.a),
  };
}
