// Notifications when the app is closed (Web Push). Browsers only allow asking from a tap, so this is called from buttons.
import { api } from "@/lib/api";

const toBytes = (b64) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";

// unsupported | needs-install | blocked | off | on
export async function pushState() {
  if (isIOS() && !isStandalone()) return "needs-install"; // iPhone: only installed web apps can be notified
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch { return "off"; }
}

async function subscribe() {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/key");
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(data.public_key) }));
  await api.post("/push/subscribe", sub.toJSON());
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  await subscribe();
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

// Already allowed on this device: make sure the server still knows it (subscriptions can change).
export async function syncPush() {
  try {
    if (pushSupported() && Notification.permission === "granted" && !(isIOS() && !isStandalone())) await subscribe();
  } catch { /* not important */ }
}
