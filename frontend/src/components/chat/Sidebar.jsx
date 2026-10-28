import { useEffect, useRef, useState } from "react";
import { Search, MessageCircle, Users, User, Contact, Plus, UserPlus, Check, X, WifiOff, Pin, PinOff, Trash2 } from "lucide-react";
import { shareMyInvite, prefetchMyInvite } from "@/lib/invite";
import { format, isToday, isYesterday } from "date-fns";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProfilePanel from "@/components/chat/ProfilePanel";
import PushPrompt from "@/components/chat/PushPrompt";
import { LogoArrows } from "@/components/Logo";
import { clock } from "@/components/chat/VoiceRecorder";
import { avatarClass, initials } from "@/lib/avatar";
import { returnTarget } from "@/lib/returnTarget";
import { useI18n } from "@/i18n";

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
  const text = m.poll ? `📊 ${m.display_text || ""}`
    : m.attachment?.is_voice ? (m.attachment.duration ? `${t("🎤 Voice message")} · ${clock(m.attachment.duration)}` : t("🎤 Voice message"))
    : (m.display_text?.trim() ? m.display_text : t("📎 Attachment"));
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
        <Avatar className={chat.type === "group" ? "rounded-2xl" : ""} style={{ width: "3.25rem", height: "3.25rem" }}>
          <AvatarImage src={chat.display_avatar} />
          <AvatarFallback className={`font-semibold ${avatarClass(chat.display_name)} ${chat.type === "group" ? "rounded-2xl" : ""}`}>{(chat.type === "group" && chat.emoji) || initials(chat.display_name)}</AvatarFallback>
        </Avatar>
        {chat.other_user?.online && <span className="absolute bottom-0 end-0 w-3.5 h-3.5 rounded-full bg-online border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-base font-medium truncate">{chat.display_name}</span>
            {chat.other_user?.language && <span className="shrink-0 text-[10px] font-bold uppercase text-subtle">{chat.other_user.language}</span>}
          </span>
          {chat.last_message && (
            <span className={`text-xs shrink-0 ${chat.unread > 0 ? "text-foreground font-medium" : "text-subtle"}`}>{when(chat.last_message.created_at, t)}</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span dir="auto" className={`text-sm truncate ${chat.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{preview(chat, myId, t)}</span>
          {chat.unread > 0 && (
            <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-sand text-[var(--gl-on-accent)] text-[11px] font-semibold flex items-center justify-center">{chat.unread}</span>
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
          <AvatarFallback className={`font-semibold ${avatarClass(chat.display_name)}`}>{initials(chat.display_name)}</AvatarFallback>
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

// A saved contact with no chat in the list (never written to, or the chat was deleted): tapping opens a chat.
function SavedContactRow({ person, onOpen }) {
  const { t } = useI18n();
  return (
    <button data-testid={`contact-item-${person.id}`} onClick={() => onOpen(person)}
      className="w-full flex items-center gap-3.5 px-5 py-3 text-start hover:bg-muted/60 active:bg-muted transition-colors">
      <div className="relative shrink-0">
        <Avatar style={{ width: "2.75rem", height: "2.75rem" }}>
          <AvatarImage src={person.avatar} />
          <AvatarFallback className={`font-semibold ${avatarClass(person.name)}`}>{initials(person.name || "?")}</AvatarFallback>
        </Avatar>
        {person.online && <span className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-online border-2 border-card" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold truncate">{person.name}</div>
        <div className="text-xs text-subtle">
          {person.language?.toUpperCase()}{person.status === "pending_out" && <> · {t("Request sent")}</>}
        </div>
      </div>
    </button>
  );
}

export default function Sidebar({ chats, loading, activeId, onSelect, onOpenContact, onNewChat, onOpenAdmin, onDeleteChat, onTogglePin, requests, onAccept, onDecline }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState(() => (returnTarget().startsWith("profile") ? "profile" : "chats"));
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);  // the search field opens from the round button at the top
  const [filter, setFilter] = useState("all"); // "all" | "unread", on the Chats tab
  const [toDelete, setToDelete] = useState(null);
  const [menuChat, setMenuChat] = useState(null); // the chat whose long-press menu is open
  const online = useOnline();
  useEffect(() => { prefetchMyInvite(); }, []);  // ready before "Invite" is tapped, so the share sheet opens at once

  const direct = chats.filter((c) => c.type !== "group");
  const groups = chats.filter((c) => c.type === "group");
  // the Chats tab shows every conversation, groups included; the Groups tab only the groups
  const base = tab === "groups" ? groups : chats;
  const sorted = tab === "chats" ? [...base].sort((x, y) => Number(!!y.pinned) - Number(!!x.pinned)) : base; // pinned first, order kept otherwise
  const list = sorted.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()) && (tab !== "chats" || filter === "all" || (c.unread || 0) > 0));
  // Contacts: the people I have a chat with, plus the people I saved with no chat in the list
  const [saved, setSaved] = useState([]);
  useEffect(() => {
    if (tab !== "contacts") return;
    api.get("/contacts").then(({ data }) => setSaved(data)).catch(() => {});
  }, [tab, chats.length]);
  const inChats = new Set(direct.map((c) => c.other_user?.id));
  const contactsList = direct.filter((c) => c.display_name.toLowerCase().includes(q.toLowerCase()));
  const savedOnly = saved.filter((p) => !inChats.has(p.id) && (p.name || "").toLowerCase().includes(q.toLowerCase()));
  const unread = { chats: chats.reduce((n, c) => n + (c.unread || 0), 0), groups: groups.reduce((n, c) => n + (c.unread || 0), 0) };

  const confirmDelete = async () => {
    const c = toDelete;
    setToDelete(null);
    if (c) await onDeleteChat(c);
  };

  return (
    <div className="h-full flex flex-col bg-card relative">
      <header className="h-16 px-5 flex items-center justify-between gap-2 shrink-0 bg-card">
        <h1 data-testid="screen-title" className="text-[25px] leading-none font-medium tracking-tight truncate">
          {t((TABS.find((x) => x.id === tab) || TABS[0]).label)}
        </h1>
        {tab !== "profile" && (
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" data-testid="header-invite" onClick={() => shareMyInvite(t)}
              className="h-10 px-3.5 rounded-full bg-sand text-[var(--gl-on-accent)] text-sm font-medium inline-flex items-center gap-1.5 hover:bg-sand/90">
              <UserPlus className="w-4 h-4" aria-hidden="true" /> {t("Invite")}
            </button>
            <button type="button" data-testid="header-search" aria-label={t("Search")} aria-expanded={searching} onClick={() => { setSearching((v) => !v); setQ(""); }}
              className={`w-10 h-10 rounded-full inline-flex items-center justify-center ${searching ? "bg-primary text-primary-foreground" : "border border-border"}`}>
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button type="button" data-testid="new-chat-button" onClick={() => onNewChat(tab === "groups" ? "group" : "person")}
              aria-label={tab === "groups" ? t("New group") : t("New chat")}
              className="w-10 h-10 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center active:scale-95 transition">
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </button>
          </div>
        )}
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
          {searching && <div className="px-4 pt-1 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
              <input data-testid="sidebar-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "groups" ? t("Search groups") : tab === "contacts" ? t("Search contacts") : t("Search chats")}
                autoFocus className="w-full h-11 ps-10 pe-3 rounded-full bg-surface text-[15px] placeholder:text-subtle outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>}

          {tab === "chats" && <PushPrompt />}

          {tab === "chats" && (
            <div className="px-5 pt-1 pb-2 flex gap-2 shrink-0" role="tablist" aria-label={t("Filter chats")}>
              {[["all", t("All")], ["unread", t("Unread")]].map(([id, label]) => (
                <button key={id} role="tab" aria-selected={filter === id} data-testid={`filter-${id}`} onClick={() => setFilter(id)}
                  className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${filter === id ? "bg-primary text-primary-foreground" : "border border-border text-foreground hover:bg-surface"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}

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

          <div className="flex-1 min-h-0 overflow-y-auto chat-scroll pb-6">
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
            {tab === "contacts" && !loading && contactsList.length === 0 && savedOnly.length === 0 && (
              <div className="px-8 pt-14 text-center text-[15px] text-muted-foreground" data-testid="empty-contacts">{t("No contacts yet.")}</div>
            )}
            {tab === "contacts" && [
              ...contactsList.map((c) => ({ key: c.id, name: c.display_name, el: <ContactRow key={c.id} chat={c} onSelect={onSelect} /> })),
              ...savedOnly.map((p) => ({ key: p.id, name: p.name || "", el: <SavedContactRow key={p.id} person={p} onOpen={onOpenContact} /> })),
            ].sort((x, y) => x.name.localeCompare(y.name)).map((x) => x.el)}
            {tab !== "contacts" && !loading && list.length === 0 && (
              <div className="px-8 pt-14 text-center" data-testid="empty-list">
                <div className="w-[104px] h-[104px] rounded-full bg-surface mx-auto mb-5 flex items-center justify-center">
                  <LogoArrows className="w-12 h-12" />
                </div>
                <p className={`text-muted-foreground max-w-[16rem] mx-auto leading-snug ${tab === "groups" ? "text-[17px] font-semibold text-foreground" : "text-[15px]"}`}>
                  {tab === "groups" ? t("No groups, for now.") : filter === "unread" && chats.length > 0 ? t("No unread chats.") : t("No chats yet. Tap the button to find someone.")}
                </p>
                <Button className="mt-5 h-[50px] w-full max-w-xs rounded-full text-[15px] font-medium" onClick={() => onNewChat(tab === "groups" ? "group" : "person")}>
                  {tab === "groups" ? t("New group") : t("New chat")}
                </Button>
                {tab === "groups" && (
                  <button type="button" data-testid="invite-with-link" onClick={() => onNewChat("person")} className="mt-3 text-sm text-primary font-semibold">
                    {t("Invite with a link")}
                  </button>
                )}
              </div>
            )}
            {tab !== "contacts" && list.map((c, i) => (
              <div key={c.id}>
                {tab === "chats" && list.some((x) => x.pinned) && (i === 0 || !!list[i - 1].pinned !== !!c.pinned) && (
                  <div data-testid={c.pinned ? "section-pinned" : "section-chats"} className="px-5 pt-3 pb-1 text-xs font-semibold text-subtle">{c.pinned ? t("Pinned") : t("Chats")}</div>
                )}
                <ChatRow chat={c} active={activeId === c.id} myId={user.id} onSelect={onSelect} onAskDelete={setMenuChat} />
              </div>
            ))}
            {tab !== "contacts" && list.length > 0 && <p className="px-6 pt-4 text-center text-xs text-muted-foreground">{window.matchMedia?.("(pointer: coarse)").matches ? t("Press and hold a chat for options.") : t("Right-click a chat for options.")}</p>}
          </div>

        </>
      )}

      <nav className="grid grid-cols-4 shrink-0 border-t border-[var(--gl-line)] bg-card" data-testid="bottom-tabs">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id;
          return (
            <button key={id} data-testid={`tab-${id}`} onClick={() => { setTab(id); setQ(""); }}
              className="flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs">
              <span className={`relative w-14 h-8 rounded-full flex items-center justify-center transition-colors ${on ? "bg-primary text-primary-foreground" : "text-subtle"}`}>
                <Icon className="w-[21px] h-[21px]" strokeWidth={1.9} />
                {unread[id] > 0 && (
                  <span className="absolute -top-1 end-1.5 min-w-4 h-4 px-1 rounded-full bg-sand text-[var(--gl-on-accent)] text-[10px] font-semibold flex items-center justify-center">{unread[id]}</span>
                )}
              </span>
              <span className={on ? "font-medium text-foreground" : "text-subtle"}>{t(label)}</span>
            </button>
          );
        })}
      </nav>

      <Dialog open={!!menuChat} onOpenChange={(v) => { if (!v) setMenuChat(null); }}>
        <DialogContent data-testid="chat-menu" className="max-w-xs p-2 gap-0">
          <DialogHeader className="px-3 pt-3 pb-2"><DialogTitle className="text-base truncate">{menuChat?.display_name}</DialogTitle></DialogHeader>
          <button data-testid="chat-menu-pin" className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium text-start hover:bg-muted"
            onClick={() => { const c = menuChat; setMenuChat(null); onTogglePin(c); }}>
            {menuChat?.pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />} {menuChat?.pinned ? t("Unpin") : t("Pin to the top")}
          </button>
          <button data-testid="chat-menu-delete" className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] font-medium text-start text-destructive hover:bg-muted"
            onClick={() => { const c = menuChat; setMenuChat(null); setToDelete(c); }}>
            <Trash2 className="w-5 h-5" /> {t("Delete chat")}
          </button>
        </DialogContent>
      </Dialog>

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
