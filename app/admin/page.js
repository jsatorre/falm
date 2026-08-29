import { getCaraACaraRounds } from "../lib/caraACaraRounds";
import AplazarJornadaForm from "./AplazarJornadaForm";
import FichajesDeadlineForm from "./FichajesDeadlineForm";
import AdminLogoutButton from "./AdminLogoutButton";

export default async function AdminPage() {
  const rounds = await getCaraACaraRounds();

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
