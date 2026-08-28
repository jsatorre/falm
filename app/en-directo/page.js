import { syncBiwengerResultsCached } from "../lib/sync";
import { getRondaEnDirecto } from "../lib/liveRound";
import LiveRound from "../components/LiveRound";

export default async function EnDirectoPage() {
  await syncBiwengerResultsCached();
  const inicial = await getRondaEnDirecto();
  return <LiveRound inicial={inicial} />;
}
