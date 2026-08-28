"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AplazarJornadaForm() {
  const router = useRouter();
  const [jornadaLiga, setJornadaLiga] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/aplazar-jornada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jornadaLiga }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido aplazar");
        return;
      }
      setResultado(data);
      setJornadaLiga("");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Jornada de Liga a saltar</span>
        <input
          type="number"
          min={1}
          max={38}
          value={jornadaLiga}
          onChange={(e) => setJornadaLiga(e.target.value)}
          placeholder="ej. 10"
          className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-purple"
        />
      </label>
      <button
        type="submit"
        disabled={enviando || !jornadaLiga}
        className="rounded-lg bg-neon-pink px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {enviando ? "Aplazando…" : "Aplazar"}
      </button>

      {error && <p className="w-full text-xs text-neon-pink">{error}</p>}
      {resultado && (
        <p className="w-full text-xs text-neon-green">
          Hecho: los enfrentamientos de la Jornada de Liga {resultado.jornadaSaltada} se han movido a la
          Jornada de Liga {resultado.jornadaNueva}.
        </p>
      )}
    </form>
  );
}
