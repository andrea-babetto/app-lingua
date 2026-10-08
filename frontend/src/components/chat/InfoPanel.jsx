import { useState } from "react";
import { toast } from "sonner";
import { X, LogOut, UserPlus, Crown, Search, Loader2, Shield, Ban, Flag, Pencil, Camera, Check, Trash2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n";

export default function InfoPanel({ chat, onClose, onChanged, onLeft, onBlocked, onDelete }) {
  const { user, reload } = useAuth();
  const { t, langName } = useI18n();
  const isGroup = chat.type === "group";
  const meAdmin = (chat.admins || []).includes(user.id);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [gName, setGName] = useState(chat.display_name);
  const [gDesc, setGDesc] = useState(chat.description || "");
  const [gAvatar, setGAvatar] = useState(chat.display_avatar || "");
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");

  const other = chat.other_user;
  const blocked = (user.blocked || []).includes(other?.id);
  const members = chat.members_info || [];

  const search = async (val) => {
    setQ(val);
    if (!val.trim()) return setResults([]);
    setLoading(true);
    try {
      const { data } = await api.get("/users/search", { params: { q: val } });
      setResults(data.filter((u) => !chat.members.includes(u.id)));
    } finally { setLoading(false); }
  };

  const addMember = async (u) => {
    try {
      await api.post(`/chats/${chat.id}/members`, { member_ids: [u.id] });
      toast.success(t("{name} added", { name: u.name }));
      setAdding(false); setQ(""); setResults([]);
      onChanged();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const promote = async (uid) => { await api.put(`/chats/${chat.id}/admin/${uid}`); toast.success(t("Promoted to admin")); onChanged(); };
  const leave = async () => { await api.post(`/chats/${chat.id}/leave`); toast.success(t("You left the group")); onLeft(); };

  const uploadGroupAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setGAvatar(`${api.defaults.baseURL}/files/${data.id}`);
      toast.success(t("Photo ready — save to apply"));
    } catch { toast.error(t("Upload failed")); }
    finally { e.target.value = ""; }
  };

  const saveGroup = async () => {
    try {
      await api.put(`/chats/${chat.id}/info`, { name: gName, description: gDesc, avatar: gAvatar });
      toast.success(t("Group updated"));
      setEditing(false);
      onChanged();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const block = async () => {
    if (blocked) { await api.post(`/users/${other.id}/unblock`); toast.success(t("Unblocked")); await reload(); }
    else { await api.post(`/users/${other.id}/block`); toast.success(t("{name} blocked", { name: other.name })); await reload(); onBlocked(); }
  };

  const submitReport = async () => {
    await api.post(`/users/${other.id}/report`, { reason });
    toast.success(t("Report submitted. Thank you."));
    setReportOpen(false); setReason("");
  };

  return (
    <div className="fixed inset-0 z-30 md:static md:z-auto md:w-80 lg:w-80 shrink-0 bg-card md:border-s border-border flex flex-col" data-testid="info-panel">
      <div className="h-16 px-4 flex items-center justify-between border-b border-border">
        <span className="text-base font-semibold">{isGroup ? t("Group info") : t("Contact info")}</span>
        <div className="flex items-center gap-1">
          {isGroup && meAdmin && !editing && (
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} data-testid="edit-group-button"><Pencil className="w-4 h-4" /></Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="info-panel-close"><X className="w-5 h-5" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-5 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="relative">
            <Avatar className="w-24 h-24"><AvatarImage src={editing ? gAvatar : chat.display_avatar} /><AvatarFallback className="text-2xl">{chat.display_name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
            {isGroup && editing && (
              <label className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer" data-testid="group-avatar-upload">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" hidden onChange={uploadGroupAvatar} />
              </label>
            )}
          </div>
          {editing ? (
            <div className="w-full space-y-2 mt-2">
              <Input data-testid="edit-group-name" value={gName} onChange={(e) => setGName(e.target.value)} placeholder={t("Group name")} />
              <Textarea data-testid="edit-group-desc" value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder={t("Group description")} rows={2} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setEditing(false); setGName(chat.display_name); setGDesc(chat.description || ""); setGAvatar(chat.display_avatar || ""); }}>{t("Cancel")}</Button>
                <Button className="flex-1" onClick={saveGroup} data-testid="save-group-button"><Check className="w-4 h-4 me-1" /> {t("Save")}</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xl font-bold">{chat.display_name}</div>
              {!isGroup && other && <div className="text-sm text-muted-foreground">@{other.username} · {langByCode(other.language).flag} {t("reads & writes in {language}", { language: langName(other.language) })}</div>}
              {isGroup && <div className="text-sm text-muted-foreground">{t("{count} members", { count: members.length })}</div>}
              {isGroup && chat.description && <p className="text-sm text-muted-foreground mt-1">{chat.description}</p>}
            </>
          )}
        </div>

        {isGroup && !editing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Members")}</span>
              {meAdmin && members.length < 50 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAdding((v) => !v)} data-testid="group-add-member-toggle">
                  <UserPlus className="w-3.5 h-3.5" /> {t("Add")}
                </Button>
              )}
            </div>
            {adding && (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="ps-9 h-9" placeholder={t("Username or exact email")} value={q} onChange={(e) => search(e.target.value)} data-testid="group-add-search" autoFocus />
                </div>
                {loading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin" /></div>}
                {results.map((u) => (
                  <button key={u.id} onClick={() => addMember(u)} data-testid={`group-add-result-${u.id}`}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-start">
                    <Avatar className="w-8 h-8"><AvatarImage src={u.avatar} /><AvatarFallback className="text-[10px]">{u.name.slice(0,2)}</AvatarFallback></Avatar>
                    <span className="text-sm truncate flex-1">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{langByCode(u.language).flag}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted" data-testid={`group-member-${m.id}`}>
                  <Avatar className="w-9 h-9"><AvatarImage src={m.avatar} /><AvatarFallback className="text-[10px]">{m.name.slice(0,2)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      {m.id === user.id ? t("You") : m.name}
                      {m.is_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{langByCode(m.language).flag} {langName(m.language)}</div>
                  </div>
                  {meAdmin && !m.is_admin && m.id !== user.id && (
                    <button className="text-muted-foreground hover:text-amber-500" onClick={() => promote(m.id)} title={t("Make admin")} data-testid={`promote-${m.id}`}><Shield className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isGroup && other && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start text-destructive" onClick={block} data-testid="block-user-button">
              <Ban className="w-4 h-4 me-2" /> {blocked ? t("Unblock user") : t("Block user")}
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setReportOpen(true)} data-testid="report-user-button">
              <Flag className="w-4 h-4 me-2" /> {t("Report user")}
            </Button>
            <Button variant="outline" className="w-full justify-start text-destructive" onClick={() => setDeleteOpen(true)} data-testid="delete-chat-button">
              <Trash2 className="w-4 h-4 me-2" /> {t("Delete chat")}
            </Button>
          </div>
        )}
      </div>

      {isGroup && !editing && (
        <div className="p-4 border-t border-border space-y-2">
          <Button variant="outline" className="w-full text-destructive" onClick={leave} data-testid="group-leave-button">
            <LogOut className="w-4 h-4 me-2" /> {t("Leave group")}
          </Button>
          <Button variant="outline" className="w-full text-destructive" onClick={() => setDeleteOpen(true)} data-testid="delete-chat-button">
            <Trash2 className="w-4 h-4 me-2" /> {t("Delete chat")}
          </Button>
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid="delete-chat-info-dialog">
          <DialogHeader><DialogTitle>{t("Delete chat with {name}?", { name: chat.display_name })}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("The conversation is removed from your list and your history is cleared. It does not change anything for the other people.")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>{t("Cancel")}</Button>
            <Button className="text-destructive-foreground bg-destructive hover:bg-destructive/90" onClick={() => { setDeleteOpen(false); onDelete(); }} data-testid="confirm-delete-chat-info">{t("Delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent data-testid="report-dialog">
          <DialogHeader><DialogTitle>{t("Report {name}", { name: other?.name })}</DialogTitle></DialogHeader>
          <Textarea data-testid="report-reason-input" placeholder={t("What's the issue? (optional)")} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>{t("Cancel")}</Button>
            <Button className="text-destructive-foreground bg-destructive hover:bg-destructive/90" onClick={submitReport} data-testid="submit-report-button">{t("Submit report")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
