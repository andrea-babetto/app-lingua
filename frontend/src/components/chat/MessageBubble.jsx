import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCheck, Globe, RotateCw, Copy, Trash2, Reply } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { langByCode, isRTL } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function MessageBubble({ msg, mine, showOriginalPref, onReply }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const translating = msg.status === "translating" && !msg.is_translated && !mine;
  const failed = msg.status === "translation_failed" && !mine;
  const rtl = isRTL(showOriginal ? msg.original_language : (msg.is_translated ? (langByCode(msg.display_text) && msg.original_language) : msg.original_language));
  const bodyText = showOriginal ? msg.original_text : msg.display_text;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const retry = async () => { await api.post(`/messages/${msg.id}/retry`); toast("Retrying translation..."); };
  const del = async (forAll) => { await api.delete(`/messages/${msg.id}?for_all=${forAll}`); };

  if (msg.deleted_for_all) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} px-1`} data-testid={`message-bubble-${msg.id}`}>
        <div className="max-w-[75%] px-3 py-2 rounded-2xl bg-muted text-muted-foreground text-sm italic">This message was deleted</div>
      </div>
    );
  }

  return (
    <div className={`group flex items-end gap-2 px-1 ${mine ? "justify-end" : "justify-start"}`} data-testid={`message-bubble-${msg.id}`}>
      {!mine && (
        <Avatar className="w-7 h-7 shrink-0 mb-1">
          <AvatarImage src={msg.sender_avatar} />
          <AvatarFallback className="text-[10px]">{(msg.sender_name || "?").slice(0, 2)}</AvatarFallback>
        </Avatar>
      )}

      <div className={`relative max-w-[78%] sm:max-w-[65%] ${mine ? "order-1" : ""}`}>
        {msg.reply_to_preview && (
          <div className="text-[11px] px-3 py-1 mb-1 rounded-lg bg-muted/70 border-s-2 border-primary text-muted-foreground truncate">
            {msg.reply_to_preview}
          </div>
        )}
        <div className={`px-3.5 py-2 text-sm shadow-sm ${mine
          ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
          : "bg-card border border-border rounded-2xl rounded-tl-sm"}`}
          dir={rtl ? "rtl" : "ltr"}>

          {msg.attachment?.is_image && (
            <img src={`${API}/files/${msg.attachment.id}`} alt={msg.attachment.filename}
              className="rounded-lg mb-1.5 max-h-60 object-cover w-full" />
          )}
          {msg.attachment && !msg.attachment.is_image && (
            <a href={`${API}/files/${msg.attachment.id}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 mb-1.5 underline text-xs">📎 {msg.attachment.filename}</a>
          )}

          {translating ? (
            <div data-testid="translating-indicator" className="flex items-center gap-2 py-0.5 opacity-80">
              <Globe className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs italic">{msg.original_text}</span>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={showOriginal ? "o" : "t"} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
                className="whitespace-pre-wrap break-words leading-snug">
                {bodyText}
              </motion.p>
            </AnimatePresence>
          )}

          <div className={`flex items-center gap-1.5 justify-end mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            <span className="text-[10px]">{time}</span>
            {mine && (msg.read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
          </div>
        </div>

        {/* translation badge */}
        {!mine && msg.is_translated && !translating && (
          <button data-testid={`translation-toggle-badge-${msg.id}`} onClick={() => setShowOriginal((s) => !s)}
            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground hover:opacity-80 transition">
            <Globe className="w-3 h-3" />
            {showOriginal ? "Show translation" : `Translated from ${langByCode(msg.translated_from).name}`}
          </button>
        )}
        {failed && (
          <button onClick={retry} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition">
            <RotateCw className="w-3 h-3" /> Translation unavailable · Retry
          </button>
        )}

        {/* hover actions */}
        <div className={`absolute top-0 ${mine ? "left-0 -translate-x-full" : "right-0 translate-x-full"} opacity-0 group-hover:opacity-100 transition`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-6 h-6 rounded-full bg-muted hover:bg-accent flex items-center justify-center text-muted-foreground">⋯</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              <DropdownMenuItem onClick={() => onReply(msg)}><Reply className="w-4 h-4 mr-2" /> Reply</DropdownMenuItem>
              <DropdownMenuItem onClick={() => copy(msg.original_text)}><Copy className="w-4 h-4 mr-2" /> Copy original</DropdownMenuItem>
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
