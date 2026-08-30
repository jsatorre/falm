"use client";

import { useEffect, useMemo, useState } from "react";

export default function DineroConfigForm({ numJornadas, numVueltas }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch("/api/admin/dinero-config")
      .then((r) => r.json())
      .then(setDatos)
      .finally(() => setCargando(false));
  }, []);

  const numParticipantes = useMemo(
    () => (datos ? datos.teams.filter((t) => t.participaDinero).length : 0),
    [datos]
  );

  const bote = datos ? Number(datos.cuota || 0) * numParticipantes : 0;
  const repartido = datos
    ? Number(datos.ligaCampeon || 0) +
      Number(datos.ligaSubcampeon || 0) +
      Number(datos.suddenCampeon || 0) +
      Number(datos.suddenSubcampeon || 0) +
      Number(datos.jornada || 0) * numJornadas +
      Number(datos.vuelta || 0) * numVueltas
    : 0;
  const diferencia = Math.round((bote - repartido) * 100) / 100;

  function actualizar(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  function alternarParticipa(teamId) {
    setDatos((d) => ({
      ...d,
      teams: d.teams.map((t) => (t.id === teamId ? { ...t, participaDinero: !t.participaDinero } : t)),
    }));
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    try {
      const participaDinero = Object.fromEntries(datos.teams.map((t) => [t.id, t.participaDinero]));
      await fetch("/api/admin/dinero-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, participaDinero }),
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando || !datos) {
    return <p className="text-sm text-muted">Cargando…</p>;
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 rounded-xl border border-border bg-background-elevated p-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Quién participa en el bote
        </p>
        <div className="flex flex-wrap gap-1.5">
          {datos.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => alternarParticipa(t.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                t.participaDinero
                  ? "border-neon-green/60 bg-neon-green/10 text-neon-green"
                  : "border-border text-muted line-through opacity-60"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.crestUrl} alt="" className="h-4 w-4 rounded-full object-cover" />
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <Campo label="Cuota por equipo (€)" valor={datos.cuota} onChange={(v) => actualizar("cuota", v)} />

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Campeón de Liga (€)" valor={datos.ligaCampeon} onChange={(v) => actualizar("ligaCampeon", v)} />
        <Campo label="Subcampeón de Liga (€)" valor={datos.ligaSubcampeon} onChange={(v) => actualizar("ligaSubcampeon", v)} />
        <Campo label="Campeón de Sudden (€)" valor={datos.suddenCampeon} onChange={(v) => actualizar("suddenCampeon", v)} />
        <Campo label="Subcampeón de Sudden (€)" valor={datos.suddenSubcampeon} onChange={(v) => actualizar("suddenSubcampeon", v)} />
        <Campo
          label={`Campeón de cada jornada (€, ×${numJornadas})`}
          valor={datos.jornada}
          onChange={(v) => actualizar("jornada", v)}
        />
        <Campo
          label={`Campeón de cada vuelta (€, ×${numVueltas})`}
          valor={datos.vuelta}
          onChange={(v) => actualizar("vuelta", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectEquipo
          label="Campeón de Sudden (equipo)"
          teams={datos.teams}
          value={datos.suddenCampeonTeamId}
          onChange={(v) => actualizar("suddenCampeonTeamId", v)}
        />
        <SelectEquipo
          label="Subcampeón de Sudden (equipo)"
          teams={datos.teams}
          value={datos.suddenSubcampeonTeamId}
          onChange={(v) => actualizar("suddenSubcampeonTeamId", v)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-xs">
        <span className="text-muted">
          Bote: <span className="font-semibold text-foreground">{bote.toFixed(2)}€</span> ({numParticipantes} equipos)
        </span>
        <span className="text-muted">
          Repartido en premios: <span className="font-semibold text-foreground">{repartido.toFixed(2)}€</span>
        </span>
        <span className={diferencia < 0 ? "font-semibold text-neon-pink" : "font-semibold text-neon-green"}>
          {diferencia >= 0 ? `Sobran ${diferencia.toFixed(2)}€` : `Faltan ${Math.abs(diferencia).toFixed(2)}€`}
        </span>
      </div>

      <button
        type="submit"
        disabled={guardando}
        className="self-start rounded-lg bg-neon-green px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
      >
        {guardando ? "Guardando…" : guardado ? "¡Guardado! ✅" : "Guardar"}
      </button>
    </form>
  );
}

function Campo({ label, valor, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <input
        type="number"
        min={0}
        step="0.5"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-green"
      />
    </label>
  );
}

function SelectEquipo({ label, teams, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-green"
      >
        <option value="">Sin fijar</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}
