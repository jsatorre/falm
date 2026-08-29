"use client";

import { useEffect, useState } from "react";
import { calcularPuntosEnfrentamiento } from "../lib/scoring";

// Cada sync son 12 llamadas a Biwenger en paralelo (una por equipo) — nada
// de dejarlo con un poll corto y automático. El servidor comparte un mismo
// caché de 60s entre todos (ver app/lib/sync.js), así que ese es también
// el cooldown real del botón: da igual quién lo pulse, en esa ventana solo
// se dispara una sincronización real. El auto cada 15 min es solo para que
// la pantalla no se quede congelada del todo si alguien la deja abierta
// sin tocar nada.
const COOLDOWN_MS = 60000;
const AUTO_MS = 15 * 60000;

export default function LiveRound({ inicial }) {
  const [datos, setDatos] = useState(inicial);
  const [actualizando, setActualizando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  async function actualizar() {
    setActualizando(true);
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      const data = await res.json();
      setDatos(data);
    } finally {
      setActualizando(false);
    }
  }

  useEffect(() => {
    const idAuto = setInterval(actualizar, AUTO_MS);
    const idReloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearInterval(idAuto);
      clearInterval(idReloj);
    };
  }, []);

  const segundosDesdeSync = datos.syncedAt ? Math.floor((ahora - datos.syncedAt) / 1000) : null;
  const enCooldown = segundosDesdeSync != null && segundosDesdeSync * 1000 < COOLDOWN_MS;
  const segundosParaPoder = enCooldown ? Math.ceil((COOLDOWN_MS - segundosDesdeSync * 1000) / 1000) : 0;

  if (!datos.jornada) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted">
        Todavía no hay ninguna jornada cara a cara en marcha.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-neon-pink">
            <span className="pulse-live inline-block h-2 w-2 rounded-full bg-neon-pink" />
            En directo
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            Jornada {datos.jornada}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={actualizar}
            disabled={actualizando || enCooldown}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-neon-pink hover:text-neon-pink disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actualizando ? "Actualizando…" : enCooldown ? `Actualizar (${segundosParaPoder}s)` : "Actualizar"}
          </button>
          {segundosDesdeSync != null && !actualizando && (
            <span className="text-[10px] text-muted">actualizado hace {segundosDesdeSync}s</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {datos.fixtures.map((f) => {
          const jugando = f.pointsA == null || f.pointsB == null;
          const puntosA =
            f.pointsA != null && f.pointsB != null
              ? calcularPuntosEnfrentamiento(f.pointsA, f.pointsB)
              : null;
          const puntosB =
            f.pointsA != null && f.pointsB != null
              ? calcularPuntosEnfrentamiento(f.pointsB, f.pointsA)
              : null;

          return (
            <div key={`${f.teamA.id}-${f.teamB.id}`} className="flex flex-col gap-1.5">
              {f.destacado && (
                <span className="flex items-center gap-1.5 self-start rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                  ⭐ Partido de la jornada — {f.motivo}
                </span>
              )}
              <div
                className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border bg-background-elevated px-4 ${
                  f.destacado ? "glow-gold border-amber-400/60 py-5" : "border-border py-4"
                }`}
              >
                <EquipoEnDirecto
                  equipo={f.teamA}
                  puntos={f.pointsA}
                  ganando={puntosA != null && puntosA > puntosB}
                  align="right"
                  grande={f.destacado}
                />

                <div className="flex flex-col items-center gap-1 px-2">
                  <span className="text-[10px] uppercase tracking-widest text-muted">
                    {jugando ? "jugando" : "cerrado"}
                  </span>
                  <span className="text-lg font-black text-muted">vs</span>
                </div>

                <EquipoEnDirecto
                  equipo={f.teamB}
                  puntos={f.pointsB}
                  ganando={puntosB != null && puntosB > puntosA}
                  align="left"
                  grande={f.destacado}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EquipoEnDirecto({ equipo, puntos, ganando, align, grande }) {
  const derecha = align === "right";
  return (
    <div className={`flex items-center gap-2.5 ${derecha ? "flex-row-reverse text-right" : "text-left"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={equipo.crest_url}
        alt=""
        className={`rounded-full object-cover ${grande ? "h-11 w-11" : "h-9 w-9"}`}
      />
      <div className={`flex flex-col ${derecha ? "items-end" : "items-start"}`}>
        <span className="text-xs font-medium text-foreground sm:text-sm">{equipo.name}</span>
        <span
          className={`font-black ${grande ? "text-3xl" : "text-2xl"} ${
            ganando ? "text-neon-green" : "text-muted"
          }`}
        >
          {puntos ?? "—"}
        </span>
      </div>
    </div>
  );
}
