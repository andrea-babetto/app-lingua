import { useState } from "react";
import { toast } from "sonner";
import { X, LogOut, UserPlus, Crown, Search, Loader2, Shield } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InfoPanel({ chat, onClose, onChanged, onLeft }) {
  const { user } = useAuth();
  const isGroup = chat.type === "group";
  const meAdmin = (chat.admins || []).includes(user.id);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

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
      toast.success(`${u.name} added`);
      setAdding(false); setQ(""); setResults([]);
      onChanged();
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const promote = async (uid) => { await api.put(`/chats/${chat.id}/admin/${uid}`); toast.success("Promoted to admin"); onChanged(); };
  const leave = async () => { await api.post(`/chats/${chat.id}/leave`); toast.success("You left the group"); onLeft(); };

  const members = chat.members_info || [];
  const other = chat.other_user;

  return (
    <div className="fixed inset-0 z-30 md:static md:z-auto md:w-80 lg:w-80 shrink-0 bg-card md:border-l border-border flex flex-col" data-testid="info-panel">
      <div className="h-16 px-4 flex items-center justify-between border-b border-border">
        <span className="text-sm font-semibold">{isGroup ? "Group info" : "Contact info"}</span>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="info-panel-close"><X className="w-5 h-5" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto chat-scroll p-5 space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <Avatar className="w-20 h-20"><AvatarImage src={chat.display_avatar} /><AvatarFallback className="text-xl">{chat.display_name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="text-lg font-bold">{chat.display_name}</div>
          {!isGroup && other && <div className="text-sm text-muted-foreground">{langByCode(other.language).flag} reads & writes in {langByCode(other.language).name}</div>}
          {isGroup && <div className="text-sm text-muted-foreground">{members.length} members · tone {chat.tone}</div>}
        </div>

        {isGroup && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</span>
              {meAdmin && members.length < 50 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAdding((v) => !v)} data-testid="group-add-member-toggle">
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </Button>
              )}
            </div>

            {adding && (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9 h-9" placeholder="Search users" value={q} onChange={(e) => search(e.target.value)} data-testid="group-add-search" autoFocus />
                </div>
                {loading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin" /></div>}
                {results.map((u) => (
                  <button key={u.id} onClick={() => addMember(u)} data-testid={`group-add-result-${u.id}`}
                    className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left">
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
                      {m.id === user.id ? "You" : m.name}
                      {m.is_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{langByCode(m.language).flag} {langByCode(m.language).name}</div>
                  </div>
                  {meAdmin && !m.is_admin && m.id !== user.id && (
                    <button className="text-muted-foreground hover:text-amber-500" onClick={() => promote(m.id)} title="Make admin" data-testid={`promote-${m.id}`}><Shield className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isGroup && (
        <div className="p-4 border-t border-border">
          <Button variant="outline" className="w-full text-destructive" onClick={leave} data-testid="group-leave-button">
            <LogOut className="w-4 h-4 mr-2" /> Leave group
          </Button>
        </div>
      )}
    </div>
  );
}
