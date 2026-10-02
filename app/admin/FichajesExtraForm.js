"use client";

import { useEffect, useState } from "react";

function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FichajesExtraForm() {
  const [estado, setEstado] = useState(null);
  const [fecha, setFecha] = useState(""); // valor de <input type="datetime-local">, en hora local del navegador
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    fetch("/api/admin/fichajes-extra")
      .then((r) => r.json())
      .then(setEstado)
      .catch(() => setError("No se ha podido cargar el estado de la Ventana Extra"))
      .finally(() => setCargando(false));
  }, []);

  async function enviar(accion, mensajeOk) {
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/fichajes-extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // new Date("YYYY-MM-DDTHH:mm") se interpreta en la zona del navegador
        // (la tuya, no la del servidor), que es lo que se espera aquí.
        body: JSON.stringify({ accion, deadline: fecha ? new Date(fecha).toISOString() : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido completar la acción");
        return;
      }
      setEstado(data);
      setFecha("");
      setAviso(mensajeOk);
    } catch {
      setError("No se ha podido completar la acción");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando…</p>;
  if (!estado) return <p className="text-xs text-neon-pink">{error ?? "Sin datos"}</p>;

  const campoFecha = (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">Hora tope (cierre de la ventana)</span>
      <input
        type="datetime-local"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-neon-orange"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background-elevated p-4">
      {estado.abierta ? (
        <>
          <p className="text-sm text-foreground">
            Ventana Extra <span className="font-semibold text-neon-green">abierta</span>{" "}
            <span className="text-muted">(sobre la Jornada {estado.jornadaCaraACara})</span>
          </p>
          <p className="text-xs text-muted">
            {estado.deadline ? (
              <>
                Cierra el <span className="text-foreground">{formatearFecha(estado.deadline)}</span> — a esa hora
                se publican los fichajes solos.
              </>
            ) : (
              "Todavía sin hora tope: no se cierra hasta que la fijes."
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {campoFecha}
            <button
              type="button"
              disabled={enviando || !fecha}
              onClick={() => enviar("deadline", "Hora tope actualizada.")}
              className="rounded-lg bg-neon-orange px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {estado.deadline ? "Cambiar hora tope" : "Fijar hora tope"}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                if (window.confirm("¿Cancelar la Ventana Extra? Se pierden las wishlists que ya hayan guardado.")) {
                  enviar("cancelar", "Ventana Extra cancelada.");
                }
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-neon-pink disabled:opacity-40"
            >
              Cancelar ventana
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">
            {estado.cerrada ? "La última Ventana Extra ya está cerrada." : "No hay ninguna Ventana Extra abierta."}
          </p>
          {estado.jornadaCaraACara && !estado.ventanaNormalCerrada && (
            <p className="text-xs text-muted">
              La ventana normal de la Jornada {estado.jornadaCaraACara} sigue abierta, así que de momento no
              hace falta una Extra.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            {campoFecha}
            <button
              type="button"
              disabled={enviando || !estado.ventanaNormalCerrada}
              onClick={() => enviar("abrir", "Ventana Extra abierta — ya pueden apuntar sus fichajes.")}
              className="rounded-lg bg-neon-green px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {enviando ? "Abriendo…" : "Abrir nueva ventana de fichajes"}
            </button>
          </div>
          <p className="text-xs text-muted">
            La hora tope es opcional: puedes abrirla ya y fijarla más tarde.
          </p>
        </>
      )}

      {error && <p className="text-xs text-neon-pink">{error}</p>}
      {aviso && <p className="text-xs text-neon-green">{aviso}</p>}
    </div>
  );
}
