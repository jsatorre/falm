"use client";

import { useEffect, useState } from "react";

const DIAS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export default function FichajesDeadlineForm() {
  const [diaSemana, setDiaSemana] = useState("4");
  const [hora, setHora] = useState("23:50");
  const [proximaJornada, setProximaJornada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/admin/fichajes-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.diaSemana != null) setDiaSemana(String(data.diaSemana));
        if (data.hora) setHora(data.hora);
        setProximaJornada(data.proximaJornada);
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setGuardado(false);
    try {
      const res = await fetch("/api/admin/fichajes-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diaSemana: Number(diaSemana), hora }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido guardar");
        return;
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
      // Recargar para ver la próxima jornada con la hora tope ya aplicada.
      const fresco = await fetch("/api/admin/fichajes-config").then((r) => r.json());
      setProximaJornada(fresco.proximaJornada);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background-elevated p-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Día de la semana</span>
          <select
            value={diaSemana}
            onChange={(e) => setDiaSemana(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-orange"
          >
            {DIAS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Hora</span>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
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
        {error && <p className="w-full text-xs text-neon-pink">{error}</p>}
        {guardado && <p className="w-full text-xs text-neon-green">Guardado — se aplica todas las semanas a partir de ahora.</p>}
      </form>

      {proximaJornada?.deadline && (
        <p className="text-xs text-muted">
          Próxima hora tope (Jornada {proximaJornada.jornadaCaraACara}):{" "}
          <span className="text-foreground">
            {new Date(proximaJornada.deadline).toLocaleString("es-ES", {
              weekday: "long",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
      )}
    </div>
  );
}
