// Reading a written message aloud in the listener's language. One voice at a time in the whole app.
import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";

// A silent sound played straight from the tap: iPhone then lets the voice play when it arrives a moment later.
export const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
export const fileUrl = (u) => (u && u.startsWith("/api/") ? API + u.slice(4) : u);

let audio = null;
let current = null;  // the message being read
const emit = (id, state) => window.dispatchEvent(new CustomEvent("glott:speak", { detail: { id, state } }));
const stop = () => { if (current) { audio?.pause(); emit(current, "idle"); current = null; } };

if (typeof window !== "undefined") {
  window.addEventListener("glott:voice-play", (e) => { if (e.detail !== current) stop(); });  // a voice message started
}

export async function speak(msg, onError) {
  if (!audio) {
    audio = new Audio();
    audio.onended = () => { if (!audio.src.startsWith("data:")) stop(); };
  }
  if (current === msg.id) { stop(); return; }
  stop();
  current = msg.id;
  window.dispatchEvent(new CustomEvent("glott:voice-play", { detail: msg.id }));
  let url = msg.speech_url ? fileUrl(msg.speech_url) : null;
  if (!url) {
    audio.src = SILENCE;
    audio.play().catch(() => {});
    emit(msg.id, "loading");
    try { url = fileUrl((await api.post(`/messages/${msg.id}/speech`)).data.url); }
    catch (e) { if (current === msg.id) stop(); onError?.(e); return; }
    if (current !== msg.id) return;  // something else was pressed meanwhile
  }
  audio.src = url;
  emit(msg.id, "playing");
  audio.play().catch(() => { if (current === msg.id) stop(); });
}

// "idle" | "loading" | "playing" for one message
export function useSpeaking(id) {
  const [state, setState] = useState(current === id ? "playing" : "idle");
  useEffect(() => {
    const on = (e) => { if (e.detail.id === id) setState(e.detail.state); };
    window.addEventListener("glott:speak", on);
    return () => window.removeEventListener("glott:speak", on);
  }, [id]);
  return state;
}
