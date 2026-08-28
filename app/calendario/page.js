import { supabase } from "../lib/supabaseServer";
import { getCaraACaraRounds } from "../lib/caraACaraRounds";
import { calcularPuntosEnfrentamiento } from "../lib/scoring";

export default async function CalendarioPage() {
  const [rounds, { data: teams }, { data: fixturesRaw }, { data: resultsRaw }] = await Promise.all([
    getCaraACaraRounds(),
    supabase.from("teams").select("id, name, crest_url"),
    supabase.from("fixtures").select("round_id, team_a_id, team_b_id"),
    supabase.from("round_results").select("round_id, team_id, biwenger_points"),
  ]);

  const equipoPorId = Object.fromEntries(teams.map((t) => [t.id, t]));
  const resultsPorRound = {};
  for (const r of resultsRaw) {
    resultsPorRound[r.round_id] ??= {};
    resultsPorRound[r.round_id][r.team_id] = r.biwenger_points;
  }
  const fixturesPorRound = {};
  for (const f of fixturesRaw) {
    fixturesPorRound[f.round_id] ??= [];
    fixturesPorRound[f.round_id].push(f);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Calendario</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
        Las 22 jornadas cara a cara
      </h1>

      <div className="mt-6 flex flex-col gap-6">
        {rounds.map((ronda) => {
          const puntos = resultsPorRound[ronda.id] ?? {};
          const fixtures = fixturesPorRound[ronda.id] ?? [];

          return (
            <section key={ronda.id}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">Jornada {ronda.jornadaCaraACara}</h2>
                {ronda.status === "finished" ? (
                  <span className="rounded-full bg-neon-green/10 px-2 py-0.5 text-[10px] font-medium text-neon-green">
                    cerrada
                  </span>
                ) : ronda.status === "pending" ? (
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted">
                    pendiente
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                {fixtures.map((f) => {
                  const equipoA = equipoPorId[f.team_a_id];
                  const equipoB = equipoPorId[f.team_b_id];
                  const ptsA = puntos[f.team_a_id];
                  const ptsB = puntos[f.team_b_id];
                  const hayResultado = ptsA != null && ptsB != null;
                  const ganaA = hayResultado && calcularPuntosEnfrentamiento(ptsA, ptsB) > calcularPuntosEnfrentamiento(ptsB, ptsA);
                  const ganaB = hayResultado && calcularPuntosEnfrentamiento(ptsB, ptsA) > calcularPuntosEnfrentamiento(ptsA, ptsB);

                  return (
                    <div
                      key={`${f.team_a_id}-${f.team_b_id}`}
                      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border bg-background-elevated px-3 py-2 text-sm"
                    >
                      <span className={`flex items-center justify-end gap-2 text-right ${ganaA ? "font-semibold text-foreground" : "text-muted"}`}>
                        {equipoA?.name}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={equipoA?.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                      </span>
                      <span className="px-2 text-xs text-muted">
                        {hayResultado ? `${ptsA} - ${ptsB}` : "vs"}
                      </span>
                      <span className={`flex items-center gap-2 ${ganaB ? "font-semibold text-foreground" : "text-muted"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={equipoB?.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                        {equipoB?.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
