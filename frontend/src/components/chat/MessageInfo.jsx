// "Info" on one of my messages: who received it and who read it, with the time.
// Reading is not shown for people who turned off "last seen & online" (and if I turned it off, I see nobody's).
import { CheckCheck, Check, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { avatarClass, initials } from "@/lib/avatar";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n";

// "14:35" today, "ieri 14:35", otherwise "lun 26 ott, 14:35", in the interface language
export function whenShort(iso, lang, t) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString(lang || undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `${t("Yesterday")} ${time}`;
  return d.toLocaleString(lang || undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Person({ p, children }) {
  return (
    <div className="flex items-center gap-3 py-2" data-testid={`info-person-${p.id}`}>
      <Avatar className="w-9 h-9"><AvatarImage src={p.avatar} /><AvatarFallback className={`text-xs font-semibold ${avatarClass(p.name)}`}>{initials(p.name)}</AvatarFallback></Avatar>
      <div className="flex-1 min-w-0"><div className="text-[15px] font-medium truncate">{p.name}</div>{children}</div>
    </div>
  );
}

export default function MessageInfo({ msg, chat, onClose }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  if (!msg) return null;
  const others = (chat.members_info || []).filter((m) => m.id !== user.id);
  const readAt = msg.read_at || {}, delivered = msg.delivered_to || {}, readBy = msg.read_by || [];
  const read = others.filter((p) => readAt[p.id] || readBy.includes(p.id));
  const reached = others.filter((p) => !read.includes(p) && delivered[p.id]);
  const waiting = others.filter((p) => !read.includes(p) && !delivered[p.id]);
  const hidden = user.settings?.last_seen_enabled === false;
  const line = (icon, text, extra = "") => <div className={`text-xs inline-flex items-center gap-1 ${extra}`}>{icon} {text}</div>;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto" data-testid="message-info">
        <DialogHeader><DialogTitle>{t("Message info")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground line-clamp-3 -mt-1">{msg.display_text || msg.original_text}</p>
        {read.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-1">{t("Read by")}</h3>
            {read.map((p) => (
              <Person key={p.id} p={p}>
                {line(<CheckCheck className="w-3.5 h-3.5 text-[#0b7a3e]" />, readAt[p.id] ? t("Read {when}", { when: whenShort(readAt[p.id], lang, t) }) : t("Read"))}
                {delivered[p.id] && line(<CheckCheck className="w-3.5 h-3.5" />, t("Delivered {when}", { when: whenShort(delivered[p.id], lang, t) }), "text-muted-foreground ms-3")}
              </Person>
            ))}
          </section>
        )}
        {reached.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-1">{t("Delivered to")}</h3>
            {reached.map((p) => <Person key={p.id} p={p}>{line(<CheckCheck className="w-3.5 h-3.5" />, t("Delivered {when}", { when: whenShort(delivered[p.id], lang, t) }), "text-muted-foreground")}</Person>)}
          </section>
        )}
        {waiting.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-1">{t("Not delivered yet")}</h3>
            {waiting.map((p) => <Person key={p.id} p={p}>{line(<Check className="w-3.5 h-3.5" />, t("Sent {when}", { when: whenShort(msg.created_at, lang, t) }), "text-muted-foreground")}</Person>)}
          </section>
        )}
        {hidden && <p data-testid="info-hidden-note" className="text-xs text-muted-foreground flex gap-1.5"><Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {t("You turned off last seen, so you don't see when others read your messages.")}</p>}
      </DialogContent>
    </Dialog>
  );
}
