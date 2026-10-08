import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { enablePush, pushState } from "@/lib/push";
import { Button } from "@/components/ui/button";

const KEY = "glott_push_prompt_dismissed";
const dismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

// A small card at the top of the chat list: ask once for permission to send notifications.
export default function PushPrompt() {
  const [state, setState] = useState(null);
  const [hidden, setHidden] = useState(dismissed());
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushState().then(setState); }, []);
  if (hidden || !(state === "off" || state === "needs-install")) return null;

  const hide = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); toast.success("Notifications are on"); setState("on"); }
    catch { toast.error("Notifications were not allowed on this device"); hide(); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="push-prompt" className="mx-3 mt-2 mb-1 p-3 rounded-2xl bg-accent text-accent-foreground flex items-center gap-3">
      <Bell className="w-5 h-5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm leading-snug">
        {state === "needs-install"
          ? <>Add glott to your Home Screen (<b>Share → Add to Home Screen</b>) to get notified.</>
          : <>Get a notification when someone writes to you.</>}
      </div>
      {state === "off" && <Button size="sm" className="rounded-full h-8" onClick={enable} disabled={busy} data-testid="push-enable">Turn on</Button>}
      <button aria-label="Dismiss" onClick={hide} className="w-7 h-7 rounded-full hover:bg-black/10 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
