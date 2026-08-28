import { syncBiwengerResultsCached } from "../../lib/sync";
import { getRondaEnDirecto } from "../../lib/liveRound";

export async function GET() {
  await syncBiwengerResultsCached();
  return Response.json(await getRondaEnDirecto());
}
