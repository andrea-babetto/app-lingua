// The page the "forgot password" email links to (/reset?token=...): choose a new password, then you are signed in.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import { useI18n } from "@/i18n";

export default function ResetPassword() {
  const { t } = useI18n();
  const { auth } = useAuth();
  const nav = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(!token);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset", { token, new_password: pw });
      auth(data);
      try { localStorage.setItem("glott_seen", "1"); } catch { /* storage blocked */ }
      toast.success(t("Password changed"));
      nav(data.user.language ? "/" : "/onboarding", { replace: true });
    } catch (err) {
      if (err.response?.status === 400) setFailed(true);
      else toast.error(errText(err.response?.data?.detail) || t("Failed"));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh bg-background flex justify-center px-6 pt-10 pb-8">
      <div className="w-full max-w-sm flex flex-col" data-testid="reset-page">
        <Logo height={40} />
        <h1 className="mt-6 text-[25px] leading-snug font-semibold tracking-tight">{t("Choose a new password")}</h1>
        {failed ? (
          <div data-testid="reset-invalid" className="mt-3 space-y-4">
            <p className="text-[15px] leading-relaxed">{t("This link is no longer valid. Ask for a new one.")}</p>
            <Link to="/login" className="inline-block text-primary font-semibold underline">{t("Back to sign in")}</Link>
          </div>
        ) : (
          <form onSubmit={save} className="flex-1 flex flex-col">
            <p className="mt-2 text-[15px] text-muted-foreground">{t("At least 8 characters.")}</p>
            <label className="block mt-7"><span className="block text-[13px] font-semibold text-muted-foreground mb-1.5">{t("New password")}</span>
              <span className="relative block">
                <Input data-testid="reset-password" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} maxLength={72}
                  autoComplete="new-password" className="h-12 rounded-[14px] border-[1.5px] border-border bg-background px-4 pe-11 text-base" />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t("Hide password") : t("Show password")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </span></label>
            <div className="mt-auto pt-10">
              <Button data-testid="reset-save" type="submit" className="w-full h-[52px] rounded-2xl text-base font-semibold" disabled={busy || pw.length < 8}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Save and sign in")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
