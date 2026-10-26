// What the server can do (voice messages, spoken translations, …): asked once, shared by every screen.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let cached = null;
let pending = null;

export function getConfig() {
  if (cached) return Promise.resolve(cached);
  if (!pending) pending = api.get("/config").then(({ data }) => (cached = data)).catch(() => { pending = null; return {}; });
  return pending;
}

export function useConfig() {
  const [cfg, setCfg] = useState(cached || {});
  useEffect(() => { let live = true; getConfig().then((c) => live && setCfg(c)); return () => { live = false; }; }, []);
  return cfg;
}
