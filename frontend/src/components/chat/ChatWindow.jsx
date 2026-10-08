import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { Send, Smile, Paperclip, ArrowLeft, Info, X, Loader2, Search, ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MessageBubble from "@/components/chat/MessageBubble";
import MessageActions from "@/components/chat/MessageActions";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","🙏","👏","🔥","❤️","🎉","✅","💯","😅","🤝","👋","💪","🌍","☕","🚀"];
const GROUP_GAP_MS = 5 * 60 * 1000;
const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};

const draftKey = (id) => `glott_draft_${id}`;
const readDraft = (id) => { try { return localStorage.getItem(draftKey(id)) || ""; } catch { return ""; } };
const writeDraft = (id, v) => { try { v ? localStorage.setItem(draftKey(id), v) : localStorage.removeItem(draftKey(id)); } catch { /* storage blocked */ } };

const headerBtn = "w-10 h-10 rounded-full flex items-center justify-center text-primary-foreground/90 hover:bg-white/15 active:bg-white/25 transition shrink-0";

function MessageSkeleton() {
  return (
    <div className="space-y-3 px-3 py-2 animate-pulse" aria-hidden="true">
      {[["w-48", false], ["w-64", true], ["w-40", false], ["w-56", true]].map(([w, mine], i) => (
        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`${w} h-11 rounded-2xl ${mine ? "bg-bubble-out" : "bg-bubble-in"} opacity-70`} />
        </div>
      ))}
    </div>
  );
}

export default function ChatWindow({ chat, messages, loading, onSend, onEdit, onReact, onBack, typingUser, onToggleInfo, bottomRef }) {
  const { user } = useAuth();
  const [text, setText] = useState(() => readDraft(chat.id));
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sq, setSq] = useState("");
  const [sres, setSres] = useState([]);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const fileRef = useRef();
  const taRef = useRef();
  const scrollRef = useRef();
  const lastCount = useRef(0);
  const atBottomRef = useRef(true);
  const isGroup = chat.type === "group";

  // each conversation keeps its own unsent text (this component is re-created for every chat)
  useEffect(() => { if (!editing) writeDraft(chat.id, text); }, [text, chat.id, editing]);

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);
  useLayoutEffect(autoGrow, [text, autoGrow]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // opening a chat lands on the newest message; new messages only pull you down if you are already there
  useLayoutEffect(() => {
    if (loading) return;
    const n = messages.length, last = messages[n - 1];
    if (lastCount.current === 0) { scrollToBottom(false); }
    else if (n > lastCount.current) {
      if (atBottomRef.current || last?.sender_id === user.id) {
        // following the conversation: jump (a slow animated scroll would make a burst of messages look like "scrolled up")
        atBottomRef.current = true; setAtBottom(true); setNewBelow(0);
        scrollToBottom(false);
      } else setNewBelow((c) => c + (n - lastCount.current));
    }
    lastCount.current = n;
  }, [messages, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (typingUser && atBottomRef.current) scrollToBottom(false); }, [typingUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const keepBottom = () => { if (atBottomRef.current) scrollToBottom(false); };
    vv.addEventListener("resize", keepBottom);
    return () => vv.removeEventListener("resize", keepBottom);
  }, [scrollToBottom]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setNewBelow(0);
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (editing) {
      const id = editing.id;
      setEditing(null); setText(readDraft(chat.id));
      try { await onEdit(id, t); } catch (e) { toast.error(e.response?.data?.detail || "Could not edit the message"); }
      return;
    }
    setText("");
    writeDraft(chat.id, "");
    const replyId = reply?.id;
    setReply(null);
    await onSend({ text: t, reply_to: replyId });
    if (!isTouchDevice()) taRef.current?.focus();
  };

  const startEdit = (msg) => { setReply(null); setEditing(msg); setText(msg.original_text); setTimeout(() => taRef.current?.focus(), 50); };
  const cancelEdit = () => { setEditing(null); setText(readDraft(chat.id)); };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await onSend({ text: "", attachment: data });
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const runSearch = async (v) => {
    setSq(v);
    if (!v.trim()) return setSres([]);
    try { const { data } = await api.get(`/messages/${chat.id}/search`, { params: { q: v } }); setSres(data); }
    catch { setSres([]); }
  };

  const other = chat.other_user;
  const subtitle = isGroup
    ? `${chat.members_info.length} members`
    : other?.online ? "online" : (other?.last_seen ? "last seen recently" : langByCode(other?.language).name);

  const sameBlock = (a, b) => a && b && a.sender_id === b.sender_id && !a.deleted_for_all && !b.deleted_for_all
    && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString()
    && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GROUP_GAP_MS;

  return (
    <div className="h-full w-full flex-1 min-w-0 flex flex-col bg-background relative">
      <header className="h-16 pl-1.5 pr-2 flex items-center gap-1 bg-primary text-primary-foreground shrink-0 shadow-sm z-10">
        <button data-testid="mobile-back-button" aria-label="Back" className={`${headerBtn} md:hidden`} onClick={onBack}><ArrowLeft className="w-6 h-6" /></button>
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left h-full md:pl-2" onClick={onToggleInfo}>
          <Avatar className="w-10 h-10 ring-2 ring-white/30">
            <AvatarImage src={chat.display_avatar} />
            <AvatarFallback className="bg-white/20 text-primary-foreground font-semibold">{chat.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold truncate leading-tight">{chat.display_name}</div>
            <div className="text-xs text-primary-foreground/80 truncate">{subtitle}</div>
          </div>
        </button>
        <button data-testid="search-messages-button" aria-label="Search" className={headerBtn} onClick={() => { setSearchOpen((v) => !v); setSq(""); setSres([]); }}><Search className="w-5 h-5" /></button>
        <button data-testid="toggle-info-panel-button" aria-label="Chat info" className={headerBtn} onClick={onToggleInfo}><Info className="w-5 h-5" /></button>
      </header>

      {searchOpen && (
        <div className="border-b border-border bg-card p-3 space-y-2" data-testid="message-search-panel">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input data-testid="message-search-input" className="pl-9 h-10 rounded-full" placeholder="Search in this conversation..." value={sq} onChange={(e) => runSearch(e.target.value)} autoFocus />
          </div>
          {sq && (
            <div className="max-h-56 overflow-y-auto chat-scroll space-y-1">
              {sres.length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">No matches</p>}
              {sres.map((m) => (
                <div key={m.id} data-testid={`search-match-${m.id}`} className="p-2 rounded-lg hover:bg-muted text-sm">
                  <div className="text-xs text-muted-foreground">{m.sender_name} · {format(new Date(m.created_at), "dd/MM/yy")}</div>
                  <div className="truncate">{m.display_text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto chat-scroll chat-wallpaper py-3 relative">
        {loading && <MessageSkeleton />}
        {!loading && messages.length === 0 && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center text-sm text-muted-foreground bg-card/90 border border-border rounded-2xl px-5 py-4 shadow-sm max-w-xs">
              Say hello 👋<br />Write in your language — {other?.name || "everyone"} reads it in theirs.
            </div>
          </div>
        )}
        {!loading && messages.map((m, i) => {
          const prev = messages[i - 1], next = messages[i + 1];
          const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const first = !sameBlock(prev, m), last = !sameBlock(m, next);
          return (
            <div key={m.id}>
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="text-xs font-semibold text-muted-foreground bg-card/90 border border-border rounded-full px-3 py-1 shadow-sm">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <MessageBubble msg={m} mine={m.sender_id === user.id} isGroup={isGroup} first={first} last={last}
                onOpenActions={setActionMsg} onReact={onReact} />
            </div>
          );
        })}
        {typingUser && (
          <div data-testid="typing-indicator" className="flex items-center gap-2 px-3 mt-1">
            <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-bubble-in shadow-sm">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground ms-1">typing in {langByCode(typingUser.language).name}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && !loading && (
        <button data-testid="scroll-to-bottom" aria-label="Go to the latest message" onClick={() => { scrollToBottom(true); setNewBelow(0); }}
          className="absolute right-4 bottom-24 z-10 w-11 h-11 rounded-full bg-card border border-border shadow-lg flex items-center justify-center active:scale-95 transition">
          <ChevronDown className="w-6 h-6" />
          {newBelow > 0 && <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{newBelow}</span>}
        </button>
      )}

      {(reply || editing) && (
        <div className="px-4 py-2 flex items-center gap-2 bg-card border-t border-border">
          <div className="flex-1 min-w-0 text-sm border-s-2 border-primary ps-2">
            <div className="font-semibold text-primary flex items-center gap-1">
              {editing ? <><Pencil className="w-3.5 h-3.5" /> Editing message</> : `Reply to ${reply.sender_name}`}
            </div>
            <div className="text-muted-foreground truncate">{editing ? editing.original_text : reply.display_text}</div>
          </div>
          <button aria-label="Cancel" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" onClick={() => (editing ? cancelEdit() : setReply(null))}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="p-2.5 flex items-end gap-2 bg-background border-t border-border shrink-0">
        <div className="flex-1 flex items-end gap-0.5 bg-card rounded-3xl border border-border shadow-sm px-1.5 py-1 focus-within:ring-2 focus-within:ring-primary/30">
          <Popover>
            <PopoverTrigger asChild>
              <button data-testid="emoji-picker-button" aria-label="Emoji" className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0"><Smile className="w-6 h-6" /></button>
            </PopoverTrigger>
            <PopoverContent className="w-64 grid grid-cols-8 gap-1 p-2" side="top" align="start">
              {EMOJIS.map((e) => <button key={e} className="text-xl hover:bg-muted rounded p-1" onClick={() => setText((t) => t + e)}>{e}</button>)}
            </PopoverContent>
          </Popover>
          <textarea
            ref={taRef}
            data-testid="message-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isTouchDevice()) { e.preventDefault(); send(); }
              if (e.key === "Escape" && editing) cancelEdit();
            }}
            placeholder={editing ? "Edit your message" : `Message in ${langByCode(user.language).name}`}
            rows={1}
            enterKeyHint="send"
            className="flex-1 resize-none max-h-32 px-1.5 py-2.5 bg-transparent text-base outline-none min-w-0 leading-snug"
          />
          {!editing && (
            <button aria-label="Attach a file" className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
          )}
          <input type="file" ref={fileRef} hidden onChange={onFile} />
        </div>
        <button data-testid="send-message-button" aria-label={editing ? "Save" : "Send"} onClick={send} disabled={!text.trim()}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md transition active:scale-95 disabled:opacity-40 disabled:shadow-none">
          {editing ? <Pencil className="w-5 h-5" /> : <Send className="w-5 h-5 -ml-0.5" />}
        </button>
      </div>

      <MessageActions msg={actionMsg} mine={actionMsg?.sender_id === user.id} userId={user.id} onClose={() => setActionMsg(null)}
        onReply={(m) => { setEditing(null); setReply(m); taRef.current?.focus(); }} onEdit={startEdit} onReact={onReact} />
    </div>
  );
}
