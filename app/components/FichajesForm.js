"use client";

import { useEffect, useState } from "react";

export default function FichajesForm() {
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    fetch("/api/fichajes")
      .then((r) => r.json())
      .then((data) => {
        setPlayer1(data.player1 ?? "");
        setPlayer2(data.player2 ?? "");
        setCerrado(Boolean(data.cerrado));
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    try {
      await fetch("/api/fichajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1, player2 }),
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <p className="text-sm text-muted">Cargando tu wishlist…</p>;
  }

  if (cerrado) {
    return (
      <p className="text-sm text-muted">
        No hay ventana de fichajes abierta ahora mismo (la temporada cara a
        cara ya ha terminado sus 22 jornadas).
      </p>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <Campo
        label="1ª opción"
        placeholder="ej. Vinicius Jr."
        value={player1}
        onChange={setPlayer1}
      />
      <Campo
        label="2ª opción (por si te la quitan)"
        placeholder="ej. Lamine Yamal"
        value={player2}
        onChange={setPlayer2}
      />

      <button
        type="submit"
        disabled={guardando}
        className="mt-2 rounded-xl bg-neon-green px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
      >
        {guardando ? "Guardando…" : guardado ? "¡Guardado! ✅" : "Guardar wishlist"}
      </button>

      <p className="text-xs text-muted">
        Solo tú ves esto. Cuando se cierre la ventana de fichajes, el equipo
        peor clasificado que no fichó la semana pasada tiene prioridad para
        llevarse su 1ª opción libre.
      </p>
    </form>
  );
}

function Campo({ label, placeholder, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-neon-green"
      />
    </label>
  );
}
