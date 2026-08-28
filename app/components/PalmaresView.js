"use client";

import { useEffect, useMemo, useState } from "react";

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

  const porTemporada = useMemo(() => {
    const mapa = new Map();
    for (const t of trophies) {
      if (!mapa.has(t.season_label)) mapa.set(t.season_label, {});
      mapa.get(t.season_label)[t.competition] = t;
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [trophies]);

  const ranking = useMemo(() => {
    const porEquipo = new Map();
    for (const t of trophies) {
      const key = t.champion_name;
      if (!porEquipo.has(key)) {
        porEquipo.set(key, { nombre: key, team: t.team, ligas: 0, copas: 0 });
      }
      const fila = porEquipo.get(key);
      if (t.competition === "liga") fila.ligas += 1;
      else fila.copas += 1;
      if (t.team) fila.team = t.team;
    }
    return [...porEquipo.values()].sort(
      (a, b) => b.ligas + b.copas - (a.ligas + a.copas) || b.ligas - a.ligas
    );
  }, [trophies]);

  if (cargando) return <p className="text-sm text-muted">Cargando palmarés…</p>;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
          Ranking histórico de campeones
        </h2>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ningún título registrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-2 font-medium">Equipo</th>
                  <th className="px-3 py-2 text-right font-medium">Ligas</th>
                  <th className="px-3 py-2 text-right font-medium">Copas</th>
                  <th className="px-3 py-2 text-right font-medium">Títulos</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.nombre} className={`border-b border-border/60 last:border-0 ${i === 0 ? "bg-neon-purple/10" : ""}`}>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        {r.team && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.team.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                        )}
                        <span className="text-foreground">{r.nombre}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-muted">{r.ligas}</td>
                    <td className="px-3 py-2 text-right text-muted">{r.copas}</td>
                    <td className="px-3 py-2 text-right font-bold text-neon-green">{r.ligas + r.copas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

        {porTemporada.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay ningún campeón registrado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {porTemporada.map(([season, { liga, copa }]) => (
              <div
                key={season}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-background-elevated px-4 py-3 text-sm"
              >
                <span className="w-20 shrink-0 font-semibold text-foreground">{season}</span>
                <TituloInline icono="🏆" etiqueta="Liga" titulo={liga} />
                <TituloInline icono="⚡" etiqueta="Copa" titulo={copa} />
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

function TituloInline({ icono, etiqueta, titulo }) {
  if (!titulo) {
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <span className="opacity-40">{icono}</span>
        <span className="text-xs">{etiqueta}: —</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span>{icono}</span>
      {titulo.team && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={titulo.team.crest_url} alt="" className="h-4 w-4 rounded-full object-cover" />
      )}
      <span className="text-foreground">{titulo.champion_name}</span>
    </span>
  );
}

function TrophyForm({ equipos, onSaved }) {
  const [seasonLabel, setSeasonLabel] = useState("");
  const [competition, setCompetition] = useState("liga");
  const [championName, setChampionName] = useState("");
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
        body: JSON.stringify({ type: "trophy", seasonLabel, competition, championName, championTeamId, note }),
      });
      onSaved();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-background-elevated p-3">
      <Campo label="Temporada" value={seasonLabel} onChange={setSeasonLabel} placeholder="2026/2027" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Competición</span>
        <select
          value={competition}
          onChange={(e) => setCompetition(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-purple"
        >
          <option value="liga">Liga</option>
          <option value="copa">Copa / Sudden Death</option>
        </select>
      </label>
      <Campo label="Campeón" value={championName} onChange={setChampionName} placeholder="Nombre del equipo" />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Vincular a equipo actual (opcional)</span>
        <select
          value={championTeamId}
          onChange={(e) => setChampionTeamId(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-purple"
        >
          <option value="">sin vincular</option>
          {equipos.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </label>
      <Campo label="Nota (opcional)" value={note} onChange={setNote} placeholder="ej. remontada épica" />
      <button
        type="submit"
        disabled={guardando || !seasonLabel || !championName}
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
