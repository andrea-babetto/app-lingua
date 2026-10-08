// Shows a notification when the server sends one, and opens the right chat when it is tapped.
// It caches nothing, so it can never serve an old version of the app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { /* ignore */ }
  event.waitUntil(self.registration.showNotification(d.title || "glott", {
    body: d.body || "New message",
    tag: d.chat_id || "glott",
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { chat_id: d.chat_id || "" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = (event.notification.data && event.notification.data.chat_id) || "";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if ("focus" in w) { await w.focus(); w.postMessage({ type: "open_chat", chat_id: chatId }); return; }
    }
    await self.clients.openWindow(chatId ? `/?chat=${encodeURIComponent(chatId)}` : "/");
  })());
});
