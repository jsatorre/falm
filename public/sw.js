// Service worker mínimo, solo para notificaciones push — no cachea nada
// (no es un service worker "offline-first", esta app siempre necesita red).

self.addEventListener("push", (event) => {
  let data = { title: "FALM", body: "" };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data?.text() ?? "";
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "FALM", {
      body: data.body,
      icon: "/icon-192",
      badge: "/icon-192",
      data: { url: data.url ?? "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
