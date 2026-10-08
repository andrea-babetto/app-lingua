import { Copy, Pencil, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const EDIT_MINUTES = 30;

export function canEdit(msg, mine) {
  if (!mine || msg.deleted_for_all || !msg.original_text || msg.attachment?.is_voice) return false;
  return Date.now() - new Date(msg.created_at).getTime() < EDIT_MINUTES * 60 * 1000;
}

function Row({ icon: Icon, label, onClick, danger, testId }) {
  return (
    <button data-testid={testId} onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-left active:bg-muted hover:bg-muted/70 ${danger ? "text-destructive" : ""}`}>
      <Icon className="w-5 h-5" /> {label}
    </button>
  );
}

// The menu that opens when you tap a message: reactions on top, then what you can do with it.
export default function MessageActions({ msg, mine, userId, onClose, onReply, onEdit, onReact }) {
  const open = !!msg;
  const done = (fn) => () => { onClose(); fn?.(); };
  const copy = (t) => { navigator.clipboard?.writeText(t).then(() => toast.success("Copied")).catch(() => {}); };
  const del = async (forAll) => {
    try { await api.delete(`/messages/${msg.id}?for_all=${forAll}`); } catch { toast.error("Could not delete"); }
  };
  const mineReaction = msg ? Object.entries(msg.reactions || {}).find(([, users]) => users.includes(userId))?.[0] : null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="p-0 rounded-t-3xl max-w-lg mx-auto gap-0 pb-3" data-testid="message-actions">
        <SheetTitle className="sr-only">Message actions</SheetTitle>
        <SheetDescription className="sr-only">Reactions and actions for this message</SheetDescription>
        {msg && (
          <>
            <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-around px-3 py-3 border-b border-border">
              {REACTIONS.map((e) => (
                <button key={e} data-testid={`react-${e}`} onClick={done(() => onReact(msg, e))}
                  className={`w-12 h-12 rounded-full text-2xl flex items-center justify-center transition active:scale-90 ${mineReaction === e ? "bg-accent ring-2 ring-primary" : "hover:bg-muted"}`}>{e}</button>
              ))}
            </div>
            <div className="py-1">
              <Row icon={Reply} label="Reply" testId="action-reply" onClick={done(() => onReply(msg))} />
              {canEdit(msg, mine) && <Row icon={Pencil} label="Edit" testId="action-edit" onClick={done(() => onEdit(msg))} />}
              {msg.original_text && <Row icon={Copy} label={msg.is_translated ? "Copy original" : "Copy"} testId="action-copy" onClick={done(() => copy(msg.original_text))} />}
              {msg.is_translated && <Row icon={Copy} label="Copy translation" testId="action-copy-translation" onClick={done(() => copy(msg.display_text))} />}
              <Row icon={Trash2} label="Delete for me" danger testId="action-delete-me" onClick={done(() => del(false))} />
              {mine && <Row icon={Trash2} label="Delete for everyone" danger testId="action-delete-all" onClick={done(() => del(true))} />}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
