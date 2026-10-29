import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { LANGUAGES } from "@/data/languages";
import { useI18n } from "@/i18n";

// A searchable list of the languages: native name, the name in the interface language, and a radio.
// fill: the list takes the remaining height of a flex column (onboarding); otherwise it scrolls at a fixed height.
export default function LanguagePicker({ value, onChange, testId = "language", fill = false }) {
  const { t, langName } = useI18n();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LANGUAGES;
    return LANGUAGES.filter((l) => l.name.toLowerCase().includes(s) || l.native.toLowerCase().includes(s)
      || langName(l.code).toLowerCase().includes(s) || l.code.includes(s));
  }, [q, langName]);

  return (
    <div data-testid={`${testId}-onboarding-modal`} className={`space-y-3 ${fill ? "flex-1 min-h-0 flex flex-col" : ""}`}>
      <div className="relative shrink-0">
        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
        <input data-testid="language-search-input" className="w-full h-[46px] ps-10 pe-3 rounded-full bg-surface text-[15px] placeholder:text-subtle outline-none focus:ring-2 focus:ring-primary/25"
          placeholder={t("Search 40+ languages...")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div role="radiogroup" className={`overflow-y-auto chat-scroll space-y-0.5 pe-1 ${fill ? "flex-1 min-h-0" : "max-h-72"}`}>
        {filtered.map((l) => {
          const on = value === l.code;
          return (
            <button key={l.code} role="radio" aria-checked={on} data-testid={`language-option-${l.code}`} onClick={() => onChange(l.code)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors ${on ? "bg-accent" : "hover:bg-muted"}`}>
              {/* the flag in a circle, cut from the middle of the emoji flag */}
              <span aria-hidden="true" className="w-[34px] h-[34px] shrink-0 rounded-full overflow-hidden bg-surface shadow-[0_0_0_1px_var(--gl-border)] flex items-center justify-center text-[44px] leading-none">{l.flag}</span>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold truncate">{l.native}</div>
                <div className="text-xs text-subtle truncate">{langName(l.code)}</div>
              </div>
              {on ? <span className="w-[26px] h-[26px] rounded-full shrink-0 bg-sand text-[var(--gl-on-accent)] flex items-center justify-center"><Check className="w-4 h-4" strokeWidth={2.6} /></span>
                : <span className="w-[26px] h-[26px] rounded-full shrink-0 border-2 border-border" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
