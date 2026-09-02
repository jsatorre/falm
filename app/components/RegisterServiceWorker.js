"use client";

import { useEffect } from "react";

// Registra el service worker en cuanto carga la app, en cualquier página —
// no solo cuando alguien visita /cuenta (donde antes vivía este registro,
// solo pensado para activar las notificaciones push). Sin un service
// worker activo desde el principio, Chrome no ve la web como una PWA
// instalable de verdad y, al pulsar "instalar"/"crear acceso directo",
// ofrece solo un acceso directo genérico sin el icono del manifest.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
