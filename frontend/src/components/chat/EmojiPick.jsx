import { useI18n } from "@/i18n";

const CHOICES = ["💼", "👥", "🍕", "✈️", "🏠", "⚽", "🎵", "📚", "💡", "🎉", "🌍", "❤️"];

// A row of emojis to pick the group's picture; tapping the chosen one again removes it.
export default function EmojiPick({ value, onChange }) {
  const { t } = useI18n();
  return (
    <div data-testid="emoji-pick" role="radiogroup" aria-label={t("Group picture")} className="flex flex-wrap gap-1.5">
      {CHOICES.map((e) => (
        <button key={e} type="button" role="radio" aria-checked={value === e} data-testid={`emoji-choice-${e}`} onClick={() => onChange(value === e ? "" : e)}
          className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-colors ${value === e ? "bg-accent ring-2 ring-primary" : "bg-surface hover:bg-muted"}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
