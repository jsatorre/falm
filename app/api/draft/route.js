import { COOKIE_NAME, equipoDeSesion } from "../../lib/auth";
import { getEstadoDraft, shapeEstadoDraft } from "../../lib/draftEngine";

export async function GET(request) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const teamId = equipoDeSesion(cookie);
  if (!teamId) return Response.json({ error: "No autenticado" }, { status: 401 });

  const estado = await getEstadoDraft();
  return Response.json(shapeEstadoDraft(estado, teamId));
}
