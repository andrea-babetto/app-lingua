import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, Globe, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { api, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode, isRTL } from "@/data/languages";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div data-testid="lightbox" onClick={onClose} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in">
      <button aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded-lg" />
    </div>,
    document.body,
  );
}

export default function MessageBubble({ msg, mine, isGroup, first, last, onOpenActions, onReact }) {
  const { user } = useAuth();
  const [showOriginal, setShowOriginal] = useState(false);
  const [zoom, setZoom] = useState(false);
  const translating = msg.status === "translating" && !msg.is_translated && !mine;
  const failed = msg.status === "translation_failed" && !mine;
  const bodyText = showOriginal ? msg.original_text : msg.display_text;
  const rtl = showOriginal ? isRTL(msg.original_language) : (msg.is_translated ? isRTL(user.language) : isRTL(msg.original_language));
  const time = new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const reactions = Object.entries(msg.reactions || {});

  const retry = async (e) => { e.stopPropagation(); await api.post(`/messages/${msg.id}/retry`); toast("Retrying translation..."); };

  if (msg.deleted_for_all) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"} px-3 ${last ? "mb-1.5" : "mb-0.5"}`} data-testid={`message-bubble-${msg.id}`}>
        <div className="max-w-[75%] px-3.5 py-2 rounded-2xl bg-muted/80 text-muted-foreground text-sm italic">🚫 This message was deleted</div>
      </div>
    );
  }

  const radius = mine
    ? `rounded-2xl ${last ? "rounded-br-md" : ""}`
    : `rounded-2xl ${last ? "rounded-bl-md" : ""}`;

  return (
    <div className={`flex items-end gap-2 px-3 ${mine ? "justify-end" : "justify-start"} ${last ? "mb-1.5" : "mb-0.5"}`} data-testid={`message-bubble-${msg.id}`}>
      {!mine && isGroup && (
        <div className="w-8 shrink-0">
          {last && (
            <Avatar className="w-8 h-8">
              <AvatarImage src={msg.sender_avatar} />
              <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-semibold">{(msg.sender_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={`max-w-[82%] sm:max-w-[68%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
        {msg.reply_to_preview && (
          <div className="text-xs px-3 py-1.5 mb-1 rounded-xl bg-muted/80 border-s-2 border-primary text-muted-foreground truncate max-w-full">
            {msg.reply_to_preview}
          </div>
        )}

        <div role="button" tabIndex={0} onClick={() => onOpenActions(msg)}
          onKeyDown={(e) => { if (e.key === "Enter") onOpenActions(msg); }}
          className={`relative px-3.5 py-2 text-[15px] leading-relaxed cursor-pointer select-text shadow-sm max-w-full ${radius} ${mine
            ? "bg-bubble-out text-bubble-out-foreground"
            : "bg-bubble-in text-foreground"}`}
          dir={rtl ? "rtl" : "ltr"}>

          {!mine && isGroup && first && msg.sender_name && (
            <div className="text-xs font-bold text-primary mb-0.5">{msg.sender_name}</div>
          )}

          {msg.attachment?.is_image && (
            <img src={`${API}/files/${msg.attachment.id}`} alt={msg.attachment.filename} loading="lazy"
              onClick={(e) => { e.stopPropagation(); setZoom(true); }}
              className="rounded-xl mb-1.5 max-h-72 object-cover w-full cursor-zoom-in" />
          )}
          {msg.attachment && !msg.attachment.is_image && !msg.attachment.is_voice && (
            <a href={`${API}/files/${msg.attachment.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 mb-1.5 underline text-sm break-all">📎 {msg.attachment.filename}</a>
          )}

          {msg.call ? (
            <div className="flex flex-col gap-2 py-0.5" dir="ltr">
              <span className="font-semibold">📹 Video call</span>
              <a data-testid={`join-call-${msg.id}`} href={msg.call.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-bold shadow-sm hover:opacity-90">Join</a>
            </div>
          ) : translating ? (
            <div data-testid="translating-indicator" className="flex items-center gap-2 py-0.5 opacity-80">
              <Globe className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-sm italic">{msg.original_text}</span>
            </div>
          ) : (bodyText ? (
            <p className="whitespace-pre-wrap break-words">{bodyText}</p>
          ) : null)}

          <div className={`flex items-center gap-1 justify-end mt-0.5 text-[11px] ${mine ? "text-bubble-out-foreground/60" : "text-muted-foreground"}`}>
            {msg.edited && <span>edited</span>}
            <span>{time}</span>
            {mine && (msg.read ? <CheckCheck className="w-4 h-4 text-primary" /> : <Check className="w-4 h-4" />)}
          </div>
        </div>

        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 -mt-1.5 mb-0.5 px-1.5 relative z-10">
            {reactions.map(([emoji, users]) => (
              <button key={emoji} data-testid={`reaction-${emoji}`} onClick={() => onReact(msg, emoji)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-card border shadow-sm ${users.includes(user.id) ? "border-primary" : "border-border"}`}>
                <span className="text-sm leading-none">{emoji}</span>{users.length > 1 && <span className="font-semibold">{users.length}</span>}
              </button>
            ))}
          </div>
        )}

        {!mine && msg.is_translated && !translating && (
          <button data-testid={`translation-toggle-badge-${msg.id}`} onClick={() => setShowOriginal((s) => !s)}
            className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-accent text-accent-foreground hover:opacity-80 transition">
            <Globe className="w-3 h-3" />
            {showOriginal ? "Show translation" : `Translated from ${langByCode(msg.translated_from).name}`}
          </button>
        )}
        {failed && (
          <button onClick={retry} className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/15 text-destructive hover:bg-destructive/25 transition">
            <RotateCw className="w-3 h-3" /> Translation unavailable · Retry
          </button>
        )}
      </div>

      {zoom && <Lightbox src={`${API}/files/${msg.attachment.id}`} alt={msg.attachment.filename} onClose={() => setZoom(false)} />}
    </div>
  );
}
