"use client";

import { useEffect, useState } from "react";

export default function PalmaresView({ equipos }) {
  const [trophies, setTrophies] = useState([]);
  const [records, setRecords] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [formAbierto, setFormAbierto] = useState(null); // "trophy" | "record" | null

  async function recargar() {
    const res = await fetch("/api/palmares");
    const data = await res.json();
    setTrophies(data.trophies ?? []);
    setRecords(data.records ?? []);
  }

  useEffect(() => {
    recargar().finally(() => setCargando(false));
  }, []);

  if (cargando) return <p className="text-sm text-muted">Cargando palmarés…</p>;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Campeones por temporada</h2>
          <button
            onClick={() => setFormAbierto(formAbierto === "trophy" ? null : "trophy")}
            className="text-xs font-medium text-neon-purple hover:underline"
          >
            {formAbierto === "trophy" ? "cancelar" : "+ añadir"}
          </button>
        </div>

        {formAbierto === "trophy" && (
          <TrophyForm equipos={equipos} onSaved={() => { setFormAbierto(null); recargar(); }} />
        )}

        {trophies.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ningún campeón registrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {trophies.map((t) => (
              <div
                key={t.id}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-background-elevated p-4 text-center glow-purple"
              >
                <span className="text-2xl">🏆</span>
                {t.team && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.team.crest_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                )}
                <span className="text-sm font-semibold text-foreground">{t.team?.name ?? "?"}</span>
                <span className="text-xs text-muted">{t.season_label}</span>
                {t.note && <span className="text-[11px] text-muted">{t.note}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Récords</h2>
          <button
            onClick={() => setFormAbierto(formAbierto === "record" ? null : "record")}
            className="text-xs font-medium text-neon-green hover:underline"
          >
            {formAbierto === "record" ? "cancelar" : "+ añadir"}
          </button>
        </div>

        {formAbierto === "record" && (
          <RecordForm equipos={equipos} onSaved={() => { setFormAbierto(null); recargar(); }} />
        )}

        {records.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ningún récord registrado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {records.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background-elevated px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🥇</span>
                  <span className="text-foreground">{r.label}</span>
                  {r.team && <span className="text-muted">— {r.team.name}</span>}
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <span className="font-semibold text-foreground">{r.value}</span>
                  {r.season_label && <span className="text-xs">({r.season_label})</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TrophyForm({ equipos, onSaved }) {
  const [seasonLabel, setSeasonLabel] = useState("");
  const [championTeamId, setChampionTeamId] = useState("");
  const [note, setNote] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await fetch("/api/palmares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "trophy", seasonLabel, championTeamId, note }),
      });
      onSaved();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background-elevated p-3">
      <Campo label="Temporada" value={seasonLabel} onChange={setSeasonLabel} placeholder="2025-2026" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Campeón</span>
        <select
          value={championTeamId}
          onChange={(e) => setChampionTeamId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-purple"
        >
          <option value="">elige equipo</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      <Campo label="Nota (opcional)" value={note} onChange={setNote} placeholder="ej. remontada épica" />
      <button
        type="submit"
        disabled={guardando || !seasonLabel || !championTeamId}
        className="rounded-lg bg-neon-purple px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
      >
        Guardar
      </button>
    </form>
  );
}

function RecordForm({ equipos, onSaved }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [teamId, setTeamId] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await fetch("/api/palmares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "record", label, value, teamId, seasonLabel }),
      });
      onSaved();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background-elevated p-3">
      <Campo label="Récord" value={label} onChange={setLabel} placeholder="Más puntos en una jornada" />
      <Campo label="Valor" value={value} onChange={setValue} placeholder="132" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Equipo (opcional)</span>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-green"
        >
          <option value="">sin equipo</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      <Campo label="Temporada (opcional)" value={seasonLabel} onChange={setSeasonLabel} placeholder="2025-2026" />
      <button
        type="submit"
        disabled={guardando || !label || !value}
        className="rounded-lg bg-neon-green px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
      >
        Guardar
      </button>
    </form>
  );
}

function Campo({ label, value, onChange, placeholder }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-purple"
      />
    </label>
  );
}
