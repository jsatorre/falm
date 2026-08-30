import { calcularEstadoDineroActual, getLiquidacionGuardada } from "../lib/dineroConfig";

export default async function PremiosPage() {
  const [{ config, bote, saldos }, liquidacionGuardada] = await Promise.all([
    calcularEstadoDineroActual(),
    getLiquidacionGuardada(),
  ]);

  const equiposFuera = config.teams.filter((t) => !t.participaDinero);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Premios</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
        Bote: {bote.total.toFixed(2)}€
      </h1>
      <p className="mt-1 text-xs text-muted">
        {bote.equiposParticipantes} equipos en juego a {config.cuota}€ cada uno
        {equiposFuera.length > 0 && (
          <> · fuera del bote: {equiposFuera.map((t) => t.name).join(", ")}</>
        )}
        . Nadie paga nada hasta el final de la Liga.
      </p>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Saldo de cada equipo
        </h2>
        {saldos.length === 0 ? (
          <p className="text-sm text-muted">Ningún equipo participa en el bote todavía.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {saldos.map((s) => (
              <div key={s.team.id} className="rounded-xl border border-border bg-background-elevated p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.team.crestUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    <span className="font-medium text-foreground">{s.team.name}</span>
                  </span>
                  <span className={`font-bold ${s.saldo >= 0 ? "text-neon-green" : "text-neon-pink"}`}>
                    {s.saldo >= 0 ? `+${s.saldo.toFixed(2)}€` : `${s.saldo.toFixed(2)}€`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  Ganado {s.ganado.toFixed(2)}€ − cuota {s.puesto.toFixed(2)}€
                  {s.desglose.length > 0 && (
                    <>
                      {" · "}
                      {s.desglose.map((d) => `${d.concepto} (${d.importe.toFixed(2)}€)`).join(" · ")}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Quién le debe a quién
        </h2>
        {!liquidacionGuardada ? (
          <p className="text-sm text-muted">
            Todavía no se ha calculado — se publicará aquí cuando termine la Liga.
          </p>
        ) : liquidacionGuardada.transferencias.length === 0 ? (
          <p className="text-sm text-muted">Nadie debe nada — todos los saldos están a cero.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted">
              Calculado el{" "}
              {new Date(liquidacionGuardada.calculadaAt).toLocaleString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
            <div className="flex flex-col gap-2">
              {liquidacionGuardada.transferencias.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.de.crestUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    <span className="text-foreground">{t.de.name}</span>
                    <span className="text-muted">le debe a</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.a.crestUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    <span className="text-foreground">{t.a.name}</span>
                  </span>
                  <span className="font-bold text-neon-green">{t.cantidad.toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <p className="mt-6 text-xs text-muted">
        Campeón/subcampeón de Liga: clasificación actual. Sudden: fijado a mano desde /admin (esta
        app no la rastrea). Jornada y vuelta: mismo criterio de empate que la columna JG de
        Clasificación (se reparte a partes iguales).
      </p>
    </main>
  );
}
