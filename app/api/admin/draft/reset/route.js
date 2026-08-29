import { supabase } from "../../../../lib/supabaseServer";

// Borra todo lo fichado en el draft y lo deja sin configurar (no arranca
// solo — hay que pulsar "Empezar draft" otra vez desde /admin).
export async function POST() {
  const { error: deletePicksError } = await supabase
    .from("draft_picks")
    .delete()
    .gte("pick_index", 0);
  if (deletePicksError) return Response.json({ error: deletePicksError.message }, { status: 500 });

  const { error: deleteStateError } = await supabase.from("draft_state").delete().eq("id", true);
  if (deleteStateError) return Response.json({ error: deleteStateError.message }, { status: 500 });

  return Response.json({ ok: true });
}
