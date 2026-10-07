import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCheck, Globe, RotateCw, Copy, Trash2, Reply, Mic } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode, isRTL } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function MessageBubble({ msg, mine, onReply }) {
  const { user } = useAuth();
  const [showOriginal, setShowOriginal] = useState(false);
  const translating = msg.status === "translating" && !msg.is_translated && !mine;
  const failed = msg.status === "translation_failed" && !mine;
  const bodyText = showOriginal ? msg.original_text : msg.display_text;
  const rtl = showOriginal ? isRTL(msg.original_language) : (msg.is_translated ? isRTL(user.language) : isRTL(msg.original_language));
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isVoice = msg.attachment?.is_voice;

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const retry = async () => { await api.post(`/messages/${msg.id}/retry`); toast("Retrying translation..."); };
  const del = async (forAll) => { await api.delete(`/messages/${msg.id}?for_all=${forAll}`); };

  if (msg.deleted_for_all) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} px-2`} data-testid={`message-bubble-${msg.id}`}>
        <div className="max-w-[75%] px-3.5 py-2.5 rounded-2xl bg-muted text-muted-foreground text-[15px] italic">This message was deleted</div>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-2 px-2 ${mine ? "justify-end" : "justify-start"}`} data-testid={`message-bubble-${msg.id}`}>
      {!mine && (
        <Avatar className="w-8 h-8 shrink-0 mb-1">
          <AvatarImage src={msg.sender_avatar} />
          <AvatarFallback className="text-[11px]">{(msg.sender_name || "?").slice(0, 2)}</AvatarFallback>
        </Avatar>
      )}

      <div className={`relative max-w-[80%] sm:max-w-[68%] ${mine ? "order-1" : ""}`}>
        {msg.reply_to_preview && (
          <div className="text-xs px-3 py-1.5 mb-1 rounded-lg bg-muted/70 border-s-2 border-primary text-muted-foreground truncate">
            {msg.reply_to_preview}
          </div>
        )}
        <div className={`px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm ${mine
          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-md"
          : "bg-card border border-border rounded-2xl rounded-tl-md"}`}
          dir={rtl ? "rtl" : "ltr"}>

          {!mine && msg.sender_name && msg.chat_is_group && (
            <div className="text-xs font-semibold text-primary mb-0.5">{msg.sender_name}</div>
          )}

          {msg.attachment?.is_image && (
            <img src={`${API}/files/${msg.attachment.id}`} alt={msg.attachment.filename}
              className="rounded-xl mb-1.5 max-h-72 object-cover w-full" />
          )}
          {isVoice && (
            <div className="flex items-center gap-2 mb-1.5 min-w-52">
              <Mic className="w-4 h-4 shrink-0 opacity-80" />
              <audio controls src={`${API}/files/${msg.attachment.id}`} className="h-9 w-full" style={{ maxWidth: 240 }} data-testid={`voice-player-${msg.id}`} />
            </div>
          )}
          {msg.attachment && !msg.attachment.is_image && !isVoice && (
            <a href={`${API}/files/${msg.attachment.id}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 mb-1.5 underline text-sm">📎 {msg.attachment.filename}</a>
          )}

          {translating ? (
            <div data-testid="translating-indicator" className="flex items-center gap-2 py-0.5 opacity-80">
              <Globe className="w-4 h-4 animate-spin" />
              <span className="text-sm italic">{msg.original_text || "transcribing voice..."}</span>
            </div>
          ) : (bodyText ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={showOriginal ? "o" : "t"} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
                className="whitespace-pre-wrap break-words">
                {isVoice && <span className="text-xs italic opacity-70 me-1">🗣</span>}{bodyText}
              </motion.p>
            </AnimatePresence>
          ) : (isVoice && msg.status === "transcription_failed" ? (
            <span className="text-sm italic opacity-70">Couldn't transcribe this voice message</span>
          ) : null))}

          <div className={`flex items-center gap-1.5 justify-end mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            <span className="text-[11px]">{time}</span>
            {mine && (msg.read ? <CheckCheck className="w-4 h-4" /> : <Check className="w-4 h-4" />)}
          </div>
        </div>

        {!mine && msg.is_translated && !translating && (
          <button data-testid={`translation-toggle-badge-${msg.id}`} onClick={() => setShowOriginal((s) => !s)}
            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent text-accent-foreground hover:opacity-80 transition">
            <Globe className="w-3 h-3" />
            {showOriginal ? "Show translation" : `Translated from ${langByCode(msg.translated_from).name}`}
          </button>
        )}
        {failed && (
          <button onClick={retry} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition">
            <RotateCw className="w-3 h-3" /> Translation unavailable · Retry
          </button>
        )}

        <div className={`absolute top-0 ${mine ? "left-0 -translate-x-full" : "right-0 translate-x-full"} opacity-0 group-hover:opacity-100 transition`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-7 h-7 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-muted-foreground">⋯</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              <DropdownMenuItem onClick={() => onReply(msg)}><Reply className="w-4 h-4 mr-2" /> Reply</DropdownMenuItem>
              {msg.original_text && <DropdownMenuItem onClick={() => copy(msg.original_text)}><Copy className="w-4 h-4 mr-2" /> Copy original</DropdownMenuItem>}
              {msg.is_translated && <DropdownMenuItem onClick={() => copy(msg.display_text)}><Copy className="w-4 h-4 mr-2" /> Copy translation</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => del(false)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete for me</DropdownMenuItem>
              {mine && <DropdownMenuItem onClick={() => del(true)} className="text-destructive"><Trash2 className="w-4 h-4 mr-2" /> Delete for everyone</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
