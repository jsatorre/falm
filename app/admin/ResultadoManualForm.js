"use client";

import { useEffect, useState } from "react";

export default function ResultadoManualForm() {
  const [jornadas, setJornadas] = useState([]);
  const [roundId, setRoundId] = useState("");
  const [enfrentamientos, setEnfrentamientos] = useState([]);
  const [puntos, setPuntos] = useState({}); // teamId -> texto del input
  const [avisar, setAvisar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const jornada = jornadas.find((j) => j.id === roundId) ?? null;

  async function cargar(id) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/resultado-manual${id ? `?roundId=${id}` : ""}`);
      const data = await res.json();
      setJornadas(data.jornadas ?? []);
      const lista = data.enfrentamientos ?? [];
      setEnfrentamientos(lista);
      const inicial = {};
      for (const f of lista) {
        inicial[f.teamA.id] = f.teamA.puntos ?? "";
        inicial[f.teamB.id] = f.teamB.puntos ?? "";
      }
      setPuntos(inicial);
    } catch {
      setError("No se han podido cargar los datos");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    fetch("/api/admin/resultado-manual")
      .then((r) => r.json())
      .then((data) => setJornadas(data.jornadas ?? []))
      .catch(() => setError("No se han podido cargar los datos"))
      .finally(() => setCargando(false));
  }, []);

  function elegir(id) {
    setRoundId(id);
    setAviso(null);
    if (id) cargar(id);
    else setEnfrentamientos([]);
  }

  async function enviar(accion) {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/resultado-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, roundId, puntos, avisar }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido completar la acción");
        return;
      }
      await cargar(roundId);
      setAviso(
        accion === "bloquear"
          ? "Jornada bloqueada: la sincronización con Biwenger ya no la toca."
          : accion === "desbloquear"
            ? "Jornada desbloqueada: vuelve a sincronizarse con Biwenger."
            : accion === "vaciar"
              ? "Puntos vaciados: la jornada ya no cuenta en la clasificación hasta que guardes los buenos."
              : `Puntos guardados (${data.guardados} equipos).`
      );
    } catch {
      setError("No se ha podido completar la acción");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando…</p>;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-elevated p-4">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted">Jornada</span>
        <select
          value={roundId}
          onChange={(e) => elegir(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-orange"
        >
          <option value="">Elige una jornada…</option>
          {jornadas.map((j) => (
            <option key={j.id} value={j.id}>
              Jornada {j.jornadaCaraACara} (Liga {j.jornada}) — {j.status}
              {j.bloqueada ? " — BLOQUEADA" : ""}
            </option>
          ))}
        </select>
      </label>

      {jornada && !jornada.bloqueada && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            Bloquéala para fijar sus puntos a mano. Mientras esté bloqueada, lo que haya ahora se queda tal
            cual (aunque Biwenger lo cambie) y no se avisa de su cierre por Telegram.
          </p>
          <button
            type="button"
            disabled={enviando}
            onClick={() => enviar("bloquear")}
            className="self-start rounded-lg bg-neon-orange px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Bloquear jornada
          </button>
        </div>
      )}

      {jornada?.bloqueada && (
        <>
          <p className="text-xs text-neon-orange">
            Jornada bloqueada. Escribe los puntos de cada equipo y guarda; la clasificación y el calendario usan
            estos valores.
          </p>
          <div className="flex flex-col gap-2">
            {enfrentamientos.map((f) => (
              <div
                key={f.teamA.id}
                className="grid grid-cols-[1fr_4.5rem] items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 p-2 text-sm"
              >
                {[f.teamA, f.teamB].map((t) => (
                  <FilaEquipo
                    key={t.id}
                    nombre={t.name}
                    valor={puntos[t.id] ?? ""}
                    onChange={(v) => setPuntos((p) => ({ ...p, [t.id]: v }))}
                  />
                ))}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} />
            Al guardar, mandar al grupo de Telegram el aviso de jornada cerrada con estos puntos
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enviando}
              onClick={() => enviar("guardar")}
              className="rounded-lg bg-neon-green px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {enviando ? "Guardando…" : "Guardar puntos"}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (window.confirm("¿Vaciar los puntos de esta jornada? Dejará de contar en la clasificación hasta que guardes los buenos.")) {
                  enviar("vaciar");
                }
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-neon-pink disabled:opacity-40"
            >
              Vaciar puntos
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (window.confirm("¿Desbloquear? Biwenger volverá a sobrescribir los puntos de esta jornada con los suyos.")) {
                  enviar("desbloquear");
                }
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-neon-pink disabled:opacity-40"
            >
              Desbloquear
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-neon-pink">{error}</p>}
      {aviso && <p className="text-xs text-neon-green">{aviso}</p>}
    </div>
  );
}

function FilaEquipo({ nombre, valor, onChange }) {
  return (
    <>
      <span className="truncate text-foreground">{nombre}</span>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm outline-none focus:border-neon-orange"
      />
    </>
  );
}
