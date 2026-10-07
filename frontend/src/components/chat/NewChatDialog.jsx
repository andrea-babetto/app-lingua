import { useState } from "react";
import { Search, UserPlus, Check, Loader2, Link2 } from "lucide-react";
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
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

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
      onOpenChange(false);
      setQ(""); setResults([]);
    } catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?invite=${user.username}`);
    toast.success("Invite link copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-chat-dialog">
        <DialogHeader><DialogTitle>Start a new chat</DialogTitle></DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
