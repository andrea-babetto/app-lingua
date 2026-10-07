import { useState } from "react";
import { Search, Plus, Settings, Moon, Sun, LogOut, Languages, BarChart3, UserPlus, Check, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function Sidebar({ chats, activeId, onSelect, onNewChat, onOpenSettings, onOpenAdmin, requests, onAccept, onDecline }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");

  const filtered = chats.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <Avatar className="w-9 h-9">
            <AvatarImage src={user.avatar} />
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate leading-tight">{user.name}</div>
            <div className="text-xs text-muted-foreground">{langByCode(user.language).flag} {langByCode(user.language).name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button data-testid="theme-toggle-button" variant="ghost" size="icon" className="w-8 h-8" onClick={toggle}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="user-menu-button" variant="ghost" size="icon" className="w-8 h-8"><Settings className="w-4 h-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="open-settings-item" onClick={onOpenSettings}><Settings className="w-4 h-4 mr-2" /> Settings</DropdownMenuItem>
              {user.role === "admin" && <DropdownMenuItem data-testid="open-admin-item" onClick={onOpenAdmin}><BarChart3 className="w-4 h-4 mr-2" /> Admin dashboard</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="logout-item" onClick={logout} className="text-destructive"><LogOut className="w-4 h-4 mr-2" /> Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input data-testid="sidebar-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <Button data-testid="new-chat-button" size="icon" className="w-9 h-9 shrink-0" onClick={onNewChat}><Plus className="w-4 h-4" /></Button>
      </div>

      {requests.length > 0 && (
        <div className="px-3 pb-2 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-accent/60 border border-border">
              <UserPlus className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-muted-foreground truncate">wants to connect</div>
              </div>
              <Button data-testid={`contact-request-accept-${r.id}`} size="icon" className="w-7 h-7" onClick={() => onAccept(r.id)}><Check className="w-3.5 h-3.5" /></Button>
              <Button data-testid={`contact-request-decline-${r.id}`} size="icon" variant="ghost" className="w-7 h-7" onClick={() => onDecline(r.id)}><X className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto chat-scroll">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Languages className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No chats yet. Tap + to find someone.
          </div>
        )}
        {filtered.map((c) => (
          <button key={c.id} data-testid={`sidebar-chat-item-${c.id}`} onClick={() => onSelect(c)}
            className={`w-full flex items-center gap-3 px-3 py-3.5 transition-colors text-left ${activeId === c.id ? "bg-accent" : "hover:bg-muted"}`}>
            <div className="relative">
              <Avatar className="w-13 h-13" style={{ width: "3.25rem", height: "3.25rem" }}>
                <AvatarImage src={c.display_avatar} />
                <AvatarFallback>{initials(c.display_name)}</AvatarFallback>
              </Avatar>
              {c.other_user?.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold truncate">{c.display_name}</span>
                {c.last_message && <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNowStrict(new Date(c.last_message.created_at))}</span>}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground truncate">{c.last_message ? (c.last_message.deleted_for_all ? "🚫 Message deleted" : (c.last_message.display_text?.trim() ? c.last_message.display_text : "📎 Attachment")) : "Say hello 👋"}</span>
                {c.unread > 0 && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">{c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
