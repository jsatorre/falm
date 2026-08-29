import { headers } from "next/headers";
import { supabase } from "../lib/supabaseServer";
import { calcularEstadisticasEquipoCacheado } from "../lib/equipoStats";
import EquipoTable from "./EquipoTable";

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
      console.error("No se ha podido cargar la plantilla de Equipo desde Biwenger:", err);
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
        <div className="mt-6">
          <EquipoTable jugadores={jugadores} nombreEquipo={equipo?.name ?? "tu equipo"} />
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        PJ club / minutos / goles: lo que ha hecho de verdad con su equipo de Liga. "Titular":
        jornadas en las que lo pusiste en tu once — todavía no está confirmado si Biwenger refleja
        aquí el once que pones tú o el once ya con los suplentes automáticos aplicados, lo iremos
        viendo con datos reales. Haz clic en cualquier cabecera de columna para ordenar.
      </p>
    </main>
  );
}
