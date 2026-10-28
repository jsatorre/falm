"use client";

import { useEffect, useRef } from "react";

// Si una página falla en el servidor (un fallo puntual de red con Supabase
// en frío, por ejemplo), reintenta sola una vez antes de enseñar nada: el
// usuario ya no tiene que recargar a mano. Si vuelve a fallar, sale el
// mensaje con un botón para reintentar.
export default function Error({ error, unstable_retry }) {
  const yaReintentado = useRef(false);

  useEffect(() => {
    console.error(error);
    if (!yaReintentado.current) {
      yaReintentado.current = true;
      unstable_retry();
    }
  }, [error, unstable_retry]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-black tracking-tight">No se ha podido cargar la página</h1>
      <p className="text-sm text-muted">Ha fallado algo en el servidor. Suele arreglarse al reintentar.</p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-xl bg-neon-purple px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
      >
        Reintentar
      </button>
    </main>
  );
}
