import { supabase } from "../lib/supabaseServer";
import PalmaresView from "../components/PalmaresView";

export default async function PalmaresPage() {
  const { data: equipos } = await supabase.from("teams").select("id, name, crest_url").order("name");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Palmarés</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Historia de FALM</h1>

      <div className="mt-6">
        <PalmaresView equipos={equipos ?? []} />
      </div>
    </main>
  );
}
