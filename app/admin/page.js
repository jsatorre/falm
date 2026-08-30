import { getCaraACaraRounds } from "../lib/caraACaraRounds";
import { getEstadoDraft } from "../lib/draftEngine";
import { jornadasPorVuelta } from "../lib/money";
import { getLiquidacionGuardada } from "../lib/dineroConfig";
import { supabase } from "../lib/supabaseServer";
import AplazarJornadaForm from "./AplazarJornadaForm";
import FichajesDeadlineForm from "./FichajesDeadlineForm";
import DraftAdminForm from "./DraftAdminForm";
import DineroConfigForm from "./DineroConfigForm";
import CalcularDeudasForm from "./CalcularDeudasForm";
import AdminLogoutButton from "./AdminLogoutButton";
import ResetearPinForm from "./ResetearPinForm";

export default async function AdminPage() {
  const [rounds, draft, { data: teams }, liquidacionGuardada] = await Promise.all([
    getCaraACaraRounds(),
    getEstadoDraft(),
    supabase.from("teams").select("id, name, crest_url").order("name", { ascending: true }),
    getLiquidacionGuardada(),
  ]);
  const numVueltas = jornadasPorVuelta((teams ?? []).length).length;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">FALM</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">Admin</h1>
        </div>
        <AdminLogoutButton />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Saltarse una jornada de Liga
        </h2>
        <p className="mb-3 text-xs text-muted">
          Mueve los enfrentamientos de esa jornada de Liga a la siguiente jornada de Liga libre —
          la numeración interna (Jornada 1, 2, 3...) se recalcula sola, no hace falta tocar nada más.
        </p>
        <AplazarJornadaForm />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Hora tope de fichajes (regla semanal)
        </h2>
        <p className="mb-3 text-xs text-muted">
          Se configura una vez y se aplica todas las semanas sola — ej. todos los jueves a las
          23:50. En cuanto pasa esa hora, la siguiente vez que alguien entra en Fichajes se
          calculan y publican las asignaciones de esa jornada automáticamente, y la siguiente
          jornada ya toma la hora tope de la semana siguiente.
        </p>
        <FichajesDeadlineForm />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Draft
        </h2>
        <p className="mb-3 text-xs text-muted">
          Sortea el orden serpiente y arranca el tablero de fichajes en vivo. Fichar aquí es solo
          apunte interno de la app — luego cada uno tiene que comprar de verdad a su jugador en
          Biwenger.
        </p>
        <DraftAdminForm
          configurado={draft.configurado}
          enMarcha={draft.enMarcha}
          ronda={draft.ronda}
          currentPick={draft.currentPick}
          totalPicks={draft.totalPicks}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Premios en metálico
        </h2>
        <p className="mb-3 text-xs text-muted">
          Cuota por equipo, importe de cada premio y quién participa en el bote — todo ajustable
          aquí. El indicador de abajo del formulario te dice si lo repartido en premios encaja con
          el bote real, para ir ajustando hasta que cuadre.
        </p>
        <DineroConfigForm numJornadas={rounds.length} numVueltas={numVueltas} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Calcular deudas
        </h2>
        <p className="mb-3 text-xs text-muted">
          El bote y el saldo de cada equipo se ven siempre en vivo en Premios, pero "quién debe a
          quién" solo se publica cuando le das aquí — a mitad de temporada, la mayoría de premios
          (jornadas futuras, la vuelta que falta, el campeón final...) todavía no tienen ganador,
          así que un cálculo en vivo repartiría de forma un poco arbitraria entre equipos que en
          realidad están igual. Pulsa esto cuando la Liga haya terminado (o cuando quieras
          publicar un cierre parcial).
        </p>
        <CalcularDeudasForm calculadaAtInicial={liquidacionGuardada?.calculadaAt ?? null} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Resetear PIN de un equipo
        </h2>
        <p className="mb-3 text-xs text-muted">
          Para cuando a alguien se le olvida el PIN y no puede ni entrar a cambiárselo él mismo
          (eso lo puede hacer solo desde su propia cuenta, en 🔑 / "Mi cuenta"). Genera uno nuevo al
          azar y lo enseña una sola vez — el PIN antiguo deja de servir en el momento.
        </p>
        <ResetearPinForm teams={teams ?? []} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Calendario actual (Jornada de Liga por jornada cara a cara)
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[300px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2 font-medium">Jornada FALM</th>
                <th className="px-3 py-2 font-medium">Jornada de Liga</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-foreground">{r.jornadaCaraACara}</td>
                  <td className="px-3 py-2 text-muted">{r.jornada}</td>
                  <td className="px-3 py-2 text-muted">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
