import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { enablePush, pushState } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const KEY = "glott_push_prompt_dismissed";
const dismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

// A small card at the top of the chat list: ask once for permission to send notifications.
export default function PushPrompt() {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const [hidden, setHidden] = useState(dismissed());
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushState().then(setState); }, []);
  if (hidden || !(state === "off" || state === "needs-install")) return null;

  const hide = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); };
  const enable = async () => {
    setBusy(true);
    try { await enablePush(); toast.success(t("Notifications are on")); setState("on"); }
    catch { toast.error(t("Notifications were not allowed on this device")); hide(); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid="push-prompt" className="mx-4 mt-1 mb-2 p-3.5 rounded-2xl bg-label text-label-foreground flex items-center gap-3">
      <div className="flex-1 min-w-0 leading-snug">
        <div className="text-[15px] font-bold">{t("Turn on notifications")}</div>
        <div className="text-[13px]">
          {state === "needs-install"
            ? t("Add Glotter to your Home Screen (Share → Add to Home Screen) to get notified.")
            : t("So you don't miss any reply.")}
        </div>
      </div>
      {state === "off" && <Button size="sm" className="rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 font-semibold" onClick={enable} disabled={busy} data-testid="push-enable">{t("Turn on")}</Button>}
      <button aria-label={t("Dismiss")} onClick={hide} className="w-7 h-7 rounded-full hover:bg-black/10 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
    </div>
  );
}
