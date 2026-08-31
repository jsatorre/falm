"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function NotificacionesForm() {
  const [soportado, setSoportado] = useState(true);
  const [activadas, setActivadas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function comprobar() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setSoportado(false);
        setCargando(false);
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      const sub = await registro.pushManager.getSubscription();
      setActivadas(Boolean(sub));
      setCargando(false);
    }
    comprobar().catch(() => setCargando(false));
  }, []);

  async function activar() {
    setEnviando(true);
    setError(null);
    try {
      if (Notification.permission === "denied") {
        setError("Has bloqueado las notificaciones para esta app en el navegador — actívalas desde los ajustes del sitio para poder encenderlas aquí.");
        return;
      }
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setError("No has dado permiso para las notificaciones.");
        return;
      }

      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        setError("No se ha podido guardar la suscripción en el servidor.");
        return;
      }
      setActivadas(true);
    } catch (err) {
      setError("No se ha podido activar: " + (err?.message ?? err));
    } finally {
      setEnviando(false);
    }
  }

  async function desactivar() {
    setEnviando(true);
    setError(null);
    try {
      const registro = await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setActivadas(false);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted">Cargando…</p>;

  if (!soportado) {
    return (
      <p className="text-sm text-muted">
        Este navegador no admite notificaciones push (en iPhone, tienes que haber añadido FALM a
        la pantalla de inicio primero — no funciona dentro de Safari directamente).
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {activadas
          ? "Notificaciones activadas en este dispositivo — de momento solo avisan cuando se resuelven los fichajes de la jornada."
          : "Recibe un aviso en el móvil cuando se resuelvan los fichajes de la jornada."}
      </p>
      <button
        type="button"
        onClick={activadas ? desactivar : activar}
        disabled={enviando}
        className={`self-start rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
          activadas
            ? "border border-border text-muted hover:border-neon-pink hover:text-neon-pink"
            : "bg-neon-green text-black hover:opacity-90"
        }`}
      >
        {enviando ? "Un momento…" : activadas ? "Desactivar notificaciones" : "Activar notificaciones"}
      </button>
      {error && <p className="text-xs text-neon-pink">{error}</p>}
    </div>
  );
}
