import { useRef, useState } from "react";
import { Search, MessageCircle, Users, User, MessageSquarePlus, UserPlus, Check, X, Languages } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ProfilePanel from "@/components/chat/ProfilePanel";
import PushPrompt from "@/components/chat/PushPrompt";
import Logo from "@/components/Logo";

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function when(iso) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yy");
}

function preview(c, myId) {
  const m = c.last_message;
  if (!m) return "Say hello 👋";
  if (m.deleted_for_all) return "🚫 Message deleted";
  const text = m.display_text?.trim() ? m.display_text : "📎 Attachment";
  if (c.type === "group") return `${m.sender_id === myId ? "You" : (m.sender_name || "").split(" ")[0]}: ${text}`;
  return text;
}

function ChatRow({ chat, active, myId, onSelect, onAskDelete }) {
  const timer = useRef(null);
  const longPressed = useRef(false);

  const start = () => {
    longPressed.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { longPressed.current = true; onAskDelete(chat); }, 550);
  };
  const cancel = () => clearTimeout(timer.current);
  const click = () => { if (longPressed.current) { longPressed.current = false; return; } onSelect(chat); };

  return (
    <button data-testid={`sidebar-chat-item-${chat.id}`} onClick={click}
      onTouchStart={start} onTouchEnd={cancel} onTouchMove={cancel} onTouchCancel={cancel}
      onContextMenu={(e) => { e.preventDefault(); onAskDelete(chat); }}
      className={`w-full flex items-center gap-3.5 px-4 py-3 text-left select-none [-webkit-touch-callout:none] transition-colors ${active ? "bg-accent" : "hover:bg-muted/60 active:bg-muted"}`}>
      <div className="relative shrink-0">
        <Avatar style={{ width: "3.5rem", height: "3.5rem" }}>
          <AvatarImage src={chat.display_avatar} />
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials(chat.display_name)}</AvatarFallback>
        </Avatar>
        {chat.other_user?.online && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-medium truncate">{chat.display_name}</span>
          {chat.last_message && (
            <span className={`text-xs shrink-0 ${chat.unread > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>{when(chat.last_message.created_at)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-[15px] text-muted-foreground truncate">{preview(chat, myId)}</span>
          {chat.unread > 0 && (
            <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">{chat.unread}</span>
          )}
        </div>
      </div>
    </button>
  );
}

const TABS = [
  { id: "chats", label: "Chats", Icon: MessageCircle },
  { id: "groups", label: "Groups", Icon: Users },
  { id: "profile", label: "Profile", Icon: User },
];

export default function Sidebar({ chats, loading, activeId, onSelect, onNewChat, onOpenAdmin, onDeleteChat, requests, onAccept, onDecline }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("chats");
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState(null);

  const direct = chats.filter((c) => c.type !== "group");
  const groups = chats.filter((c) => c.type === "group");
  const list = (tab === "groups" ? groups : direct).filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()));
  const unread = { chats: direct.reduce((n, c) => n + (c.unread || 0), 0), groups: groups.reduce((n, c) => n + (c.unread || 0), 0) };

  const confirmDelete = async () => {
    const c = toDelete;
    setToDelete(null);
    if (c) await onDeleteChat(c);
  };

  return (
    <div className="h-full flex flex-col bg-card relative">
      <header className="h-14 px-4 flex items-center shrink-0 bg-primary text-primary-foreground">
        <Logo className="text-[28px]" />
      </header>

      {tab === "profile" ? (
        <ProfilePanel onOpenAdmin={onOpenAdmin} />
      ) : (
        <>
          <div className="px-3 pt-3 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input data-testid="sidebar-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "groups" ? "Search groups" : "Search chats"}
                className="w-full h-10 pl-9 pr-3 rounded-full bg-muted text-[15px] outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
          </div>

          {tab === "chats" && <PushPrompt />}

          {tab === "chats" && requests.length > 0 && (
            <div className="px-3 py-2 space-y-2 shrink-0">
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

          <div className="flex-1 min-h-0 overflow-y-auto chat-scroll pb-24">
            {loading && (
              <div className="animate-pulse" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3.5 px-4 py-3">
                    <div className="w-14 h-14 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2.5"><div className="h-4 w-2/5 rounded bg-muted" /><div className="h-3.5 w-4/5 rounded bg-muted" /></div>
                  </div>
                ))}
              </div>
            )}
            {!loading && list.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Languages className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {tab === "groups" ? "No groups yet. Tap the button to create one." : "No chats yet. Tap the button to find someone."}
              </div>
            )}
            {list.map((c) => (
              <ChatRow key={c.id} chat={c} active={activeId === c.id} myId={user.id} onSelect={onSelect} onAskDelete={setToDelete} />
            ))}
            {list.length > 0 && <p className="px-6 pt-4 text-center text-xs text-muted-foreground">{window.matchMedia?.("(pointer: coarse)").matches ? "Press and hold a chat to delete it." : "Right-click a chat to delete it."}</p>}
          </div>

          <button data-testid="new-chat-button" onClick={() => onNewChat(tab === "groups" ? "group" : "person")}
            aria-label={tab === "groups" ? "New group" : "New chat"}
            className="absolute right-4 bottom-20 w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition">
            {tab === "groups" ? <Users className="w-6 h-6" /> : <MessageSquarePlus className="w-6 h-6" />}
          </button>
        </>
      )}

      <nav className="grid grid-cols-3 shrink-0 border-t border-border bg-card" data-testid="bottom-tabs">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button key={id} data-testid={`tab-${id}`} onClick={() => { setTab(id); setQ(""); }}
              className="flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs">
              <span className={`relative px-5 py-1 rounded-full transition-colors ${on ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                <Icon className="w-6 h-6" strokeWidth={on ? 2.4 : 2} />
                {unread[id] > 0 && (
                  <span className="absolute -top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">{unread[id]}</span>
                )}
              </span>
              <span className={on ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
            </button>
          );
        })}
      </nav>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null); }}>
        <AlertDialogContent data-testid="delete-chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat with {toDelete?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation is removed from your list and your history is cleared. It does not change anything for the other people.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-chat" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
