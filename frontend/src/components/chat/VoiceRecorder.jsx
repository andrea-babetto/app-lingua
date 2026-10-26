// Voice messages: hold the microphone to record (like WhatsApp), release to send.
// Slide towards the start of the line to cancel, slide up to lock and talk without holding.
import { useEffect, useRef, useState } from "react";
import { Mic, Trash2, ArrowUp, Lock, ChevronLeft, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

const CANCEL_PX = 110, LOCK_PX = 80, MIN_MS = 800, BARS = 32;

export const canRecord = () => typeof window !== "undefined" && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

// Chrome and Android record webm/opus, iPhone records mp4/aac: the server takes both.
function pickMime() {
  const MR = window.MediaRecorder;
  if (!MR?.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((m) => MR.isTypeSupported(m)) || "";
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function VoiceRecorder({ maxSeconds = 120, rtl, busy, onRecorded }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("idle");  // idle | recording | locked
  const [elapsed, setElapsed] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [levels, setLevels] = useState([]);
  const rec = useRef({});  // the live recording: stream, recorder, chunks, start time, where the finger went down
  const sendRef = useRef(onRecorded);
  sendRef.current = onRecorded;

  const release = (s) => {
    clearInterval(s.tick);
    s.stream?.getTracks().forEach((tr) => tr.stop());
    try { s.audioCtx?.close(); } catch { /* already closed */ }
  };
  const reset = () => { release(rec.current); rec.current = {}; setMode("idle"); setElapsed(0); setDrag({ x: 0, y: 0 }); setLevels([]); };
  useEffect(() => () => {  // leaving the chat while recording: nothing is sent
    const s = rec.current;
    if (s.recorder && s.recorder.state !== "inactive") { s.recorder.onstop = null; s.recorder.stop(); }
    release(s);
  }, []);

  const finish = (send) => {
    const s = rec.current;
    if (!s.recorder) { reset(); return; }
    const ms = Date.now() - s.start;
    if (send && ms < MIN_MS) { send = false; toast(t("Hold to record, release to send")); }
    const { recorder, chunks } = s;
    const type = recorder.mimeType || s.mime || "audio/webm";
    recorder.onstop = () => { if (send && chunks.length) sendRef.current(new Blob(chunks, { type }), Math.min(ms / 1000, maxSeconds), type); };
    if (recorder.state !== "inactive") recorder.stop();
    reset();
  };

  const start = async (e) => {
    if (busy || rec.current.pressed || mode !== "idle") return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const s = { pressed: true, x0: e.clientX, y0: e.clientY };
    rec.current = s;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { rec.current = {}; toast.error(t("Allow the microphone to record voice messages")); return; }
    if (rec.current !== s || !s.pressed) {  // let go while the phone was asking for the microphone
      stream.getTracks().forEach((tr) => tr.stop());
      if (rec.current === s) rec.current = {};
      toast(t("Hold to record, release to send"));
      return;
    }
    const mime = pickMime();
    let recorder;
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch { stream.getTracks().forEach((tr) => tr.stop()); rec.current = {}; toast.error(t("This device cannot record voice messages")); return; }
    const chunks = [];
    recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    recorder.start(250);
    Object.assign(s, { stream, recorder, chunks, mime, start: Date.now() });
    try {  // the moving bars follow the voice
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      Object.assign(s, { audioCtx: ctx, analyser, buf: new Uint8Array(analyser.fftSize) });
    } catch { /* bars stay still */ }
    s.tick = setInterval(() => {
      const secs = (Date.now() - s.start) / 1000;
      setElapsed(secs);
      if (s.analyser) {
        s.analyser.getByteTimeDomainData(s.buf);
        let sum = 0;
        for (const v of s.buf) sum += (v - 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / s.buf.length) / 30);
        setLevels((l) => [...l.slice(-(BARS - 1)), level]);
      }
      if (secs >= maxSeconds) finish(true);  // 2 minutes: it leaves by itself
    }, 100);
    navigator.vibrate?.(15);
    setMode("recording");
  };

  const move = (e) => {
    const s = rec.current;
    if (!s.pressed || mode === "locked") return;
    const dx = (e.clientX - s.x0) * (rtl ? -1 : 1), dy = s.y0 - e.clientY;
    setDrag({ x: Math.min(0, dx), y: Math.max(0, dy) });
    if (!s.recorder) return;
    if (dx < -CANCEL_PX) { s.pressed = false; navigator.vibrate?.(10); finish(false); }
    else if (dy > LOCK_PX) { s.pressed = false; setDrag({ x: 0, y: 0 }); setMode("locked"); navigator.vibrate?.(10); }
  };
  const up = () => {
    const s = rec.current;
    if (!s.pressed) return;
    s.pressed = false;
    if (s.recorder && mode !== "locked") finish(true);
  };
  const cancelPointer = () => {
    const s = rec.current;
    if (!s.pressed) return;
    s.pressed = false;
    if (s.recorder && mode !== "locked") finish(false);
  };

  const active = mode !== "idle";
  const bars = [...Array(Math.max(0, BARS - levels.length)).fill(0), ...levels];
  return (
    <>
      {active && (
        <div data-testid="voice-recording" className="absolute inset-y-0 start-0 end-[56px] z-10 bg-card flex items-center gap-3 ps-4 pe-2">
          {mode === "locked" && (
            <button data-testid="voice-cancel" aria-label={t("Delete")} onClick={() => finish(false)}
              className="w-10 h-10 -ms-2 rounded-full flex items-center justify-center text-destructive hover:bg-muted shrink-0"><Trash2 className="w-5 h-5" /></button>
          )}
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
          <span data-testid="voice-timer" className="tabular-nums text-[15px] font-medium shrink-0">{clock(elapsed)}</span>
          {mode === "locked" ? (
            <div className="flex-1 flex items-center justify-end gap-[2px] h-8 overflow-hidden" aria-hidden="true">
              {bars.map((l, i) => <span key={i} className="w-[3px] rounded-full bg-primary/70" style={{ height: `${Math.max(3, l * 28)}px` }} />)}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground select-none overflow-hidden whitespace-nowrap"
              style={{ transform: `translateX(${drag.x * (rtl ? -1 : 1)}px)`, opacity: 1 - Math.min(0.8, -drag.x / CANCEL_PX) }}>
              <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" /> {t("Slide to cancel")}
            </div>
          )}
        </div>
      )}
      {mode === "recording" && (
        <div aria-hidden="true" className="absolute bottom-full end-2.5 mb-2 w-10 py-2.5 rounded-full bg-card border border-border shadow-lg flex flex-col items-center gap-1 text-muted-foreground"
          style={{ transform: `translateY(${-Math.min(drag.y, LOCK_PX)}px)` }}>
          <Lock className="w-4 h-4" /><ChevronUp className="w-4 h-4 animate-bounce" />
        </div>
      )}
      {mode === "locked" ? (
        <button data-testid="voice-send" aria-label={t("Send")} onClick={() => finish(true)}
          className="w-10 h-10 mb-0.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 active:scale-95 transition">
          <ArrowUp className="w-5 h-5" strokeWidth={2.6} />
        </button>
      ) : (
        <button data-testid="voice-record-button" aria-label={t("Hold to record a voice message")} disabled={busy}
          onPointerDown={start} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelPointer}
          onContextMenu={(e) => e.preventDefault()}
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
          className={`relative z-20 w-10 h-10 mb-0.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 select-none transition ${mode === "recording" ? "scale-[1.35]" : "active:scale-95"}`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
        </button>
      )}
    </>
  );
}
