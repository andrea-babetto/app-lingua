// A small looping demo for the sign-in page: someone types in their language, the mark pulses while it is translated, and the other person reads it in theirs.
// The example sentences are samples, not interface text (they are not translated); only the language names follow the interface language.
import { useEffect, useState } from "react";
import { LogoArrows } from "@/components/Logo";
import { useI18n } from "@/i18n";
import { isRTL, langByCode } from "@/data/languages";

const PAIRS = [
  { from: "it", text: "Ci vediamo domani alle nove?", to: "hi", out: "कल सुबह नौ बजे मिलते हैं?" },
  { from: "en", text: "Did you get home safe?", to: "ja", out: "無事に家に着いた？" },
  { from: "es", text: "¡Feliz cumpleaños!", to: "ar", out: "عيد ميلاد سعيد!" },
  { from: "pt", text: "Já estou a chegar.", to: "de", out: "Ich bin gleich da." },
];
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Chip({ code }) {
  const { langName } = useI18n();
  return <div className="text-xs font-semibold text-muted-foreground mb-1.5">{langByCode(code).flag} {langName(code)}</div>;
}

export default function LoginDemo({ always = false }) {
  const { t, langName } = useI18n();
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState(0); // 0 typing, 1 translating, 2 translated
  const pair = PAIRS[i];
  const still = reduced();

  useEffect(() => {
    if (still) return undefined;
    let timer;
    const chars = [...pair.text];
    const step = (n) => {
      if (n <= chars.length) { setTyped(n); timer = setTimeout(() => step(n + 1), 45); return; }
      setPhase(1);
      timer = setTimeout(() => {
        setPhase(2);
        timer = setTimeout(() => { setPhase(0); setTyped(0); setI((v) => (v + 1) % PAIRS.length); }, 2800);
      }, 1000);
    };
    setPhase(0); setTyped(0);
    timer = setTimeout(() => step(1), 500);
    return () => clearTimeout(timer);
  }, [i, still]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = still ? pair.text : [...pair.text].slice(0, typed).join("");
  const done = still || phase === 2;
  return (
    <div data-testid="login-demo" aria-hidden="true" className={`mt-6 rounded-3xl bg-surface p-4 select-none ${always ? "" : "[@media(max-height:760px)]:hidden"}`}>
      <div className="min-h-[68px]">
        <Chip code={pair.from} />
        <div dir={isRTL(pair.from) ? "rtl" : "ltr"} className="ms-auto w-fit max-w-[88%] rounded-[18px] rounded-ee-[6px] bg-primary text-primary-foreground px-3.5 py-2 text-[15px] leading-snug min-h-[38px]">
          {shown}{!done && phase === 0 && <span className="inline-block w-px h-4 align-middle bg-current ms-0.5 gl-pulse" />}
        </div>
      </div>
      <div className="flex justify-center my-2.5">
        <LogoArrows className={`w-6 h-6 transition-opacity duration-300 ${phase === 1 ? "opacity-100" : "opacity-40"}`} animate={!still && phase === 1} />
      </div>
      <div className="min-h-[86px]">
        <Chip code={pair.to} />
        {done && (
          <div key={i} className="gl-msg-in">
            <div dir={isRTL(pair.to) ? "rtl" : "ltr"} className="w-fit max-w-[88%] rounded-[18px] rounded-es-[6px] bg-card border border-border px-3.5 py-2 text-[16px] leading-snug">{pair.out}</div>
            <div className="mt-1.5 w-fit text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full bg-label text-label-foreground">
              {t("Translated from {language}", { language: langName(pair.from) })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
