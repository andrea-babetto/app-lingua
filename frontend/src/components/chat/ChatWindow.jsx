import { useRef, useState, useEffect } from "react";
import { Send, Smile, Paperclip, ArrowLeft, Info, X, Loader2, Languages, Settings2, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import MessageBubble from "@/components/chat/MessageBubble";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","🙏","👏","🔥","❤️","🎉","✅","💯","😅","🤝","👋","💪","🌍","☕","🚀"];
const TONES = { formal: "Formal", neutral: "Neutral", casual: "Casual" };

export default function ChatWindow({ chat, messages, onSend, onBack, typingUser, onToggleInfo, onToneChange, bottomRef }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [reply, setReply] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const taRef = useRef();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typingUser]);

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

  const other = chat.other_user;
  const subtitle = chat.type === "group"
    ? `${chat.members_info.length} members`
    : other?.online ? "online" : (other?.last_seen ? "last seen recently" : langByCode(other?.language).name);

  return (
    <div className="h-full w-full flex-1 min-w-0 flex flex-col bg-[hsl(var(--muted))]/30">
      {/* header */}
      <div className="h-16 px-3 flex items-center gap-3 border-b border-border bg-card/90 backdrop-blur-md shrink-0">
        <Button data-testid="mobile-back-button" variant="ghost" size="icon" className="md:hidden" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <Avatar className="w-10 h-10"><AvatarImage src={chat.display_avatar} /><AvatarFallback>{chat.display_name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{chat.display_name}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
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
        {chat.type === "direct" && other && (
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-full bg-muted">
            <Languages className="w-3.5 h-3.5" /> {langByCode(other.language).flag} {langByCode(other.language).name}
          </div>
        )}
        <Button data-testid="toggle-info-panel-button" variant="ghost" size="icon" onClick={onToggleInfo}><Info className="w-5 h-5" /></Button>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto chat-scroll py-4 space-y-2">
        {messages.map((m) => (
          <MessageBubble key={m.id} msg={m} mine={m.sender_id === user.id} showOriginalPref={user.settings?.show_original} onReply={setReply} />
        ))}
        {typingUser && (
          <div data-testid="typing-indicator" className="flex items-center gap-2 px-3">
            <Avatar className="w-6 h-6"><AvatarImage src={typingUser.avatar} /><AvatarFallback className="text-[9px]">{typingUser.name?.slice(0,2)}</AvatarFallback></Avatar>
            <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-card border border-border">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[11px] text-muted-foreground ms-1">typing in {langByCode(typingUser.language).name}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* reply preview */}
      {reply && (
        <div className="px-4 py-2 flex items-center gap-2 bg-muted/60 border-t border-border">
          <div className="flex-1 min-w-0 text-xs border-s-2 border-primary ps-2">
            <div className="font-medium text-primary">Reply to {reply.sender_name}</div>
            <div className="text-muted-foreground truncate">{reply.display_text}</div>
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setReply(null)}><X className="w-4 h-4" /></Button>
        </div>
      )}

      {/* input */}
      <div className="p-3 border-t border-border bg-card flex items-end gap-2 shrink-0">
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
          onChange={(e) => { setText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Message in ${langByCode(user.language).name}...`}
          rows={1}
          className="flex-1 resize-none max-h-32 px-3 py-2 rounded-xl bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button data-testid="send-message-button" size="icon" className="shrink-0" onClick={send} disabled={!text.trim()}><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
