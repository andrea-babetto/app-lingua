// "See how it works": a small chat that plays by itself (the other person's messages arrive already in your language,
// then they start typing). It stands in for the 30-second video until there is one.
import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { avatarClass, initials } from "@/lib/avatar";
import { useI18n } from "@/i18n";

const STEP_MS = 1500;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The three yellow dots of the logo, lighting up one after the other.
export function TypingDots({ size = "w-2 h-2" }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      <span className={`typing-dot ${size} rounded-full bg-sand`} />
      <span className={`typing-dot ${size} rounded-full bg-sand`} />
      <span className={`typing-dot ${size} rounded-full bg-sand`} />
    </span>
  );
}

function Demo() {
  const { t, lang, langName } = useI18n();
  // the other person writes in a language that is not the reader's
  const other = lang === "en" ? { name: "María", lang: "es" } : { name: "James", lang: "en" };
  const script = [
    { mine: false, text: t("Hi! I just arrived in Milan.") },
    { mine: true, text: t("Welcome! See you tonight?") },
    { mine: false, text: t("Sure! What time?") },
    { mine: true, text: t("At eight in front of the Duomo.") },
  ];
  const [shown, setShown] = useState(() => (reducedMotion() ? script.length + 1 : 0));
  useEffect(() => {
    if (reducedMotion()) return undefined;
    // one message at a time, then the typing dots, then a pause and again from the start
    const id = setTimeout(() => setShown((n) => (n > script.length + 1 ? 0 : n + 1)), shown > script.length ? STEP_MS * 2 : STEP_MS);
    return () => clearTimeout(id);
  }, [shown, script.length]);

  return (
    <div className="rounded-[28px] border border-border overflow-hidden bg-card" data-testid="how-it-works-demo">
      <div className="flex flex-col items-center gap-1 py-3 border-b border-[var(--gl-line)]">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold ${avatarClass(other.name)}`}>{initials(other.name)}</span>
        <span className="text-[13px] font-medium">{other.name}</span>
      </div>
      <div className="chat-wallpaper h-[19rem] px-3.5 py-3 flex flex-col gap-2">
        {script.slice(0, Math.min(shown, script.length)).map((m, i) => (
          <div key={i} className={`gl-msg-in flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            <span className={`max-w-[80%] px-3 py-2 text-[14px] leading-snug ${m.mine
              ? "bg-bubble-out text-bubble-out-foreground rounded-[16px] rounded-ee-[5px]"
              : "bg-bubble-in border border-border rounded-[16px] rounded-es-[5px]"}`}>{m.text}</span>
            {!m.mine && <span className="mt-0.5 ps-1 text-[10.5px] text-subtle">{t("Translated from {language}", { language: langName(other.lang) })}</span>}
          </div>
        ))}
        {shown > script.length && (
          <div className="gl-msg-in flex flex-col items-start">
            <span className="h-8 px-3 flex items-center rounded-[16px] rounded-es-[5px] bg-bubble-in border border-border"><TypingDots size="w-1.5 h-1.5" /></span>
            <span className="mt-0.5 ps-1 text-[10.5px] text-subtle">{t("typing in {language}", { language: langName(other.lang) })}…</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function HowItWorksDialog({ open, onOpenChange }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="how-it-works" className="max-w-sm rounded-[28px] p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-xl font-medium text-center">{t("See how it works")}</DialogTitle>
          <DialogDescription className="text-center text-[14px] leading-relaxed">
            {t("You write in your language and the others read in theirs: Glotter translates every message for each person.")}
          </DialogDescription>
        </DialogHeader>
        {open && <Demo />}
      </DialogContent>
    </Dialog>
  );
}

// The small grey link with a play sign; it opens the demo.
export default function HowItWorksLink({ className = "" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" data-testid="how-it-works-link" onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors ${className}`}>
        <PlayCircle className="w-4 h-4" aria-hidden="true" /> {t("See how it works")}
      </button>
      <HowItWorksDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
