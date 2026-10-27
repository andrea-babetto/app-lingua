// Speak instead of typing: tap, talk, tap "Done", and the words appear in the message box to check before sending.
import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { pickMime, clock } from "@/components/chat/VoiceRecorder";

export default function Dictation({ maxSeconds = 120, onText }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("idle");  // idle | listening | writing
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef({});
  const textRef = useRef(onText);
  textRef.current = onText;

  const release = () => {
    const s = rec.current;
    clearInterval(s.tick);
    s.stream?.getTracks().forEach((tr) => tr.stop());
  };
  useEffect(() => () => {  // leaving the chat while dictating: nothing is written
    const s = rec.current;
    if (s.recorder && s.recorder.state !== "inactive") { s.recorder.onstop = null; s.recorder.stop(); }
    release();
  }, []);

  const finish = (keep) => {
    const s = rec.current;
    if (!s.recorder) return;
    const secs = (Date.now() - s.start) / 1000;
    const { recorder, chunks } = s;
    const type = recorder.mimeType || s.mime || "audio/webm";
    recorder.onstop = async () => {
      if (!keep || !chunks.length) { setMode("idle"); return; }
      setMode("writing");
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("duration", Math.max(0.1, Math.min(secs, maxSeconds)).toFixed(1));
      form.append("file", new Blob(chunks, { type }), `dictation.${ext}`);
      try {
        const { data } = await api.post("/dictate", form);
        if (data.text?.trim()) textRef.current(data.text.trim());
        else toast(t("I didn't catch that. Try again."));
      } catch { toast.error(t("I didn't catch that. Try again.")); }
      setMode("idle");
    };
    if (recorder.state !== "inactive") recorder.stop();
    release();
    rec.current = {};
    setElapsed(0);
    if (!keep) setMode("idle");
  };

  const start = async () => {
    if (mode !== "idle") return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast.error(t("Allow the microphone to record voice messages")); return; }
    const mime = pickMime();
    let recorder;
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { stream.getTracks().forEach((tr) => tr.stop()); toast.error(t("This device cannot record voice messages")); return; }
    const chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    recorder.start(250);
    const s = { stream, recorder, chunks, mime, start: Date.now() };
    s.tick = setInterval(() => {
      const secs = (Date.now() - s.start) / 1000;
      setElapsed(secs);
      if (secs >= maxSeconds) finish(true);
    }, 200);
    rec.current = s;
    navigator.vibrate?.(15);
    setMode("listening");
  };

  return (
    <>
      <button data-testid="dictate-button" aria-label={t("Dictate")} onClick={start} disabled={mode !== "idle"}
        className="w-9 h-10 rounded-full flex items-center justify-center text-subtle hover:text-foreground shrink-0">
        <AudioLines className="w-5 h-5" />
      </button>
      {mode !== "idle" && (
        <div data-testid="dictation" className="absolute inset-0 z-10 rounded-[20px] bg-surface flex items-center gap-2 ps-3.5 pe-1">
          {mode === "listening" ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
              <span className="tabular-nums text-[15px] font-medium shrink-0">{clock(elapsed)}</span>
              <span className="flex-1 min-w-0 truncate text-[15px] text-muted-foreground">{t("Listening…")}</span>
              <button data-testid="dictation-cancel" aria-label={t("Cancel")} onClick={() => finish(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"><X className="w-5 h-5" /></button>
              <button data-testid="dictation-done" aria-label={t("Done")} onClick={() => finish(true)}
                className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1 shrink-0"><Check className="w-4 h-4" /> {t("Done")}</button>
            </>
          ) : (
            <span data-testid="dictation-writing" className="flex items-center gap-2 text-[15px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t("Writing…")}</span>
          )}
        </div>
      )}
    </>
  );
}
