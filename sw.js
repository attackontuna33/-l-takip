self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Damla'nın ilaç hatırlatması", {
    body: data.body || "İlaç saatini kontrol etmeyi unutma.",
    icon: data.icon || "/icon.svg",
    badge: data.badge || "/icon.svg",
    tag: data.tag || "damla-medication-reminder",
    renotify: true,
    data: data.data || {}
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) if ("focus" in client) return client.focus();
    return self.clients.openWindow("/");
  }));
});
