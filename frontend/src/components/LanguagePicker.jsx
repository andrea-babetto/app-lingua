import { useState, useMemo } from "react";
import { Search, Check } from "lucide-react";
import { LANGUAGES } from "@/data/languages";
import { Input } from "@/components/ui/input";

export default function LanguagePicker({ value, onChange, testId = "language" }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LANGUAGES;
    return LANGUAGES.filter((l) => l.name.toLowerCase().includes(s) || l.native.toLowerCase().includes(s) || l.code.includes(s));
  }, [q]);

  return (
    <div data-testid={`${testId}-onboarding-modal`} className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input data-testid="language-search-input" className="pl-9" placeholder="Search 40+ languages..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-72 overflow-y-auto chat-scroll space-y-1 pr-1">
        {filtered.map((l) => (
          <button
            key={l.code}
            data-testid={`language-option-${l.code}`}
            onClick={() => onChange(l.code)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
              value === l.code ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            }`}
          >
            <span className="text-xl">{l.flag}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{l.name}</div>
              <div className="text-xs text-muted-foreground truncate">{l.native}</div>
            </div>
            {value === l.code && <Check className="w-4 h-4 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
