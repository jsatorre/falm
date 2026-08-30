"use client";

import { useState } from "react";

export default function ResetearPinForm({ teams }) {
  const [enviandoTeamId, setEnviandoTeamId] = useState(null);
  const [resultado, setResultado] = useState(null); // { teamName, pin }
  const [error, setError] = useState(null);

  async function resetear(team) {
    if (!confirm(`¿Generar un PIN nuevo para ${team.name}? El PIN actual dejará de funcionar.`)) return;

    setEnviandoTeamId(team.id);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/resetear-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido resetear el PIN");
        return;
      }
      setResultado({ teamName: team.name, pin: data.pin });
    } finally {
      setEnviandoTeamId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => resetear(t)}
            disabled={enviandoTeamId === t.id}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-neon-pink hover:text-neon-pink disabled:opacity-40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.crest_url} alt="" className="h-4 w-4 rounded-full object-cover" />
            {t.name}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-neon-pink">{error}</p>}
      {resultado && (
        <p className="rounded-lg border border-neon-green/40 bg-neon-green/10 px-3 py-2 text-sm text-neon-green">
          Nuevo PIN de <strong>{resultado.teamName}</strong>: <strong className="tracking-[0.3em]">{resultado.pin}</strong> — pásaselo tú, aquí solo se ve una vez.
        </p>
      )}
    </div>
  );
}
