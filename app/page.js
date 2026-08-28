import { calcularClasificacion } from "./lib/scoring";
import { supabase } from "./lib/supabaseServer";
import { getCaraACaraRounds } from "./lib/caraACaraRounds";
import CelebrateButton from "./components/CelebrateButton";

const MEDALLAS = ["🥇", "🥈", "🥉"];

export default async function ClasificacionPage() {
  const [rounds, { data: teams }, { data: fixturesRaw }, { data: resultsRaw }] = await Promise.all([
    getCaraACaraRounds(),
    supabase.from("teams").select("id, name, crest_url"),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
  ]);

  const jornadaCaraACaraPorRoundId = new Map(rounds.map((r) => [r.id, r.jornadaCaraACara]));

  const fixtures = fixturesRaw
    .filter((f) => jornadaCaraACaraPorRoundId.has(f.round_id))
    .map((f) => ({
      roundId: f.round_id,
      jornada: jornadaCaraACaraPorRoundId.get(f.round_id),
      teamAId: f.team_a_id,
      teamBId: f.team_b_id,
    }));

  const results = {};
  for (const r of resultsRaw) {
    results[r.round_id] ??= {};
    results[r.round_id][r.team_id] = r.biwenger_points;
  }

  // La clasificación cuenta cualquier enfrentamiento con resultado en
  // ambos lados, sin exigir que la jornada entera esté "cerrada" en
  // Biwenger — así un partido que termina antes que otro de la misma
  // jornada ya cuenta, y no hace falta esperar a que Biwenger marque la
  // jornada completa como finalizada.
  const equipos = teams.map((t) => ({ id: t.id, name: t.name, crestUrl: t.crest_url }));
  const clasificacion = calcularClasificacion(equipos, fixtures, results);

  const jornadasConResultado = fixtures
    .filter((f) => results[f.roundId]?.[f.teamAId] != null && results[f.roundId]?.[f.teamBId] != null)
    .map((f) => f.jornada);
  const ultimaJornadaConDatos = jornadasConResultado.length > 0 ? Math.max(...jornadasConResultado) : 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">
            Clasificación
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            {ultimaJornadaConDatos > 0
              ? `Después de la jornada ${ultimaJornadaConDatos}`
              : "Todavía no hay resultados"}
          </h1>
        </div>
        <CelebrateButton />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
              <th className="px-3 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">Equipo</th>
              <th className="px-3 py-3 text-right font-medium">PJ</th>
              <th className="px-3 py-3 text-right font-medium">Pts</th>
              <th className="px-3 py-3 text-right font-medium">PF</th>
              <th className="px-3 py-3 text-right font-medium">PC</th>
              <th className="px-3 py-3 text-right font-medium">DP</th>
              <th className="px-3 py-3 text-right font-medium">MP</th>
              <th className="px-3 py-3 text-right font-medium">🏅 JG</th>
            </tr>
          </thead>
          <tbody>
            {clasificacion.map((fila, i) => (
              <tr
                key={fila.team.id}
                className={`border-b border-border/60 last:border-0 ${
                  i === 0 ? "bg-neon-purple/10" : "hover:bg-white/[0.03]"
                }`}
              >
                <td className="px-3 py-3 font-semibold">{MEDALLAS[i] ?? i + 1}</td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fila.team.crestUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    <span className={i === 0 ? "font-semibold text-foreground" : "text-foreground"}>
                      {fila.team.name}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-muted">{fila.pj}</td>
                <td className="px-3 py-3 text-right font-bold text-neon-green">{fila.pts}</td>
                <td className="px-3 py-3 text-right text-muted">{fila.pf}</td>
                <td className="px-3 py-3 text-right text-muted">{fila.pc}</td>
                <td className="px-3 py-3 text-right text-muted">
                  {fila.dp > 0 ? `+${fila.dp}` : fila.dp}
                </td>
                <td className="px-3 py-3 text-right text-muted">{fila.mp.toFixed(1)}</td>
                <td className="px-3 py-3 text-right text-muted">{fila.jg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted">
        Pts: 3 victoria clara · 2 victoria ajustada · 1.5 empate técnico (±1) ·
        1 derrota ajustada · 0 derrota clara. JG: jornadas en las que has sido
        el que más puntos Biwenger ha sacado esa semana.
      </p>
    </main>
  );
}
