import { useRef, useState, useEffect } from "react";
import { Send, Smile, Paperclip, ArrowLeft, Info, X, Loader2, Languages, Settings2, Check, Mic, Trash, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import MessageBubble from "@/components/chat/MessageBubble";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","🙏","👏","🔥","❤️","🎉","✅","💯","😅","🤝","👋","💪","🌍","☕","🚀"];
const TONES = { formal: "Formal", neutral: "Neutral", casual: "Casual" };

const dayLabel = (iso) => {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
};

export default function ChatWindow({ chat, messages, onSend, onBack, typingUser, onToggleInfo, onToneChange, bottomRef }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [reply, setReply] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sq, setSq] = useState("");
  const [sres, setSres] = useState([]);
  const fileRef = useRef();
  const taRef = useRef();
  const mediaRef = useRef();
  const chunksRef = useRef([]);
  const recTimer = useRef();
  const isGroup = chat.type === "group";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typingUser, bottomRef]);
  useEffect(() => () => clearInterval(recTimer.current), []);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await onSend({ text: t, reply_to: reply?.id });
    setReply(null);
    taRef.current?.focus();
  };

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

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) await sendVoice(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecSecs(0);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch { toast.error("Microphone access denied"); }
  };

  const stopRec = () => { clearInterval(recTimer.current); mediaRef.current?.stop(); setRecording(false); };
  const cancelRec = () => {
    clearInterval(recTimer.current);
    if (mediaRef.current) { mediaRef.current.onstop = () => mediaRef.current.stream?.getTracks().forEach((t) => t.stop()); try { mediaRef.current.stop(); } catch {} }
    chunksRef.current = [];
    setRecording(false);
  };

  const sendVoice = async (blob) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("chat_id", chat.id);
      fd.append("file", blob, "voice.webm");
      await api.post("/voice", fd, { headers: { "Content-Type": "multipart/form-data" } });
    } catch { toast.error("Voice message failed"); }
    finally { setUploading(false); }
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

  return (
    <div className="h-full w-full flex-1 min-w-0 flex flex-col bg-[hsl(var(--muted))]/30">
      <div className="h-16 px-3 flex items-center gap-3 border-b border-border bg-card/90 backdrop-blur-md shrink-0">
        <Button data-testid="mobile-back-button" variant="ghost" size="icon" className="md:hidden" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onToggleInfo}>
          <Avatar className="w-11 h-11"><AvatarImage src={chat.display_avatar} /><AvatarFallback>{chat.display_name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold truncate">{chat.display_name}</div>
            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
          </div>
        </button>
        <Button data-testid="search-messages-button" variant="ghost" size="icon" onClick={() => { setSearchOpen((v) => !v); setSq(""); setSres([]); }}><Search className="w-5 h-5" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="tone-selector-trigger" variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Settings2 className="w-3.5 h-3.5" /> {TONES[chat.tone] || "Neutral"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Translation tone</DropdownMenuLabel>
            {Object.entries(TONES).map(([k, label]) => (
              <DropdownMenuItem key={k} data-testid={`tone-option-${k}`} onClick={() => onToneChange(k)}>
                {chat.tone === k && <Check className="w-4 h-4 mr-2" />}
                <span className={chat.tone === k ? "font-medium" : "ms-6"}>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button data-testid="toggle-info-panel-button" variant="ghost" size="icon" onClick={onToggleInfo}><Info className="w-5 h-5" /></Button>
      </div>

      {searchOpen && (
        <div className="border-b border-border bg-card p-3 space-y-2" data-testid="message-search-panel">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input data-testid="message-search-input" className="pl-9" placeholder="Search in this conversation..." value={sq} onChange={(e) => runSearch(e.target.value)} autoFocus />
          </div>
          {sq && (
            <div className="max-h-56 overflow-y-auto chat-scroll space-y-1">
              {sres.length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">No matches</p>}
              {sres.map((m) => (
                <div key={m.id} data-testid={`search-match-${m.id}`} className="p-2 rounded-lg hover:bg-muted text-sm">
                  <div className="text-xs text-muted-foreground">{m.sender_name} · {new Date(m.created_at).toLocaleDateString()}</div>
                  <div className="truncate">{m.display_text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto chat-scroll chat-wallpaper py-4 space-y-2.5">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          return (
            <div key={m.id}>
              {showDay && (
                <div className="flex justify-center my-3">
                  <span className="text-xs font-medium text-muted-foreground bg-card/90 border border-border rounded-full px-3 py-1 shadow-sm">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <MessageBubble msg={{ ...m, chat_is_group: isGroup }} mine={m.sender_id === user.id} onReply={setReply} />
            </div>
          );
        })}
        {typingUser && (
          <div data-testid="typing-indicator" className="flex items-center gap-2 px-3">
            <Avatar className="w-6 h-6"><AvatarImage src={typingUser.avatar} /><AvatarFallback className="text-[9px]">{typingUser.name?.slice(0,2)}</AvatarFallback></Avatar>
            <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-card border border-border">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground ms-1">typing in {langByCode(typingUser.language).name}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {reply && (
        <div className="px-4 py-2 flex items-center gap-2 bg-muted/60 border-t border-border">
          <div className="flex-1 min-w-0 text-sm border-s-2 border-primary ps-2">
            <div className="font-medium text-primary">Reply to {reply.sender_name}</div>
            <div className="text-muted-foreground truncate">{reply.display_text}</div>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setReply(null)}><X className="w-4 h-4" /></Button>
        </div>
      )}

      <div className="p-3 border-t border-border bg-card flex items-end gap-2 shrink-0">
        {recording ? (
          <div className="flex-1 flex items-center gap-3 px-2">
            <span className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium tabular-nums">Recording {String(Math.floor(recSecs / 60)).padStart(2,"0")}:{String(recSecs % 60).padStart(2,"0")}</span>
            <Button variant="ghost" size="icon" className="ms-auto text-destructive" onClick={cancelRec} data-testid="cancel-recording-button"><Trash className="w-5 h-5" /></Button>
            <Button size="icon" onClick={stopRec} data-testid="stop-recording-button"><Send className="w-4 h-4" /></Button>
          </div>
        ) : (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button data-testid="emoji-picker-button" variant="ghost" size="icon" className="shrink-0"><Smile className="w-5 h-5" /></Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 grid grid-cols-8 gap-1 p-2" side="top" align="start">
                {EMOJIS.map((e) => <button key={e} className="text-xl hover:bg-muted rounded p-1" onClick={() => setText((t) => t + e)}>{e}</button>)}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </Button>
            <input type="file" ref={fileRef} hidden onChange={onFile} />
            <textarea
              ref={taRef}
              data-testid="message-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message in ${langByCode(user.language).name}...`}
              rows={1}
              className="flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-xl bg-muted text-[15px] outline-none focus:ring-2 focus:ring-primary/40"
            />
            {text.trim() ? (
              <Button data-testid="send-message-button" size="icon" className="shrink-0" onClick={send}><Send className="w-4 h-4" /></Button>
            ) : (
              <Button data-testid="record-voice-button" size="icon" className="shrink-0" onClick={startRec} disabled={uploading}><Mic className="w-5 h-5" /></Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
