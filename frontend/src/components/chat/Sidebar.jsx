import { useEffect, useRef, useState } from "react";
import { Search, MessageCircle, Users, User, Contact, Plus, UserPlus, Check, X, WifiOff } from "lucide-react";
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
import Logo, { LogoArrows } from "@/components/Logo";
import { useI18n } from "@/i18n";

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function when(iso, t) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return t("Yesterday");
  return format(d, "dd/MM/yy");
}

function preview(c, myId, t) {
  const m = c.last_message;
  if (!m) return t("Say hello 👋");
  if (m.deleted_for_all) return t("🚫 Message deleted");
  const text = m.display_text?.trim() ? m.display_text : t("📎 Attachment");
  if (c.type === "group") return `${m.sender_id === myId ? t("You") : (m.sender_name || "").split(" ")[0]}: ${text}`;
  return text;
}

function ChatRow({ chat, active, myId, onSelect, onAskDelete }) {
  const { t } = useI18n();
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
      className={`w-full flex items-center gap-3.5 px-5 py-3 text-start select-none [-webkit-touch-callout:none] transition-colors ${active ? "bg-accent" : "hover:bg-muted/60 active:bg-muted"}`}>
      <div className="relative shrink-0">
        <Avatar className={chat.type === "group" ? "rounded-2xl" : ""} style={{ width: "3.125rem", height: "3.125rem" }}>
          <AvatarImage src={chat.display_avatar} />
          <AvatarFallback className={`bg-label text-label-foreground font-semibold ${chat.type === "group" ? "rounded-2xl" : ""}`}>{initials(chat.display_name)}</AvatarFallback>
        </Avatar>
        {chat.other_user?.online && <span className="absolute bottom-0 end-0 w-3.5 h-3.5 rounded-full bg-online border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-base font-semibold truncate">{chat.display_name}</span>
            {chat.other_user?.language && <span className="shrink-0 text-[10px] font-bold uppercase text-subtle">{chat.other_user.language}</span>}
          </span>
          {chat.last_message && (
            <span className={`text-xs shrink-0 ${chat.unread > 0 ? "text-primary font-bold" : "text-subtle"}`}>{when(chat.last_message.created_at, t)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-sm text-muted-foreground truncate">{preview(chat, myId, t)}</span>
          {chat.unread > 0 && (
            <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">{chat.unread}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}

const TABS = [
  { id: "chats", label: "Chats", Icon: MessageCircle },
  { id: "groups", label: "Groups", Icon: Users },
  { id: "contacts", label: "Contacts", Icon: Contact },
  { id: "profile", label: "Profile", Icon: User },
];

// The people you already have a one-to-one chat with, one row each. Tapping a row opens that chat.
function ContactRow({ chat, onSelect }) {
  const other = chat.other_user || {};
  return (
    <button data-testid={`contact-item-${other.id}`} onClick={() => onSelect(chat)}
      className="w-full flex items-center gap-3.5 px-5 py-3 text-start hover:bg-muted/60 active:bg-muted transition-colors">
      <div className="relative shrink-0">
        <Avatar style={{ width: "2.75rem", height: "2.75rem" }}>
          <AvatarImage src={chat.display_avatar} />
          <AvatarFallback className="bg-label text-label-foreground font-semibold">{initials(chat.display_name)}</AvatarFallback>
        </Avatar>
        {other.online && <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-online border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold truncate">{chat.display_name}</div>
        {other.language && <div className="text-xs text-subtle">{other.language.toUpperCase()}</div>}
      </div>
    </button>
  );
}

export default function Sidebar({ chats, loading, activeId, onSelect, onNewChat, onOpenAdmin, onDeleteChat, requests, onAccept, onDecline }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState("chats");
  const [q, setQ] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const online = useOnline();

  const direct = chats.filter((c) => c.type !== "group");
  const groups = chats.filter((c) => c.type === "group");
  const list = (tab === "groups" ? groups : direct).filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()));
  const contactsList = direct.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()));
  const unread = { chats: direct.reduce((n, c) => n + (c.unread || 0), 0), groups: groups.reduce((n, c) => n + (c.unread || 0), 0) };

  const confirmDelete = async () => {
    const c = toDelete;
    setToDelete(null);
    if (c) await onDeleteChat(c);
  };

  return (
    <div className="h-full flex flex-col bg-card relative">
      <header className="h-16 px-5 flex items-center justify-between shrink-0 bg-card">
        <Logo height={29} />
        <button data-testid="header-profile-button" onClick={() => setTab("profile")} aria-label={t("Profile")}>
          <Avatar className="w-9 h-9">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="bg-label text-label-foreground text-xs font-bold">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </header>

      {!online && (
        <div data-testid="offline-banner" className="mx-4 mb-2 px-3.5 py-2.5 rounded-xl bg-[#fdecea] text-[#7a1a10] dark:bg-[#3a1512] dark:text-[#f8c9c2] text-sm font-medium flex items-center gap-2 shrink-0">
          <WifiOff className="w-4 h-4 shrink-0" /> {t("You're offline. Check your connection.")}
        </div>
      )}

      {tab === "profile" ? (
        <ProfilePanel onOpenAdmin={onOpenAdmin} />
      ) : (
        <>
          <div className="px-4 pt-1 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
              <input data-testid="sidebar-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "groups" ? t("Search groups") : tab === "contacts" ? t("Search contacts") : t("Search chats")}
                className="w-full h-10 ps-10 pe-3 rounded-xl bg-surface text-[15px] placeholder:text-subtle outline-none focus:ring-2 focus:ring-primary/30" />
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
                    <div className="text-muted-foreground truncate">{t("wants to connect")}</div>
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
            {tab === "contacts" && !loading && contactsList.length === 0 && (
              <div className="px-8 pt-14 text-center text-[15px] text-muted-foreground" data-testid="empty-contacts">{t("No contacts yet.")}</div>
            )}
            {tab === "contacts" && contactsList.map((c) => <ContactRow key={c.id} chat={c} onSelect={onSelect} />)}
            {tab !== "contacts" && !loading && list.length === 0 && (
              <div className="px-8 pt-14 text-center" data-testid="empty-list">
                <div className="w-[104px] h-[104px] rounded-full bg-surface mx-auto mb-5 flex items-center justify-center">
                  <LogoArrows className="w-12 h-12" />
                </div>
                <p className="text-[15px] text-muted-foreground max-w-[16rem] mx-auto leading-snug">
                  {tab === "groups" ? t("No groups yet. Tap the button to create one.") : t("No chats yet. Tap the button to find someone.")}
                </p>
                <Button className="mt-5 h-11 rounded-2xl px-6 font-semibold" onClick={() => onNewChat(tab === "groups" ? "group" : "person")}>
                  {tab === "groups" ? t("New group") : t("New chat")}
                </Button>
              </div>
            )}
            {tab !== "contacts" && list.map((c) => (
              <ChatRow key={c.id} chat={c} active={activeId === c.id} myId={user.id} onSelect={onSelect} onAskDelete={setToDelete} />
            ))}
            {tab !== "contacts" && list.length > 0 && <p className="px-6 pt-4 text-center text-xs text-muted-foreground">{window.matchMedia?.("(pointer: coarse)").matches ? t("Press and hold a chat to delete it.") : t("Right-click a chat to delete it.")}</p>}
          </div>

          <button data-testid="new-chat-button" onClick={() => onNewChat(tab === "groups" ? "group" : "person")}
            aria-label={tab === "groups" ? t("New group") : t("New chat")}
            className="absolute end-4 bottom-20 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition">
            <Plus className="w-7 h-7" strokeWidth={2.4} />
          </button>
        </>
      )}

      <nav className="grid grid-cols-4 shrink-0 border-t border-border bg-card" data-testid="bottom-tabs">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button key={id} data-testid={`tab-${id}`} onClick={() => { setTab(id); setQ(""); }}
              className="flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs">
              <span className={`relative px-5 py-1 rounded-full transition-colors ${on ? "bg-primary/14 text-primary" : "text-subtle"}`}>
                <Icon className="w-6 h-6" strokeWidth={on ? 2.4 : 2} />
                {unread[id] > 0 && (
                  <span className="absolute -top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">{unread[id]}</span>
                )}
              </span>
              <span className={on ? "font-semibold text-primary" : "text-subtle"}>{t(label)}</span>
            </button>
          );
        })}
      </nav>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null); }}>
        <AlertDialogContent data-testid="delete-chat-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete chat with {name}?", { name: toDelete?.display_name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("The conversation is removed from your list and your history is cleared. It does not change anything for the other people.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-chat" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>{t("Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
