import { createClient } from "@supabase/supabase-js";

// Proyecto Supabase propio de esta app ("FALM"), cuenta personal — nada que
// ver con el proyecto de Trendsplant. SUPABASE_SECRET_KEY es la clave nueva
// de Supabase (prefijo sb_secret_...) que sustituye a la antigua
// service_role key; se usa igual, solo server-side, nunca en el cliente.
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

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
