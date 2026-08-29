"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DraftAdminForm({ configurado, enMarcha, ronda, currentPick, totalPicks }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function empezar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/draft/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido empezar el draft");
        return;
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  async function reiniciar() {
    if (!confirm("Esto borra TODOS los fichajes del draft hecho hasta ahora. ¿Seguro?")) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/draft/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido reiniciar");
        return;
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <p className="text-xs text-muted">
        {!configurado && "El draft todavía no se ha configurado."}
        {configurado && enMarcha && `En marcha — pick ${currentPick + 1} de ${totalPicks} (ronda ${ronda}).`}
        {configurado && !enMarcha && "Draft configurado pero no está en marcha (o ya ha terminado)."}
      </p>

      <div className="flex flex-wrap gap-2">
        {!configurado && (
          <button
            type="button"
            onClick={empezar}
            disabled={enviando}
            className="rounded-lg bg-neon-green px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {enviando ? "Sorteando…" : "Empezar draft (sortea el orden)"}
          </button>
        )}

        {configurado && (
          <button
            type="button"
            onClick={reiniciar}
            disabled={enviando}
            className="rounded-lg border border-neon-pink px-4 py-2 text-sm font-semibold text-neon-pink disabled:opacity-40"
          >
            {enviando ? "Reiniciando…" : "Reiniciar draft (borra todo)"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-neon-pink">{error}</p>}
    </div>
  );
}
