self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("propel-offline-v1").then((cache) => cache.addAll(["/m", "/manifest.webmanifest"]).catch(() => undefined)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheable = url.pathname === "/m" || url.pathname.startsWith("/api/actions/mobile") || url.pathname.startsWith("/api/announcements") || url.pathname.startsWith("/api/attendance") || url.pathname.startsWith("/api/invoices");
  if (!cacheable) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open("propel-offline-v1").then((cache) => cache.put(req, copy)).catch(() => undefined);
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Promise.reject("offline")))
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("./m"));
});
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Notice", body: "You have a new notice." };
  event.waitUntil(
    self.registration.showNotification(data.title || "Notice", {
      body: data.body || "",
    })
  );
});
