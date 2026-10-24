// Scheduled messages: the dialog to choose when a message leaves, and the waiting messages at the bottom of the chat
// (only the writer sees them until they are sent).
import { useEffect, useState } from "react";
import { Clock, Send, Trash2, CalendarClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { offsetFromHere } from "@/lib/localTime";

const at = (days, hour) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "sab 25 ott, 09:00" in the interface language
export function whenLabel(date, lang) {
  try { return new Intl.DateTimeFormat(lang || undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
  catch { return date.toLocaleString(); }
}

// Their clock at a given moment: "12:30" (only when it differs from mine)
function theirTime(date, tz, lang) {
  if (!tz || !offsetFromHere(tz)) return "";
  try { return new Intl.DateTimeFormat(lang || undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(date); }
  catch { return ""; }
}

export function ScheduleDialog({ open, onClose, onPick, other, initial }) {
  const { t, lang } = useI18n();
  const [when, setWhen] = useState(null);
  useEffect(() => { if (open) setWhen(initial ? new Date(initial) : null); }, [open, initial]);
  const now = new Date();
  const inOneHour = new Date(Math.ceil((now.getTime() + 3600000) / 60000) * 60000);
  const quick = [
    { id: "hour", label: t("In 1 hour"), date: inOneHour },
    ...(now.getHours() < 19 ? [{ id: "tonight", label: t("Tonight at {time}", { time: "20:00" }), date: at(0, 20) }] : []),
    { id: "tomorrow", label: t("Tomorrow at {time}", { time: "09:00" }), date: at(1, 9) },
  ];
  const theirs = when && other ? theirTime(when, other.timezone, lang) : "";
  const maxDate = new Date(now.getTime() + 29 * 86400000);
  const valid = when && when.getTime() > Date.now() + 60000 && when <= maxDate;  // the server accepts up to 30 days ahead
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="schedule-dialog">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5" /> {t("Schedule message")}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {quick.map((q) => (
            <button key={q.id} type="button" data-testid={`schedule-${q.id}`} onClick={() => setWhen(q.date)}
              className={`w-full text-start px-4 py-3 rounded-xl border transition-colors ${when?.getTime() === q.date.getTime() ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <div className="text-[15px] font-medium">{q.label}</div>
              <div className="text-xs text-muted-foreground">{whenLabel(q.date, lang)}</div>
            </button>
          ))}
          <label className="block pt-1">
            <span className="text-xs font-medium text-muted-foreground">{t("Other date and time")}</span>
            <input type="datetime-local" data-testid="schedule-custom" min={toLocalInput(now)} max={toLocalInput(maxDate)} value={when ? toLocalInput(when) : ""}
              onChange={(e) => setWhen(e.target.value ? new Date(e.target.value) : null)}
              className="mt-1 w-full h-11 rounded-xl border border-border bg-background px-3 text-[15px]" />
          </label>
        </div>
        {theirs && <p data-testid="schedule-their-time" className="text-sm text-muted-foreground">{t("For {name} it will be {time}", { name: other.name, time: theirs })}</p>}
        <Button data-testid="schedule-confirm" disabled={!valid} onClick={() => onPick(when)} className="w-full h-11 rounded-xl">
          <Clock className="w-4 h-4 me-2" /> {t("Schedule")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// The waiting messages, faded, at the bottom of the conversation
export function ScheduledList({ items, onOpen }) {
  const { t, lang } = useI18n();
  if (!items.length) return null;
  return (
    <div className="px-3 mt-2 space-y-1.5" data-testid="scheduled-list">
      {items.map((s) => (
        <div key={s.id} className="flex justify-end">
          <button type="button" data-testid={`scheduled-${s.id}`} onClick={() => onOpen(s)}
            className="max-w-[82%] sm:max-w-[68%] text-start px-3.5 py-2 rounded-[18px] rounded-ee-[6px] border border-dashed border-primary/50 bg-card/80 text-foreground/80">
            <p className="text-[15px] leading-[1.45] whitespace-pre-wrap break-words">{s.text}</p>
            <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" /> {t("Will be sent {when}", { when: whenLabel(new Date(s.send_at), lang) })}
            </div>
          </button>
        </div>
      ))}
    </div>
  );
}

// What you can do with a waiting message
export function ScheduledActions({ item, onClose, onSendNow, onChangeTime, onDelete }) {
  const { t, lang } = useI18n();
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="scheduled-actions">
        <DialogHeader><DialogTitle>{t("Scheduled message")}</DialogTitle></DialogHeader>
        {item && <p className="text-sm text-muted-foreground -mt-2">{t("Will be sent {when}", { when: whenLabel(new Date(item.send_at), lang) })}</p>}
        <div className="grid gap-2">
          <Button data-testid="scheduled-send-now" onClick={() => onSendNow(item)}><Send className="w-4 h-4 me-2" /> {t("Send now")}</Button>
          <Button data-testid="scheduled-change" variant="outline" onClick={() => onChangeTime(item)}><CalendarClock className="w-4 h-4 me-2" /> {t("Change time")}</Button>
          <Button data-testid="scheduled-delete" variant="outline" className="text-destructive" onClick={() => onDelete(item)}><Trash2 className="w-4 h-4 me-2" /> {t("Delete")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

