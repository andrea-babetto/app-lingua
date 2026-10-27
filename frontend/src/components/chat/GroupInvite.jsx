// For the group's admins: the link to invite people (who opens it asks to join) and the people waiting to be let in.
import { useState } from "react";
import { toast } from "sonner";
import { Link2, Share2, RefreshCw, Ban, Check, X } from "lucide-react";
import { api, errText } from "@/lib/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { avatarClass } from "@/lib/avatar";
import { inviteUrl, shareLink } from "@/lib/invite";
import { useI18n } from "@/i18n";

const small = "h-9 px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 border border-border hover:bg-muted disabled:opacity-50";

export default function GroupInvite({ chat, onChanged }) {
  const { t, langName } = useI18n();
  const [busy, setBusy] = useState(false);
  const code = chat.invite_code;
  const requests = chat.join_requests || [];

  const call = async (fn, done) => {
    setBusy(true);
    try { await fn(); if (done) toast.success(done); onChanged?.(); }
    catch (e) { toast.error(errText(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };
  const share = async (c) => shareLink(inviteUrl(c), t("Join the group {name} on Glotter: everyone writes and reads in their own language.", { name: chat.display_name }), t);
  const create = () => call(async () => { const { data } = await api.post(`/chats/${chat.id}/invite-link`); await share(data.code); });
  const renew = () => call(() => api.post(`/chats/${chat.id}/invite-link?reset=true`), t("New link ready: the old one no longer works"));
  const off = () => call(() => api.delete(`/chats/${chat.id}/invite-link`), t("Invite link turned off"));
  const answer = (p, decision) => call(() => api.post(`/chats/${chat.id}/requests/${p.id}/${decision}`),
    decision === "approve" ? t("{name} added", { name: p.name }) : null);

  return (
    <div className="space-y-3" data-testid="group-invite">
      {requests.length > 0 && (
        <div className="rounded-2xl bg-label text-label-foreground px-3 py-3 space-y-2" data-testid="join-requests">
          <div className="text-xs font-semibold uppercase tracking-wide">{t("Asking to join")} · {requests.length}</div>
          {requests.map((p) => (
            <div key={p.id} className="flex items-center gap-2" data-testid={`join-request-${p.id}`}>
              <Avatar className="w-9 h-9"><AvatarImage src={p.avatar} /><AvatarFallback className={`text-[11px] font-semibold ${avatarClass(p.name)}`}>{(p.name || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className="text-xs opacity-80 truncate">{langName(p.language)}</div>
              </div>
              <button data-testid={`join-decline-${p.id}`} aria-label={t("Decline")} disabled={busy} onClick={() => answer(p, "decline")}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/5 disabled:opacity-50"><X className="w-4 h-4" /></button>
              <button data-testid={`join-approve-${p.id}`} disabled={busy} onClick={() => answer(p, "approve")}
                className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"><Check className="w-4 h-4" /> {t("Accept")}</button>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-surface border border-border px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> {t("Invite link")}</div>
        {code ? (
          <>
            <p data-testid="group-invite-url" className="mt-1.5 text-sm break-all">{inviteUrl(code)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("Whoever opens it asks to join: an admin lets them in.")}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button data-testid="group-invite-share" className={small} disabled={busy} onClick={() => share(code)}><Share2 className="w-4 h-4" /> {t("Share")}</button>
              <button data-testid="group-invite-renew" className={small} disabled={busy} onClick={renew}><RefreshCw className="w-4 h-4" /> {t("New link")}</button>
              <button data-testid="group-invite-off" className={`${small} text-destructive`} disabled={busy} onClick={off}><Ban className="w-4 h-4" /> {t("Turn off")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">{t("Create a link to invite people: they ask to join and an admin lets them in.")}</p>
            <button data-testid="group-invite-create" className={`${small} mt-2.5`} disabled={busy} onClick={create}><Link2 className="w-4 h-4" /> {t("Create invite link")}</button>
          </>
        )}
      </div>
    </div>
  );
}
