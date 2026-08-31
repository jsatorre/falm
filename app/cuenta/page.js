import { headers } from "next/headers";
import { supabase } from "../lib/supabaseServer";
import CambiarPinForm from "./CambiarPinForm";
import NotificacionesForm from "./NotificacionesForm";

export default async function CuentaPage() {
  const headerList = await headers();
  const teamId = headerList.get("x-team-id");

  const { data: equipo } = await supabase
    .from("teams")
    .select("id, name, crest_url")
    .eq("id", teamId)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Mi cuenta</p>
      <div className="mt-1 flex items-center gap-2">
        {equipo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={equipo.crest_url} alt="" className="h-7 w-7 rounded-full object-cover" />
        )}
        <h1 className="text-2xl font-black tracking-tight">{equipo?.name ?? "Tu equipo"}</h1>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background-elevated p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Notificaciones</h2>
        <NotificacionesForm />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background-elevated p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Cambiar mi PIN</h2>
        <CambiarPinForm />
      </div>
    </main>
  );
}
