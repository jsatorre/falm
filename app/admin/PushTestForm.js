"use client";

import { useState } from "react";

export default function PushTestForm({ teams }) {
  const [enviandoTeamId, setEnviandoTeamId] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  async function probar(team) {
    setEnviandoTeamId(team.id);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/push-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(`${team.name}: ${data.error ?? "no se ha podido enviar"}`);
        return;
      }
      setResultado(`Enviada a ${team.name} (${data.dispositivos} dispositivo${data.dispositivos === 1 ? "" : "s"})`);
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
            onClick={() => probar(t)}
            disabled={enviandoTeamId === t.id}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:border-neon-green hover:text-neon-green disabled:opacity-40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.crest_url} alt="" className="h-4 w-4 rounded-full object-cover" />
            {t.name}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-neon-pink">{error}</p>}
      {resultado && <p className="text-xs text-neon-green">{resultado}</p>}
    </div>
  );
}
