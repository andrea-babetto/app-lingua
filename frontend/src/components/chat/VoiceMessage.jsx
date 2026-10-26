// A voice message in the chat. For someone who speaks another language, play reads the translation aloud
// (one neutral synthetic voice, made the first time someone listens); "Write it" shows the text, "Original voice" plays the real recording.
import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, AlertCircle, Mic, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useI18n } from "@/i18n";
import { clock } from "@/components/chat/VoiceRecorder";

// A silent sound played straight from the tap: iPhone then lets the spoken translation play when it arrives a moment later.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const fileUrl = (u) => (u && u.startsWith("/api/") ? API + u.slice(4) : u);

export default function VoiceMessage({ msg, mine, text, rtl }) {
  const { t } = useI18n();
  const cfg = useConfig();
  const att = msg.attachment;
  const expired = !!att.expired;
  const spoken = !mine && msg.is_translated && !!cfg.voice_speech && !expired;  // play = the translation, read aloud
  const primary = spoken ? "speech" : "original";
  const [playing, setPlaying] = useState(null);  // "speech" | "original" | null
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(att.duration || 0);
  const [showText, setShowText] = useState(false);
  const audio = useRef(null);
  const speechUrl = useRef(null);
  if (msg.speech_url && !speechUrl.current) speechUrl.current = fileUrl(msg.speech_url);

  useEffect(() => {  // one voice at a time
    const other = (e) => { if (e.detail !== msg.id && audio.current && !audio.current.paused) { audio.current.pause(); setPlaying(null); } };
    window.addEventListener("glott:voice-play", other);
    return () => { window.removeEventListener("glott:voice-play", other); audio.current?.pause(); };
  }, [msg.id]);

  const player = () => {
    if (!audio.current) {
      const a = new Audio();
      a.ontimeupdate = () => setPos(a.currentTime);
      a.onloadedmetadata = () => { if (Number.isFinite(a.duration) && a.duration > 0 && !a.src.startsWith("data:")) setLen(a.duration); };
      a.onended = () => { if (!a.src.startsWith("data:")) { setPlaying(null); setPos(0); } };
      audio.current = a;
    }
    return audio.current;
  };

  const play = async (kind, e) => {
    e?.stopPropagation();
    const a = player();
    if (playing === kind) { a.pause(); setPlaying(null); return; }
    window.dispatchEvent(new CustomEvent("glott:voice-play", { detail: msg.id }));
    a.pause();
    setPos(0);
    setLen(att.duration || 0);
    if (kind === "original") a.src = fileUrl(att.url);
    else if (speechUrl.current) a.src = speechUrl.current;
    else {
      a.src = SILENCE;
      a.play().catch(() => {});
      setLoading(true);
      try {
        const { data } = await api.post(`/messages/${msg.id}/speech`);
        speechUrl.current = fileUrl(data.url);
        a.src = speechUrl.current;
      } catch (err) {
        setLoading(false);
        toast.error(err.response?.status === 410 ? t("Audio no longer available") : t("Could not create the voice. Try again."));
        return;
      }
      setLoading(false);
    }
    setPlaying(kind);
    a.play().catch(() => setPlaying(null));
  };

  const seek = (e) => {
    e.stopPropagation();
    const a = audio.current;
    if (!a || !playing || !len) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    a.currentTime = (rtl ? 1 - ratio : ratio) * len;
  };

  const transcribing = msg.status === "transcribing";
  const failed = msg.status === "transcription_failed";
  // the writer checks what was understood; without a spoken translation the text is the only way to understand it
  const textAlways = mine || expired || (msg.is_translated && !spoken);
  const pct = len ? Math.min(100, (pos / len) * 100) : 0;
  const link = `inline-flex items-center gap-1 text-[12.5px] font-semibold ${mine ? "text-bubble-out-foreground/85" : "text-primary"} hover:underline`;

  return (
    <div data-testid={`voice-${msg.id}`} className="min-w-[14rem] max-w-full" onClick={(e) => e.stopPropagation()}>
      {expired ? (
        <div data-testid={`voice-expired-${msg.id}`} className="flex items-center gap-2 text-sm opacity-75"><Mic className="w-4 h-4" /> {t("Audio no longer available")}</div>
      ) : (
        <div className="flex items-center gap-2.5">
          <button data-testid={`voice-play-${msg.id}`} aria-label={playing === primary ? t("Pause") : t("Play")} onClick={(e) => play(primary, e)}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-95 ${mine ? "bg-white/15" : "bg-primary text-primary-foreground"}`}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : playing === primary
              ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ms-0.5 rtl:-scale-x-100" fill="currentColor" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="py-1.5 cursor-pointer" onClick={seek}>
              <div className="h-1.5 rounded-full bg-current/20 overflow-hidden">
                <div className="h-full bg-current/70 rounded-full" style={{ width: `${pct}%`, marginInlineStart: 0 }} />
              </div>
            </div>
            <div className="flex justify-between gap-2 text-[11px] opacity-75 tabular-nums">
              <span dir="ltr">{clock(playing ? pos : len)}</span>
              {spoken && <span data-testid={`voice-mode-${msg.id}`} className="truncate">{playing === "original" ? t("Original voice") : t("Translated voice")}</span>}
            </div>
          </div>
        </div>
      )}

      {transcribing && (
        <div data-testid={`voice-transcribing-${msg.id}`} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] italic opacity-75">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("Transcribing…")}
        </div>
      )}
      {failed && (
        <div data-testid={`voice-failed-${msg.id}`} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] opacity-80">
          <AlertCircle className="w-3.5 h-3.5" /> {t("Transcription failed")}
        </div>
      )}
      {text && (textAlways || showText) && (
        <p data-testid={`voice-text-${msg.id}`} className="mt-1.5 whitespace-pre-wrap break-words">{text}</p>
      )}
      {!expired && !mine && (text && !textAlways || spoken) && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {text && !textAlways && (
            <button data-testid={`voice-write-${msg.id}`} className={link} onClick={(e) => { e.stopPropagation(); setShowText((v) => !v); }}>
              {showText ? t("Hide text") : t("Write it")}
            </button>
          )}
          {spoken && (
            <button data-testid={`voice-original-${msg.id}`} className={link} onClick={(e) => play("original", e)}>
              <Volume2 className="w-3.5 h-3.5" /> {playing === "original" ? t("Pause") : t("Original voice")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
