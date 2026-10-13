import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import GoogleSignIn from "@/components/GoogleSignIn";
import { useI18n } from "@/i18n";
import { LANGUAGES } from "@/data/languages";

export default function Login() {
  const { t, lang, setUiLang } = useI18n();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", invite_code: "" });
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const { auth } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : form;
      const { data } = await api.post(url, payload);
      auth(data);
      nav(data.user.language ? "/" : "/onboarding");
    } catch (err) {
      toast.error(errText(err.response?.data?.detail) || t("Failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/config").then(({ data }) => {
      setGoogleClientId(data.google_client_id || "");
      setInviteRequired(!!data.invite_required);
    }).catch(() => {});
  }, []);

  const googleCredential = async (credential) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { credential, invite_code: form.invite_code });
      auth(data);
      nav(data.user.language ? "/" : "/onboarding");
    } catch (err) {
      toast.error(errText(err.response?.data?.detail) || t("Google sign-in failed"));
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const field = "h-12 rounded-[14px] border-[1.5px] border-border bg-background px-4 text-base shadow-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12";
  const label = "block text-[13px] font-semibold text-muted-foreground mb-1.5";

  return (
    <div className="min-h-dvh bg-background flex justify-center px-6 pt-5 pb-8">
      <div className="w-full max-w-sm flex flex-col">
        <div className="flex justify-end">
          <select data-testid="ui-language-select" aria-label="Language" value={lang} onChange={(e) => setUiLang(e.target.value)}
            className="max-w-[11rem] h-9 rounded-full border border-border bg-background text-sm font-semibold px-3 outline-none focus:border-primary">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.native}</option>)}
          </select>
        </div>

        <div className="mt-12 mb-9">
          <Logo className="text-[44px]" />
          <h1 className="mt-5 text-[23px] leading-snug font-semibold tracking-tight">
            {t("Every message gets a reply, in every language.")}
          </h1>
        </div>

        <form onSubmit={submit} className="flex-1 flex flex-col">
          <div className="space-y-4">
            {mode === "register" && (
              <label className="block"><span className={label}>{t("Your name")}</span>
                <Input data-testid="name-input" className={field} value={form.name} required autoComplete="name" onChange={set("name")} /></label>
            )}
            <label className="block"><span className={label}>{t("Email")}</span>
              <Input data-testid="email-input" className={field} type="email" value={form.email} required autoComplete="email" onChange={set("email")} /></label>
            <label className="block"><span className={label}>{t("Password")}</span>
              <span className="relative block">
                <Input data-testid="password-input" className={`${field} pe-11`} type={showPw ? "text" : "password"} value={form.password} required minLength={8} maxLength={72}
                  autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={set("password")} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t("Hide password") : t("Show password")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </span></label>
            {mode === "register" && inviteRequired && (
              <label className="block"><span className={label}>{t("Invite code")}</span>
                <Input data-testid="invite-input" className={field} value={form.invite_code} required autoComplete="off" onChange={set("invite_code")} /></label>
            )}
            {mode === "register" && (
              <p data-testid="consent-line" className="text-xs text-muted-foreground leading-relaxed">
                {t("By creating an account you agree to the [Terms of Service] and the [Privacy Policy].").split(/\[(.*?)\]/).map((part, i) =>
                  i % 2 ? <Link key={i} to={i === 1 ? "/terms" : "/privacy"} className="text-primary font-semibold underline">{part}</Link> : part)}
              </p>
            )}
          </div>

          <div className="mt-auto pt-10 space-y-4">
            <Button data-testid="submit-auth-button" type="submit" className="w-full h-[52px] rounded-2xl text-base font-semibold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? t("Sign in") : t("Create account")}
            </Button>
            {googleClientId && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> {t("or")} <div className="h-px flex-1 bg-border" />
                </div>
                <GoogleSignIn clientId={googleClientId} onCredential={googleCredential} />
              </>
            )}
            <p className="text-sm text-center text-muted-foreground">
              {mode === "login" ? t("No account?") : t("Have an account?")}{" "}
              <button type="button" data-testid="toggle-auth-mode" className="text-primary font-bold" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? t("Sign up") : t("Sign in")}
              </button>
            </p>
            <p className="text-xs text-center text-muted-foreground space-x-3 rtl:space-x-reverse">
              <Link to="/terms" className="underline">{t("Terms of Service")}</Link>
              <Link to="/privacy" className="underline">{t("Privacy Policy")}</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
