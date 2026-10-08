import { useState, useEffect } from "react";
import { Search, UserPlus, Loader2, Link2, Users, User, Check } from "lucide-react";
import { toast } from "sonner";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export default function NewChatDialog({ open, onOpenChange, onStartChat, initialTab = "person" }) {
  const { user } = useAuth();
  const { t, langName } = useI18n();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  // group
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);

  const reset = () => { setQ(""); setResults([]); setGroupName(""); setSelected([]); };

  const search = async (val) => {
    setQ(val);
    if (!val.trim()) return setResults([]);
    setLoading(true);
    try {
      const { data } = await api.get("/users/search", { params: { q: val } });
      setResults(data);
    } finally { setLoading(false); }
  };

  const request = async (u) => {
    try {
      await api.post(`/contacts/request/${u.id}`);
      const { data } = await api.post(`/chats/direct/${u.id}`);
      toast.success(t("Chat started with {name}", { name: u.name }));
      onStartChat(data);
      onOpenChange(false); reset();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const toggleSelect = (u) => {
    setSelected((s) => (s.find((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));
  };

  const createGroup = async () => {
    if (!groupName.trim()) return toast.error(t("Enter a group name"));
    if (selected.length === 0) return toast.error(t("Add at least one member"));
    setCreating(true);
    try {
      const { data } = await api.post("/chats/group", { name: groupName, member_ids: selected.map((u) => u.id) });
      toast.success(t("Group created"));
      onStartChat(data);
      onOpenChange(false); reset();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
    finally { setCreating(false); }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?invite=${user.username}`);
    toast.success(t("Invite link copied"));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent data-testid="new-chat-dialog">
        <DialogHeader><DialogTitle>{t("Start a new chat")}</DialogTitle></DialogHeader>

        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button data-testid="tab-person" onClick={() => setTab("person")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition ${tab === "person" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <User className="w-4 h-4" /> {t("Person")}
          </button>
          <button data-testid="tab-group" onClick={() => setTab("group")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition ${tab === "group" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <Users className="w-4 h-4" /> {t("Group")}
          </button>
        </div>

        {tab === "person" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="user-search-input" className="ps-9" placeholder={t("Search by username or exact email")} value={q} onChange={(e) => search(e.target.value)} autoFocus />
            </div>
            <button onClick={copyInvite} className="w-full flex items-center gap-2 text-sm text-primary hover:underline">
              <Link2 className="w-4 h-4" /> {t("Copy my invite link (@{name})", { name: user.username })}
            </button>
            <div className="min-h-32 max-h-72 overflow-y-auto chat-scroll space-y-1">
              {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {!loading && q && results.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">{q.trim().length < 3 ? t("Type at least 3 characters") : t("No users found. Try their username or exact email.")}</p>}
              {results.map((u) => (
                <div key={u.id} data-testid={`search-result-${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <Avatar className="w-10 h-10"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username} · {langByCode(u.language).flag} {langName(u.language)}</div>
                  </div>
                  <Button data-testid={`start-chat-${u.id}`} size="sm" onClick={() => request(u)}><UserPlus className="w-4 h-4 me-1" /> {t("Chat")}</Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input data-testid="group-name-input" placeholder={t("Group name")} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent text-accent-foreground text-xs">
                    {u.name} <button onClick={() => toggleSelect(u)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="group-member-search" className="ps-9" placeholder={t("Find members by username or exact email")} value={q} onChange={(e) => search(e.target.value)} />
            </div>
            <div className="min-h-24 max-h-52 overflow-y-auto chat-scroll space-y-1">
              {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {results.map((u) => {
                const on = selected.find((x) => x.id === u.id);
                return (
                  <button key={u.id} data-testid={`group-select-${u.id}`} onClick={() => toggleSelect(u)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-start ${on ? "bg-accent" : "hover:bg-muted"}`}>
                    <Avatar className="w-9 h-9"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{langByCode(u.language).flag} {langName(u.language)}</div>
                    </div>
                    {on && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
            <Button data-testid="create-group-button" className="w-full" onClick={createGroup} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : `${t("Create group")}${selected.length ? ` (${selected.length + 1})` : ""}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
