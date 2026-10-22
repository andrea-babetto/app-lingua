import { useState, useMemo } from "react";
import { Search } from "lucide-react";
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
        <input data-testid="language-search-input" className="w-full h-[42px] ps-10 pe-3 rounded-xl bg-surface text-[15px] placeholder:text-subtle outline-none focus:ring-2 focus:ring-primary/25"
          placeholder={t("Search 40+ languages...")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div role="radiogroup" className={`overflow-y-auto chat-scroll space-y-0.5 pe-1 ${fill ? "flex-1 min-h-0" : "max-h-72"}`}>
        {filtered.map((l) => {
          const on = value === l.code;
          return (
            <button key={l.code} role="radio" aria-checked={on} data-testid={`language-option-${l.code}`} onClick={() => onChange(l.code)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start transition-colors ${on ? "bg-accent" : "hover:bg-muted"}`}>
              <span className="text-xl">{l.flag}</span>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold truncate">{l.native}</div>
                <div className="text-xs text-subtle truncate">{langName(l.code)}</div>
              </div>
              <span className={`w-[22px] h-[22px] rounded-full shrink-0 ${on ? "border-[7px] border-primary" : "border-2 border-border"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
