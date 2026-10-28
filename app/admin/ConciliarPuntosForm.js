"use client";

import { useState } from "react";

export default function ConciliarPuntosForm() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function conciliar() {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/conciliar-puntos", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido sincronizar con Biwenger");
        return;
      }
      setAviso(`Hecho: ${data.synced} resultados actualizados con los puntos oficiales de Biwenger.`);
    } catch {
      setError("No se ha podido sincronizar con Biwenger");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <button
        type="button"
        disabled={enviando}
        onClick={conciliar}
        className="self-start rounded-lg bg-neon-orange px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {enviando ? "Sincronizando…" : "Traer puntos oficiales de Biwenger"}
      </button>
      {error && <p className="text-xs text-neon-pink">{error}</p>}
      {aviso && <p className="text-xs text-neon-green">{aviso}</p>}
    </div>
  );
}
