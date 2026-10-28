import { createClient } from "@supabase/supabase-js";

// Una función serverless en frío puede fallar su primera conexión a Supabase
// (fetch failed / 502-504) y funcionar a la segunda — antes eso tumbaba la
// página entera ("This page couldn't load") hasta que el usuario recargaba.
// Solo se reintentan lecturas (GET/HEAD): repetir un INSERT/UPDATE que sí
// llegó a ejecutarse podría duplicarlo.
const REINTENTOS = 2;
const ESPERA_MS = 250;

async function fetchConReintentos(input, init) {
  const metodo = (init?.method ?? (typeof input === "object" && input.method) ?? "GET").toUpperCase();
  const reintentable = metodo === "GET" || metodo === "HEAD";

  for (let intento = 0; ; intento++) {
    try {
      const res = await fetch(input, init);
      if (reintentable && res.status >= 502 && res.status <= 504 && intento < REINTENTOS) {
        console.warn(`Supabase ${res.status} — reintento ${intento + 1}/${REINTENTOS}`);
      } else {
        return res;
      }
    } catch (err) {
      if (!reintentable || intento >= REINTENTOS) throw err;
      console.warn(`Supabase fetch falló (${err?.cause?.code ?? err?.message}) — reintento ${intento + 1}/${REINTENTOS}`);
    }
    await new Promise((r) => setTimeout(r, ESPERA_MS * (intento + 1)));
  }
}

// Proyecto Supabase propio de esta app ("FALM"), cuenta personal — nada que
// ver con el proyecto de Trendsplant. SUPABASE_SECRET_KEY es la clave nueva
// de Supabase (prefijo sb_secret_...) que sustituye a la antigua
// service_role key; se usa igual, solo server-side, nunca en el cliente.
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  global: { fetch: fetchConReintentos },
});

// Supabase/PostgREST limita cada respuesta a 1000 filas por defecto, aunque
// se pida un .limit() mayor — se pagina con .range() hasta traer todo.
export async function fetchAllRows(buildQuery) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}
