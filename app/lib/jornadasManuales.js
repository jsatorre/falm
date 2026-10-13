import { supabase } from "./supabaseServer";

// Una jornada "bloqueada" tiene sus puntos fijados a mano desde /admin: la
// sincronización con Biwenger deja de tocarla (ni en directo ni desde el
// histórico) hasta que se desbloquee. Sirve para casos como un partido
// aplazado en el que Biwenger aplica cambios automáticos que no queremos.
// Se guarda en app_settings (clave jornada_manual_<roundId>) — los puntos
// en sí van a round_results como siempre, de ahí leen todas las pantallas.
const PREFIJO = "jornada_manual_";

export async function getRondasBloqueadas() {
  const { data, error } = await supabase.from("app_settings").select("key").like("key", `${PREFIJO}%`);
  if (error) throw error;
  return new Set((data ?? []).map((s) => s.key.slice(PREFIJO.length)));
}

export async function bloquearRonda(roundId) {
  const { error } = await supabase.from("app_settings").upsert({ key: `${PREFIJO}${roundId}`, value: "1" });
  if (error) throw error;
}

export async function desbloquearRonda(roundId) {
  const { error } = await supabase.from("app_settings").delete().eq("key", `${PREFIJO}${roundId}`);
  if (error) throw error;
}
