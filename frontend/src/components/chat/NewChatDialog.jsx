import { useState } from "react";
import { Search, UserPlus, Loader2, Link2, Users, User, Check } from "lucide-react";
import { toast } from "sonner";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function NewChatDialog({ open, onOpenChange, onStartChat }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("person");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  // group
  const [groupName, setGroupName] = useState("");
  const [groupTone, setGroupTone] = useState("neutral");
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);

  const reset = () => { setQ(""); setResults([]); setGroupName(""); setSelected([]); setGroupTone("neutral"); };

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
      toast.success(`Chat started with ${u.name}`);
      onStartChat(data);
      onOpenChange(false); reset();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const toggleSelect = (u) => {
    setSelected((s) => (s.find((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));
  };

  const createGroup = async () => {
    if (!groupName.trim()) return toast.error("Enter a group name");
    if (selected.length === 0) return toast.error("Add at least one member");
    setCreating(true);
    try {
      const { data } = await api.post("/chats/group", { name: groupName, member_ids: selected.map((u) => u.id), tone: groupTone });
      toast.success("Group created");
      onStartChat(data);
      onOpenChange(false); reset();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
    finally { setCreating(false); }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?invite=${user.username}`);
    toast.success("Invite link copied");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent data-testid="new-chat-dialog">
        <DialogHeader><DialogTitle>Start a new chat</DialogTitle></DialogHeader>

        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button data-testid="tab-person" onClick={() => setTab("person")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition ${tab === "person" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <User className="w-4 h-4" /> Person
          </button>
          <button data-testid="tab-group" onClick={() => setTab("group")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition ${tab === "group" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
            <Users className="w-4 h-4" /> Group
          </button>
        </div>

        {tab === "person" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="user-search-input" className="pl-9" placeholder="Search by name, username or email" value={q} onChange={(e) => search(e.target.value)} autoFocus />
            </div>
            <button onClick={copyInvite} className="w-full flex items-center gap-2 text-sm text-primary hover:underline">
              <Link2 className="w-4 h-4" /> Copy my invite link (@{user.username})
            </button>
            <div className="min-h-32 max-h-72 overflow-y-auto chat-scroll space-y-1">
              {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {!loading && q && results.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No users found</p>}
              {results.map((u) => (
                <div key={u.id} data-testid={`search-result-${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <Avatar className="w-10 h-10"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username} · {langByCode(u.language).flag} {langByCode(u.language).name}</div>
                  </div>
                  <Button data-testid={`start-chat-${u.id}`} size="sm" onClick={() => request(u)}><UserPlus className="w-4 h-4 mr-1" /> Chat</Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input data-testid="group-name-input" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {["formal", "neutral", "casual"].map((t) => (
                <button key={t} data-testid={`group-tone-${t}`} onClick={() => setGroupTone(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition ${groupTone === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{t}</button>
              ))}
            </div>
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="group-member-search" className="pl-9" placeholder="Search members to add" value={q} onChange={(e) => search(e.target.value)} />
            </div>
            <div className="min-h-24 max-h-52 overflow-y-auto chat-scroll space-y-1">
              {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
              {results.map((u) => {
                const on = selected.find((x) => x.id === u.id);
                return (
                  <button key={u.id} data-testid={`group-select-${u.id}`} onClick={() => toggleSelect(u)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left ${on ? "bg-accent" : "hover:bg-muted"}`}>
                    <Avatar className="w-9 h-9"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{langByCode(u.language).flag} {langByCode(u.language).name}</div>
                    </div>
                    {on && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
            <Button data-testid="create-group-button" className="w-full" onClick={createGroup} disabled={creating}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : `Create group${selected.length ? ` (${selected.length + 1})` : ""}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
