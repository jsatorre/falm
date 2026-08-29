import { headers } from "next/headers";
import { getEstadoDraft, shapeEstadoDraft } from "../lib/draftEngine";
import { supabase } from "../lib/supabaseServer";
import DraftBoard from "./DraftBoard";

export default async function DraftPage() {
  const headerList = await headers();
  const teamId = headerList.get("x-team-id");

  const [estado, { data: wishlist }] = await Promise.all([
    getEstadoDraft(),
    supabase.from("draft_wishlist").select("player_id").eq("team_id", teamId).order("created_at", { ascending: true }),
  ]);

  const inicial = shapeEstadoDraft(estado, teamId);
  const wishlistInicial = (wishlist ?? []).map((w) => w.player_id);

  return <DraftBoard inicial={inicial} miTeamId={teamId} wishlistInicial={wishlistInicial} />;
}
