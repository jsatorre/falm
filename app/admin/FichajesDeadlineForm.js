"use client";

import { useEffect, useState } from "react";

export default function FichajesDeadlineForm() {
  const [ronda, setRonda] = useState(null);
  const [deadline, setDeadline] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/admin/fichajes-deadline")
      .then((r) => r.json())
      .then((data) => {
        setRonda(data.ronda);
        if (data.ronda?.deadline) {
          setDeadline(aInputLocal(data.ronda.deadline));
        }
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setGuardado(false);
    try {
      const res = await fetch("/api/admin/fichajes-deadline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadline: deadline ? new Date(deadline).toISOString() : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido guardar");
        return;
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando…</p>;

  if (!ronda) {
    return <p className="text-sm text-muted">No hay ninguna jornada de fichajes abierta ahora mismo.</p>;
  }

  return (
    <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Hora tope — Jornada {ronda.jornadaCaraACara}</span>
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-orange"
        />
      </label>
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-neon-orange px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {enviando ? "Guardando…" : "Guardar"}
      </button>
      {deadline && (
        <button
          type="button"
          onClick={() => setDeadline("")}
          className="text-xs text-muted underline"
        >
          quitar hora tope
        </button>
      )}
      {error && <p className="w-full text-xs text-neon-pink">{error}</p>}
      {guardado && <p className="w-full text-xs text-neon-green">Guardado.</p>}
    </form>
  );
}

function aInputLocal(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
