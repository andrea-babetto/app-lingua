import { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { ArrowUp, Smile, Plus, Paperclip, BarChart3, ChevronLeft, MoreHorizontal, X, Loader2, Search, ChevronDown, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MessageBubble from "@/components/chat/MessageBubble";
import { avatarClass, initials } from "@/lib/avatar";
import { timeIn, offsetFromHere, useMinuteTick } from "@/lib/localTime";
import MessageActions from "@/components/chat/MessageActions";
import { PollDialog } from "@/components/chat/Poll";
import MessageInfo from "@/components/chat/MessageInfo";
import { ScheduleDialog, ScheduledList, ScheduledActions } from "@/components/chat/Scheduled";
import { useI18n } from "@/i18n";
import VoiceRecorder, { canRecord } from "@/components/chat/VoiceRecorder";
import Dictation from "@/components/chat/Dictation";
import { useConfig } from "@/lib/config";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","🙏","👏","🔥","❤️","🎉","✅","💯","😅","🤝","👋","💪","🌍","☕","🚀"];
const GROUP_GAP_MS = 5 * 60 * 1000;
const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

const dayLabel = (iso, t, lang) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return t("Today");
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t("Yesterday");
  return d.toLocaleDateString(lang, { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};

const draftKey = (id) => `glott_draft_${id}`;
const readDraft = (id) => { try { return localStorage.getItem(draftKey(id)) || ""; } catch { return ""; } };
const writeDraft = (id, v) => { try { v ? localStorage.setItem(draftKey(id), v) : localStorage.removeItem(draftKey(id)); } catch { /* storage blocked */ } };

// The banner "You write in Italian · James reads in English": shown in every chat until it is closed with its X, then
// never again in that chat (remembered on this device).
const bannerKey = (id) => `glott_lang_banner_${id}`;
const bannerClosed = (id) => { try { return !!localStorage.getItem(bannerKey(id)); } catch { return false; } };
const closeBanner = (id) => { try { localStorage.setItem(bannerKey(id), "1"); } catch { /* storage blocked */ } };

const headerBtn = "w-10 h-10 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-muted active:bg-muted transition shrink-0";

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

export default function ChatWindow({ chat, messages, loading, onSend, onSentMessage, onEdit, onReact, onBack, typingUser, onToggleInfo, bottomRef, openSearchSignal = 0 }) {
  const { user } = useAuth();
  const { t, lang, langName } = useI18n();
  const [text, setText] = useState(() => readDraft(chat.id));
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);
  const [originals, setOriginals] = useState({}); // message ids shown in their original language
  const toggleOriginal = (id) => setOriginals((o) => ({ ...o, [id]: !o[id] }));
  const [uploading, setUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { if (openSearchSignal > 0) setSearchOpen(true); }, [openSearchSignal]);
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
  const cfg = useConfig();
  const voiceOn = !!cfg.voice_messages && canRecord();
  const [sendingVoice, setSendingVoice] = useState(false);

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

  const sendVoice = async (blob, secs, type) => {
    const replyId = reply?.id;
    setReply(null);
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("chat_id", chat.id);
    form.append("duration", Math.max(0.1, secs).toFixed(1));
    if (replyId) form.append("reply_to", replyId);
    form.append("file", blob, `voice.${ext}`);
    setSendingVoice(true);
    try { const { data } = await api.post("/voice", form); onSentMessage?.(data); }
    catch { toast.error(t("Voice message not sent")); }
    finally { setSendingVoice(false); }
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (editing) {
      const id = editing.id;
      setEditing(null); setText(readDraft(chat.id));
      try { await onEdit(id, t); } catch (e) { toast.error(e.response?.data?.detail || t("Could not edit the message")); }
      return;
    }
    setText("");
    writeDraft(chat.id, "");
    const replyId = reply?.id;
    setReply(null);
    await onSend({ text: t, reply_to: replyId });
    if (!isTouchDevice()) taRef.current?.focus();
  };

  // ---- scheduled messages: hold the send button (or right-click it) to choose when the message leaves
  const [scheduled, setScheduled] = useState([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedAction, setSchedAction] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const holdTimer = useRef(null);
  const held = useRef(false);
  useEffect(() => {
    let live = true;
    setScheduled([]);
    api.get(`/scheduled/${chat.id}`).then(({ data }) => { if (live) setScheduled(data); }).catch(() => {});
    const onSent = (e) => { if (e.detail?.chat_id === chat.id) setScheduled((list) => list.filter((x) => x.id !== e.detail.id)); };
    window.addEventListener("glott:scheduled-sent", onSent);
    return () => { live = false; window.removeEventListener("glott:scheduled-sent", onSent); };
  }, [chat.id]);
  const canSchedule = () => !!text.trim() && !editing;
  const holdStart = () => {
    held.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { if (canSchedule()) { held.current = true; navigator.vibrate?.(10); setScheduleOpen(true); } }, 450);
  };
  const holdEnd = () => clearTimeout(holdTimer.current);
  const schedErr = (e) => toast.error(t(errText(e.response?.data?.detail)));
  const pickTime = async (when) => {
    setScheduleOpen(false);
    try {
      if (rescheduling) {
        const { data } = await api.put(`/scheduled/${rescheduling.id}`, { send_at: when.toISOString() });
        setScheduled((list) => list.map((x) => (x.id === data.id ? data : x)).sort((a, b) => a.send_at.localeCompare(b.send_at)));
        setRescheduling(null);
      } else {
        const { data } = await api.post("/scheduled", { chat_id: chat.id, text: text.trim(), send_at: when.toISOString(), reply_to: reply?.id || null });
        setScheduled((list) => [...list, data].sort((a, b) => a.send_at.localeCompare(b.send_at)));
        setText(""); writeDraft(chat.id, ""); setReply(null);
        setTimeout(() => scrollToBottom(true), 50);  // show the new waiting message
      }
      toast.success(t("Message scheduled"));
    } catch (e) { schedErr(e); setRescheduling(null); }
  };
  const sendNow = async (s) => {
    setSchedAction(null);
    try { await api.post(`/scheduled/${s.id}/send-now`); setScheduled((list) => list.filter((x) => x.id !== s.id)); } catch (e) { schedErr(e); }
  };
  const deleteScheduled = async (s) => {
    setSchedAction(null);
    try { await api.delete(`/scheduled/${s.id}`); setScheduled((list) => list.filter((x) => x.id !== s.id)); } catch (e) { schedErr(e); }
  };

  // ---- polls (groups): "+" offers "Photo or file" and "Poll"
  const [pollOpen, setPollOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const createPoll = async (poll) => {
    try {
      await api.post("/polls", { chat_id: chat.id, ...poll });
      setPollOpen(false);
      setTimeout(() => scrollToBottom(true), 80);
    } catch (e) { toast.error(t(errText(e.response?.data?.detail))); }
  };
  const vote = async (m, optionIds) => {
    try { await api.post(`/messages/${m.id}/vote`, { option_ids: optionIds }); }
    catch (e) { toast.error(t(errText(e.response?.data?.detail))); }
  };

  const startReply = (msg) => { setEditing(null); setReply(msg); taRef.current?.focus(); };
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
    } catch { toast.error(t("Upload failed")); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const runSearch = async (v) => {
    setSq(v);
    if (!v.trim()) return setSres([]);
    try { const { data } = await api.get(`/messages/${chat.id}/search`, { params: { q: v } }); setSres(data); }
    catch { setSres([]); }
  };

  const other = chat.other_user;
  useMinuteTick();
  const showTime = !isGroup && other?.timezone && user.settings?.local_time_enabled !== false && offsetFromHere(other.timezone);
  const status = isGroup
    ? t("{count} members", { count: chat.members_info.length })
    : other?.online ? t("online") : (other?.last_seen ? t("last seen recently") : langName(other?.language));
  const subtitle = showTime ? `${status} · ${t("{time} local time", { time: timeIn(other.timezone, lang) })}` : status;

  const [bannerOn, setBannerOn] = useState(() => !bannerClosed(chat.id));
  const showBanner = bannerOn && !loading && (isGroup || (other?.language && other.language !== user.language));

  const latestMineId = [...messages].reverse().find((m) => m.sender_id === user.id)?.id;
  // Read = everyone else in the chat has read it (the server keeps who read each message; a live receipt sets m.read).
  const others = Math.max(1, (chat.members_info?.length || 2) - 1);
  // The quote above a reply: the original in the reader's language when it is loaded, otherwise the copy saved with the reply.
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  const quoteFor = (m) => {
    if (!m.reply_to) return null;
    const q = byId[m.reply_to], saved = m.reply_quote;
    if (!q && !saved) return null;
    const senderId = q ? q.sender_id : saved.sender_id;
    const name = senderId === user.id ? t("You") : (q ? q.sender_name : saved.sender_name);
    const deleted = q ? q.deleted_for_all : saved.deleted;
    const isImage = q ? q.attachment?.is_image : saved.is_image;
    const text = deleted ? t("🚫 This message was deleted") : ((q ? q.display_text : saved.text) || (isImage ? "📷" : "📎"));
    return { id: m.reply_to, name, text, deleted };
  };
  const jumpTo = (id) => {
    const el = scrollRef.current?.querySelector(`[data-testid="message-bubble-${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("gl-flash");
    setTimeout(() => el.classList.remove("gl-flash"), 1400);
  };
  const isRead = (m) => !!m.read || (m.read_by || []).filter((id) => id !== m.sender_id).length >= others;
  const isDelivered = (m) => Object.keys(m.delivered_to || {}).filter((id) => id !== m.sender_id).length >= others;
  const [infoMsg, setInfoMsg] = useState(null);

  const sameBlock = (a, b) => a && b && a.sender_id === b.sender_id && !a.deleted_for_all && !b.deleted_for_all
    && new Date(a.created_at).toDateString() === new Date(b.created_at).toDateString()
    && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < GROUP_GAP_MS;

  return (
    <div className="h-full w-full flex-1 min-w-0 flex flex-col bg-background relative">
      <header className="h-[4.5rem] ps-3 pe-3 flex items-center gap-2 bg-card text-foreground border-b border-[var(--gl-line)] shrink-0 z-10">
        <button data-testid="mobile-back-button" aria-label={t("Back")} className={`${headerBtn} md:hidden`} onClick={onBack}><ChevronLeft className="w-[18px] h-[18px] rtl:rotate-180" /></button>
        <button className="flex items-center gap-3 flex-1 min-w-0 text-start h-full md:ps-2" onClick={onToggleInfo}>
          <Avatar className={`w-10 h-10 ${isGroup ? "rounded-xl" : ""}`}>
            <AvatarImage src={chat.display_avatar} />
            <AvatarFallback className={`font-semibold ${avatarClass(chat.display_name)} ${isGroup ? "rounded-xl" : ""}`}>{(isGroup && chat.emoji) || initials(chat.display_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-base font-medium truncate leading-tight">{chat.display_name}</div>
            {typingUser
              ? <div data-testid="header-typing" className="text-xs text-[var(--gl-typing)] font-medium truncate">{t("typing in {language}", { language: langName(typingUser.language) })}…</div>
              : <div className={`text-xs truncate ${!isGroup && other?.online ? "text-online" : "text-subtle"}`}>{subtitle}</div>}
          </div>
        </button>
        <button data-testid="search-messages-button" aria-label={t("Search")} className={headerBtn} onClick={() => { setSearchOpen((v) => !v); setSq(""); setSres([]); }}><Search className="w-[18px] h-[18px]" /></button>
        <button data-testid="toggle-info-panel-button" aria-label={t("Chat info")} className={headerBtn} onClick={onToggleInfo}><MoreHorizontal className="w-5 h-5" /></button>
        <button data-testid="close-chat-button" aria-label={t("Close")} title={t("Close")} className={`${headerBtn} hidden md:flex`} onClick={onBack}><X className="w-[18px] h-[18px]" /></button>
      </header>

      {searchOpen && (
        <div className="border-b border-border bg-card p-3 space-y-2" data-testid="message-search-panel">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input data-testid="message-search-input" className="ps-9 h-10 rounded-full" placeholder={t("Search in this conversation...")} value={sq} onChange={(e) => runSearch(e.target.value)} autoFocus />
          </div>
          {sq && (
            <div className="max-h-56 overflow-y-auto chat-scroll space-y-1">
              {sres.length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">{t("No matches")}</p>}
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

      {isGroup && (chat.join_requests || []).length > 0 && (
        <button data-testid="join-requests-banner" onClick={onToggleInfo}
          className="shrink-0 w-full px-4 py-2 bg-label text-label-foreground text-sm font-semibold text-start flex items-center justify-between gap-2">
          <span className="truncate">{chat.join_requests.length === 1
            ? t("{name} asks to join", { name: chat.join_requests[0].name })
            : t("{count} people ask to join", { count: chat.join_requests.length })}</span>
          <span className="underline shrink-0">{t("See")}</span>
        </button>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto chat-scroll chat-wallpaper py-3 relative">
        {/* on a computer the conversation keeps a reading width in the middle, as Telegram does */}
        <div className="mx-auto w-full max-w-[40rem] h-full">
        {loading && <MessageSkeleton />}
        {!loading && messages.length === 0 && (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center text-sm text-muted-foreground bg-card/90 border border-border rounded-2xl px-5 py-4 shadow-sm max-w-xs">
              {t("Say hello 👋")}<br />{t("Write in your language — {name} reads it in theirs.", { name: other?.name || t("everyone") })}
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
                  <span className="text-xs text-subtle bg-card border border-border rounded-full px-3 py-1">{dayLabel(m.created_at, t, lang)}</span>
                </div>
              )}
              <MessageBubble msg={m} read={isRead(m)} delivered={isDelivered(m)} quote={quoteFor(m)} onJump={jumpTo} onVote={vote} mine={m.sender_id === user.id} isGroup={isGroup} other={other} first={first} last={last} latestMine={m.id === latestMineId}
                showOriginal={!!originals[m.id]} onToggleOriginal={() => toggleOriginal(m.id)}
                onOpenActions={setActionMsg} onReact={onReact} onReply={startReply} />
            </div>
          );
        })}
        <ScheduledList items={scheduled} onOpen={setSchedAction} />
        {typingUser && (
          <div data-testid="typing-indicator" className="gl-msg-in flex flex-col items-start gap-1 px-3 mt-2">
            {isGroup && <span className="ps-1 text-xs font-medium text-subtle">{(typingUser.name || "").split(" ")[0]}</span>}
            <span className="h-10 px-4 flex items-center gap-[5px] rounded-[18px] rounded-es-[6px] bg-bubble-in border border-border" aria-hidden="true">
              <span className="typing-dot w-2 h-2 rounded-full bg-sand" />
              <span className="typing-dot w-2 h-2 rounded-full bg-sand" />
              <span className="typing-dot w-2 h-2 rounded-full bg-sand" />
            </span>
            <span className="ps-1 text-[11px] text-subtle">{t("typing in {language}", { language: langName(typingUser.language) })}…</span>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {!atBottom && !loading && (
        <button data-testid="scroll-to-bottom" aria-label={t("Go to the latest message")} onClick={() => { scrollToBottom(true); setNewBelow(0); }}
          className="absolute end-4 bottom-20 z-10 w-11 h-11 rounded-full bg-card border border-border shadow-lg flex items-center justify-center active:scale-95 transition">
          <ChevronDown className="w-6 h-6" />
          {newBelow > 0 && <span className="absolute -top-2 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-sand text-[var(--gl-on-accent)] text-xs font-semibold flex items-center justify-center">{newBelow}</span>}
        </button>
      )}

      {showBanner && (
        <div className="chat-wallpaper shrink-0 flex justify-center px-3 pt-1 pb-2">
          <div data-testid="language-banner" className="max-w-full h-9 ps-1 pe-1.5 rounded-full bg-[var(--gl-tint)] shadow-[0_4px_14px_rgba(0,0,0,0.06)] flex items-center gap-2 text-[13px]">
            <span className="w-7 h-7 shrink-0 rounded-full bg-[#1a1a1a] text-[var(--gl-accent)] text-[10px] font-semibold flex items-center justify-center">{(user.language || "").toUpperCase()}</span>
            <span className="truncate">{isGroup
              ? t("You write in {language} · everyone reads in their own", { language: langName(user.language) })
              : t("You write in {mine} · {name} reads in {theirs}", { mine: langName(user.language), name: (other?.name || "").split(" ")[0], theirs: langName(other?.language) })}</span>
            <button type="button" data-testid="language-banner-close" aria-label={t("Close")} onClick={() => { closeBanner(chat.id); setBannerOn(false); }}
              className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {(reply || editing) && (
        <div className="px-4 md:px-[max(1rem,calc((100%_-_40rem)/2))] py-2 flex items-center gap-2 bg-card border-t border-border">
          <div className="flex-1 min-w-0 text-sm border-s-2 border-primary ps-2">
            <div className="font-semibold text-primary flex items-center gap-1">
              {editing ? <><Pencil className="w-3.5 h-3.5" /> {t("Editing message")}</> : t("Reply to {name}", { name: reply.sender_name })}
            </div>
            <div className="text-muted-foreground truncate">{editing ? editing.original_text : reply.display_text}</div>
          </div>
          <button aria-label={t("Cancel")} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" onClick={() => (editing ? cancelEdit() : setReply(null))}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="relative px-2.5 md:px-[max(0.625rem,calc((100%_-_40rem)/2))] py-2 flex items-end gap-1.5 bg-card border-t border-[var(--gl-line)] shrink-0">
        {!editing && !isGroup && (
          <button data-testid="attach-button" aria-label={t("Attach a file")} onClick={() => fileRef.current?.click()} disabled={uploading}
            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
          </button>
        )}
        {!editing && isGroup && (
          <Popover open={plusOpen} onOpenChange={setPlusOpen}>
            <PopoverTrigger asChild>
              <button data-testid="attach-button" aria-label={t("Attach a file")} disabled={uploading}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted shrink-0">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56 p-1.5">
              <button data-testid="plus-file" onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted text-[15px]"><Paperclip className="w-5 h-5 text-muted-foreground" /> {t("Photo or file")}</button>
              <button data-testid="plus-poll" onClick={() => { setPlusOpen(false); setPollOpen(true); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted text-[15px]"><BarChart3 className="w-5 h-5 text-muted-foreground" /> {t("Poll")}</button>
            </PopoverContent>
          </Popover>
        )}
        <input type="file" ref={fileRef} hidden onChange={onFile} />
        <div className="relative flex-1 flex items-end bg-surface rounded-[22px] ps-4 pe-1 focus-within:ring-2 focus-within:ring-primary/25 min-w-0">
          <textarea
            ref={taRef}
            data-testid="message-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isTouchDevice()) { e.preventDefault(); send(); }
              if (e.key === "Escape" && editing) cancelEdit();
            }}
            placeholder={editing ? t("Edit your message") : t("Write in {language}", { language: langName(user.language) })}
            rows={1}
            enterKeyHint="send"
            className="flex-1 resize-none max-h-32 py-2.5 bg-transparent text-base outline-none min-w-0 leading-snug placeholder:text-subtle"
          />
          {cfg.dictation && canRecord() && (
            <Dictation maxSeconds={cfg.voice_max_seconds || 120} onText={(words) => setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${words}` : words))} />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button data-testid="emoji-picker-button" aria-label={t("Emoji")} className="w-9 h-10 rounded-full flex items-center justify-center text-subtle hover:text-foreground shrink-0"><Smile className="w-5 h-5" /></button>
            </PopoverTrigger>
            <PopoverContent className="w-64 grid grid-cols-8 gap-1 p-2" side="top" align="end">
              {EMOJIS.map((e) => <button key={e} className="text-xl hover:bg-muted rounded p-1" onClick={() => setText((t) => t + e)}>{e}</button>)}
            </PopoverContent>
          </Popover>
        </div>
        {voiceOn && !editing && !text.trim() ? (
          <VoiceRecorder maxSeconds={cfg.voice_max_seconds || 120} rtl={document.documentElement.dir === "rtl"} busy={sendingVoice} onRecorded={sendVoice} />
        ) : (
        <button data-testid="send-message-button" aria-label={editing ? t("Save") : t("Send")} disabled={!text.trim()}
          onClick={() => { if (held.current) { held.current = false; return; } send(); }}
          onPointerDown={holdStart} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
          onContextMenu={(e) => { e.preventDefault(); if (canSchedule()) setScheduleOpen(true); }}
          className="w-10 h-10 mb-0.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 transition active:scale-95 disabled:opacity-40">
          {editing ? <Check className="w-5 h-5" /> : <ArrowUp className="w-5 h-5" strokeWidth={2.6} />}
        </button>
        )}
      </div>

      {infoMsg && <MessageInfo msg={messages.find((x) => x.id === infoMsg.id) || infoMsg} chat={chat} onClose={() => setInfoMsg(null)} />}
      <PollDialog open={pollOpen} onClose={() => setPollOpen(false)} onCreate={createPoll} />
      <ScheduleDialog open={scheduleOpen} onClose={() => { setScheduleOpen(false); setRescheduling(null); }} onPick={pickTime}
        other={!isGroup && user.settings?.local_time_enabled !== false ? other : null} initial={rescheduling?.send_at} />
      <ScheduledActions item={schedAction} onClose={() => setSchedAction(null)} onSendNow={sendNow} onDelete={deleteScheduled}
        onChangeTime={(s) => { setSchedAction(null); setRescheduling(s); setScheduleOpen(true); }} />
      <MessageActions msg={actionMsg} mine={actionMsg?.sender_id === user.id} userId={user.id} onClose={() => setActionMsg(null)}
        onReply={startReply} onEdit={startEdit} onReact={onReact} onInfo={setInfoMsg}
        onShowOriginal={(m) => toggleOriginal(m.id)} showingOriginal={!!(actionMsg && originals[actionMsg.id])} />
    </div>
  );
}
