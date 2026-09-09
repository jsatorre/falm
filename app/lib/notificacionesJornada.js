import { supabase } from "./supabaseServer";
import { calcularClasificacion, calcularPuntosEnfrentamiento } from "./scoring";
import { getCaraACaraRounds } from "./caraACaraRounds";
import { enviarTelegram } from "./telegram";

/**
 * Avisa por Telegram de las jornadas cara a cara que se acaban de cerrar
 * (llamar DESPUÉS de que round_results ya tenga los puntos finales de esa
 * ronda volcados, si no el mensaje saldría con datos a medias). Ignora
 * rondas que no formen parte del calendario cara a cara (p.ej. una
 * jornada aplazada sin enfrentamiento asignado) — ahí no hay nada que
 * avisar.
 *
 * @param {string[]} rondaIdsRecienCerradas — ids (de nuestra tabla rounds) que acaban de pasar a "finished" en este ciclo de sync
 */
export async function avisarJornadasCerradas(rondaIdsRecienCerradas) {
  if (!rondaIdsRecienCerradas || rondaIdsRecienCerradas.length === 0) return;

  const rounds = await getCaraACaraRounds();
  const cerradas = rounds.filter((r) => rondaIdsRecienCerradas.includes(r.id));
  if (cerradas.length === 0) return;

  const [{ data: teams }, { data: fixturesRaw }, { data: resultsRaw }] = await Promise.all([
    supabase.from("teams").select("id, name"),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
  ]);

  const nombrePorId = new Map(teams.map((t) => [t.id, t.name]));
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

  for (const ronda of cerradas) {
    const mensaje = construirMensajeJornadaCerrada(ronda, fixtures, results, nombrePorId, teams);
    try {
      await enviarTelegram(mensaje, { html: true });
    } catch (err) {
      console.warn(`No se ha podido avisar por Telegram del cierre de la jornada ${ronda.jornadaCaraACara}:`, err);
    }
  }
}

function escaparHtml(texto) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Sin <pre>/monoespaciado a propósito: Telegram lo renderiza como "bloque
// de código" (con su propio botón de copiar, que no queremos) y en móvil
// corta las líneas largas por la mitad, rompiendo justo la alineación por
// columnas que se buscaba. En su lugar: nombres de equipo en negrita para
// que destaquen sobre los números, y cada sección dentro de un
// <blockquote> — en Telegram eso se ve como una tarjeta con una franja
// lateral, no como código. Sin emojis, a petición expresa.
function construirMensajeJornadaCerrada(ronda, fixtures, results, nombrePorId, teams) {
  const fixturesJornada = fixtures.filter((f) => f.jornada === ronda.jornadaCaraACara);
  const resultadosRonda = results[ronda.id] ?? {};

  const lineasResultados = fixturesJornada.map((f) => {
    const ptsA = resultadosRonda[f.teamAId];
    const ptsB = resultadosRonda[f.teamBId];
    const nombreA = escaparHtml(nombrePorId.get(f.teamAId) ?? "?");
    const nombreB = escaparHtml(nombrePorId.get(f.teamBId) ?? "?");
    if (ptsA == null || ptsB == null) return `<b>${nombreA}</b> – <b>${nombreB}</b>: sin datos`;

    const puntosA = calcularPuntosEnfrentamiento(ptsA, ptsB);
    const puntosB = calcularPuntosEnfrentamiento(ptsB, ptsA);
    const empate = puntosA === puntosB;
    return `<b>${nombreA}</b> ${ptsA} – <b>${nombreB}</b> ${ptsB}${empate ? " (empate)" : ""}`;
  });

  const clasificacion = calcularClasificacion(
    teams.map((t) => ({ id: t.id, name: t.name })),
    fixtures,
    results,
    ronda.jornadaCaraACara
  );
  const lineasClasificacion = clasificacion.map(
    (fila, i) => `${i + 1}. ${escaparHtml(fila.team.name)} — ${fila.pts} pts`
  );

  return [
    `<b>Jornada ${ronda.jornadaCaraACara} cerrada</b>`,
    "",
    "<b>Resultados</b>",
    `<blockquote>${lineasResultados.join("\n")}</blockquote>`,
    "",
    "<b>Clasificación</b>",
    `<blockquote>${lineasClasificacion.join("\n")}</blockquote>`,
    "",
    `<a href="https://falm.vercel.app">Ver en la app</a>`,
  ].join("\n");
}
