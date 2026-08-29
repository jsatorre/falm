import { headers } from "next/headers";
import { supabase } from "../lib/supabaseServer";
import { calcularEstadisticasEquipoCacheado } from "../lib/equipoStats";

function formatoValor(numero) {
  if (numero == null) return "—";
  return new Intl.NumberFormat("es-ES").format(numero) + " €";
}

export default async function EquipoPage() {
  const headerList = await headers();
  const teamId = headerList.get("x-team-id");

  const { data: equipo } = await supabase
    .from("teams")
    .select("id, name, crest_url, biwenger_user_id")
    .eq("id", teamId)
    .maybeSingle();

  let jugadores = [];
  let error = null;
  if (equipo?.biwenger_user_id) {
    try {
      jugadores = await calcularEstadisticasEquipoCacheado(equipo.biwenger_user_id);
    } catch (err) {
      error = "No se ha podido cargar la plantilla desde Biwenger ahora mismo — prueba otra vez en un rato.";
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Mi equipo</p>
      <div className="mt-1 flex items-center gap-2">
        {equipo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={equipo.crest_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        )}
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{equipo?.name ?? "Tu equipo"}</h1>
      </div>

      {error && <p className="mt-6 text-sm text-neon-pink">{error}</p>}

      {!error && jugadores.length === 0 && (
        <p className="mt-6 text-sm text-muted">Todavía no tienes ningún jugador fichado.</p>
      )}

      {!error && jugadores.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-3 font-medium">Jugador</th>
                <th className="px-3 py-3 font-medium">Club</th>
                <th className="px-3 py-3 text-right font-medium">Valor</th>
                <th className="px-3 py-3 text-right font-medium">PJ club</th>
                <th className="px-3 py-3 text-right font-medium">Min. totales</th>
                <th className="px-3 py-3 text-right font-medium">Min. media</th>
                <th className="px-3 py-3 text-right font-medium">⚽ Goles</th>
                <th className="px-3 py-3 text-right font-medium">⭐ MVPs</th>
                <th className="px-3 py-3 text-right font-medium">Titular FALM</th>
              </tr>
            </thead>
            <tbody>
              {jugadores.map((j) => (
                <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={j.foto}
                        alt=""
                        className="h-9 w-9 rounded-full border border-border bg-background-elevated object-cover"
                      />
                      <span className="flex flex-col">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          {j.nombre}
                          <span
                            title={j.disponible ? "Disponible" : "Duda / lesión / sanción"}
                            className={`h-2 w-2 rounded-full ${j.disponible ? "bg-neon-green" : "bg-neon-red"}`}
                          />
                        </span>
                        <span className="text-xs text-muted">{j.posicion}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">{j.club}</td>
                  <td className="px-3 py-3 text-right text-muted">{formatoValor(j.valor)}</td>
                  <td className="px-3 py-3 text-right text-muted">{j.partidosJugados}</td>
                  <td className="px-3 py-3 text-right text-muted">{j.minutosTotal}</td>
                  <td className="px-3 py-3 text-right text-muted">{j.minutosMedia.toFixed(0)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground">{j.goles}</td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground">{j.mvps}</td>
                  <td className="px-3 py-3 text-right font-semibold text-neon-green">{j.vecesTitularFalm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        PJ club / minutos / goles: lo que ha hecho de verdad con su equipo de Liga. "Titular FALM":
        jornadas en las que lo pusiste en tu once — todavía no está confirmado si Biwenger refleja
        aquí el once que pones tú o el once ya con los suplentes automáticos aplicados, lo iremos
        viendo con datos reales.
      </p>
    </main>
  );
}
