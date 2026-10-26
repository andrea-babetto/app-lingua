// Polls in groups: the dialog to create one, and the card inside the message where people vote.
// The question and the answers arrive translated into each person's language.
import { useEffect, useState } from "react";
import { BarChart3, Plus, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";

const MAX_OPTIONS = 10;

export function PollDialog({ open, onClose, onCreate }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQuestion(""); setOptions(["", ""]); setMultiple(false); } }, [open]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const unique = new Set(filled.map((o) => o.toLowerCase())).size === filled.length;  // the server refuses two equal answers
  const ready = question.trim() && filled.length >= 2 && unique;
  const setOption = (i, v) => setOptions((list) => list.map((o, j) => (j === i ? v : o)));
  const create = async () => {
    setBusy(true);
    try { await onCreate({ question: question.trim(), options: filled, multiple }); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto" data-testid="poll-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> {t("New poll")}</DialogTitle></DialogHeader>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">{t("Question")}</span>
          <Input data-testid="poll-question" className="mt-1" maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("Ask something…")} />
        </label>
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">{t("Answers")}</span>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input data-testid={`poll-option-${i}`} maxLength={100} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={t("Answer {count}", { count: i + 1 })} />
              {options.length > 2 && (
                <button type="button" aria-label={t("Remove")} onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                  className="w-9 h-9 shrink-0 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"><X className="w-4 h-4" /></button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" data-testid="poll-add-option" onClick={() => setOptions((list) => [...list, ""])}
              className="text-sm font-semibold text-primary inline-flex items-center gap-1"><Plus className="w-4 h-4" /> {t("Add an answer")}</button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">{t("Allow more than one answer")}</span>
          <Switch data-testid="poll-multiple" checked={multiple} onCheckedChange={setMultiple} />
        </div>
        <Button data-testid="poll-create" disabled={!ready || busy} onClick={create} className="w-full h-11 rounded-xl">{t("Create poll")}</Button>
      </DialogContent>
    </Dialog>
  );
}

// The card inside a poll message. Tapping an answer votes (tap again to take it back).
export function PollCard({ msg, question, mine, onVote }) {
  const { t } = useI18n();
  const poll = msg.poll;
  const total = poll.options.reduce((n, o) => n + o.count, 0);
  const chosen = poll.options.filter((o) => o.mine).map((o) => o.id);
  const tap = (e, id) => {
    e.stopPropagation();
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : (poll.multiple ? [...chosen, id] : [id]);
    onVote?.(msg, next);
  };
  return (
    <div data-testid={`poll-${msg.id}`} className="min-w-[14rem]">
      <div className="flex items-start gap-2 mb-1">
        <BarChart3 className="w-4 h-4 mt-1 shrink-0 opacity-70" aria-hidden="true" />
        <p className="font-semibold break-words">{question}</p>
      </div>
      <p className="text-xs opacity-70 mb-2">{poll.multiple ? t("Choose one or more answers") : t("Choose one answer")}</p>
      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const pct = total ? Math.round((o.count / total) * 100) : 0;
          return (
            <button key={o.id} type="button" data-testid={`poll-vote-${o.id}`} onClick={(e) => tap(e, o.id)} aria-pressed={o.mine}
              className="w-full text-start relative overflow-hidden rounded-xl px-3 py-2 border border-current/15">
              <span aria-hidden="true" className={`absolute inset-y-0 start-0 transition-all duration-500 ${mine ? "bg-white/15" : "bg-primary/12"}`} style={{ width: `${pct}%` }} />
              <span className="relative flex items-center gap-2">
                <span className={`w-[18px] h-[18px] shrink-0 border-2 flex items-center justify-center ${poll.multiple ? "rounded-[5px]" : "rounded-full"} ${o.mine ? "bg-current border-current" : "border-current/50"}`}>
                  {o.mine && <Check className={`w-3 h-3 ${mine ? "text-bubble-out" : "text-bubble-in"}`} strokeWidth={3.5} />}
                </span>
                <span className="flex-1 min-w-0 break-words text-[14px]">{o.text}</span>
                <span className="text-xs font-semibold tabular-nums opacity-80">{o.count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] opacity-70 mt-1.5">{poll.voters === 1 ? t("1 person voted") : t("{count} people voted", { count: poll.voters })}</p>
    </div>
  );
}
