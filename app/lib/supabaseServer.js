import { createClient } from "@supabase/supabase-js";

// Supabase falla a veces de forma intermitente y a la segunda va bien. Antes
// eso tumbaba la página entera ("This page couldn't load") hasta recargar:
//  - PGRST303 "JWT issued at future" (visto en los logs de producción):
//    Supabase rechaza el token porque su fecha de emisión va por delante de
//    su propio reloj — un desfase intermitente de su lado, no nuestro. La
//    petición se rechaza ANTES de ejecutarse, así que reintentarla es seguro
//    también para escrituras.
//  - fallos de red y 502-504 (p.ej. una función en frío): solo se reintentan
//    lecturas (GET/HEAD) — repetir un INSERT/UPDATE que sí llegó a
//    ejecutarse podría duplicarlo.
const REINTENTOS = 3;
const ESPERA_MS = 400;

async function esDesfaseDeReloj(res) {
  if (res.status !== 401) return false;
  try {
    const texto = await res.clone().text();
    return texto.includes("PGRST303") || /issued at future/i.test(texto);
  } catch {
    return false;
  }
}

async function fetchConReintentos(input, init) {
  const metodo = (init?.method ?? (typeof input === "object" && input.method) ?? "GET").toUpperCase();
  const lectura = metodo === "GET" || metodo === "HEAD";

  for (let intento = 0; ; intento++) {
    try {
      const res = await fetch(input, init);
      if (intento >= REINTENTOS) return res;

      if (await esDesfaseDeReloj(res)) {
        console.warn(`Supabase PGRST303 (JWT issued at future) — reintento ${intento + 1}/${REINTENTOS}`);
      } else if (lectura && res.status >= 502 && res.status <= 504) {
        console.warn(`Supabase ${res.status} — reintento ${intento + 1}/${REINTENTOS}`);
      } else {
        return res;
      }
    } catch (err) {
      if (!lectura || intento >= REINTENTOS) throw err;
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
