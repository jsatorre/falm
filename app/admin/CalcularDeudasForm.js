"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CalcularDeudasForm({ calculadaAtInicial }) {
  const router = useRouter();
  const [calculadaAt, setCalculadaAt] = useState(calculadaAtInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function calcular() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/calcular-deudas", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido calcular");
        return;
      }
      setCalculadaAt(data.calculadaAt);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <p className="text-xs text-muted">
        {calculadaAt
          ? `Última liquidación publicada: ${new Date(calculadaAt).toLocaleString("es-ES")}. Puedes volver a calcularla cuando quieras (por ejemplo, al terminar la Liga) y se actualiza la publicada.`
          : "Todavía no se ha calculado ninguna liquidación — en Premios no se muestra \"quién debe a quién\" hasta que la publiques aquí."}
      </p>
      <button
        type="button"
        onClick={calcular}
        disabled={enviando}
        className="self-start rounded-lg bg-neon-pink px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {enviando ? "Calculando…" : "Calcular deudas"}
      </button>
      {error && <p className="text-xs text-neon-pink">{error}</p>}
    </div>
  );
}
