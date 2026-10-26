import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import LoginDemo from "@/components/LoginDemo";
import { returnTarget, rememberReturn, clearReturn } from "@/lib/returnTarget";
import GoogleSignIn from "@/components/GoogleSignIn";
import { useI18n } from "@/i18n";
import { LANGUAGES } from "@/data/languages";

// Remembers that this phone has already had an account, so the sign-in page opens straight on the form.
const SEEN = "glott_seen";
const seenBefore = () => { try { return !!localStorage.getItem(SEEN); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* storage blocked */ } };
// Coming back from the Terms or Privacy page: same screen as before, with the name and email already typed (never the password).
const FORM = "glott_form";
const comingBack = () => { const [page, view] = returnTarget().split(":"); return page === "login" ? view : ""; };
const savedForm = () => { try { return comingBack() ? JSON.parse(sessionStorage.getItem(FORM) || "{}") : {}; } catch { return {}; } };

export default function Login() {
  const { t, lang, setUiLang } = useI18n();
  const [view, setView] = useState(() => comingBack() || (seenBefore() ? "login" : "welcome")); // welcome | login | register
  const mode = view === "register" ? "register" : "login";
  const [form, setForm] = useState(() => ({ name: "", email: "", password: "", invite_code: "", ...savedForm() }));
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);  // "Forgot password?" only when the server can send emails
  const [resetSent, setResetSent] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const { auth } = useAuth();
  const nav = useNavigate();
  useEffect(() => { clearReturn(); try { sessionStorage.removeItem(FORM); } catch { /* storage blocked */ } }, []);
  const toLegal = () => { rememberReturn(`login:${view}`); try { sessionStorage.setItem(FORM, JSON.stringify({ name: form.name, email: form.email })); } catch { /* storage blocked */ } };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : form;
      const { data } = await api.post(url, payload);
      auth(data);
      markSeen();
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
      setPasswordReset(!!data.password_reset);
    }).catch(() => {});
  }, []);

  const googleCredential = async (credential) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { credential, invite_code: form.invite_code });
      auth(data);
      markSeen();
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

  const consent = (
    <p className="text-xs text-center text-muted-foreground leading-relaxed" data-testid="welcome-consent">
      {t("By creating an account you agree to the [Terms of Service] and the [Privacy Policy].").split(/\[(.*?)\]/).map((part, i) =>
        i % 2 ? <Link key={i} to={i === 1 ? "/terms" : "/privacy"} onClick={toLegal} className="underline font-semibold">{part}</Link> : part)}
    </p>
  );
  const languageMenu = (
    <select data-testid="ui-language-select" aria-label="Language" value={lang} onChange={(e) => setUiLang(e.target.value)}
      className="max-w-[11rem] h-9 rounded-full border border-border bg-background text-sm font-semibold px-3 outline-none focus:border-primary">
      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.native}</option>)}
    </select>
  );

  const askReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot", { email: form.email });
      setResetSent(true);
    } catch (err) {
      toast.error(errText(err.response?.data?.detail) || t("Failed"));
    } finally { setLoading(false); }
  };

  if (view === "forgot") {
    return (
      <div className="min-h-dvh bg-background flex justify-center px-6 pt-5 pb-8">
        <div className="w-full max-w-sm flex flex-col" data-testid="forgot-page">
          <div className="flex items-center justify-between">
            <button type="button" data-testid="forgot-back" onClick={() => { setView("login"); setResetSent(false); }} className="h-9 -ms-2 px-2 inline-flex items-center gap-1.5 text-[15px] font-semibold"><ArrowLeft className="w-5 h-5 rtl:rotate-180" /> {t("Back")}</button>
            {languageMenu}
          </div>
          <h1 className="mt-6 text-[25px] leading-snug font-semibold tracking-tight">{t("Forgot your password?")}</h1>
          {resetSent ? (
            <p data-testid="forgot-sent" className="mt-3 text-[15px] leading-relaxed">{t("If there is an account with this email, the link is on its way. Check your inbox, and also the spam folder.")}</p>
          ) : (
            <form onSubmit={askReset} className="flex-1 flex flex-col">
              <p className="mt-2 text-[15px] leading-snug text-muted-foreground">{t("Write the email of your account: we will send you a link to choose a new password.")}</p>
              <label className="block mt-7"><span className={label}>{t("Email")}</span>
                <Input data-testid="forgot-email" className={field} type="email" value={form.email} required autoComplete="email" onChange={set("email")} /></label>
              <div className="mt-auto pt-10">
                <Button data-testid="forgot-send" type="submit" className="w-full h-[52px] rounded-2xl text-base font-semibold" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Send link")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (view === "welcome") {
    return (
      <div className="min-h-dvh bg-background flex justify-center px-6 pt-5 pb-8">
        <div className="w-full max-w-sm flex flex-col" data-testid="welcome-page">
          <div className="flex justify-end">{languageMenu}</div>
          <div className="mt-8">
            <Logo height={44} />
            <h1 className="mt-5 text-[25px] leading-snug font-semibold tracking-tight">{t("One language: yours.")}</h1>
            <p className="mt-2 text-[15px] leading-snug text-muted-foreground">{t("Talk to anyone in the world: everyone writes and reads in their own language.")}</p>
            <LoginDemo always />
          </div>
          <div className="mt-auto pt-8 space-y-3">
            <Button data-testid="welcome-register" className="w-full h-[54px] rounded-2xl text-base font-semibold" onClick={() => setView("register")}>{t("Create your account")}</Button>
            {googleClientId && !inviteRequired && <GoogleSignIn clientId={googleClientId} onCredential={googleCredential} />}
            <button type="button" data-testid="welcome-login" onClick={() => setView("login")} className="w-full h-10 text-[15px] font-semibold">{t("I already have an account")}</button>
            {consent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background flex justify-center px-6 pt-5 pb-8">
      <div className="w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between">
          {mode === "register"
            ? <button type="button" data-testid="auth-back" onClick={() => setView("welcome")} className="h-9 -ms-2 px-2 inline-flex items-center gap-1.5 text-[15px] font-semibold"><ArrowLeft className="w-5 h-5 rtl:rotate-180" /> {t("Back")}</button>
            : <span />}
          {languageMenu}
        </div>

        <div className="mt-8 mb-7">
          {mode === "login" && <Logo height={44} />}
          <h1 data-testid="auth-title" className={`${mode === "login" ? "mt-5" : "mt-6"} text-[25px] leading-snug font-semibold tracking-tight`}>
            {mode === "login" ? t("Welcome back.") : t("Create your account")}
          </h1>
          <p className="mt-2 text-[15px] leading-snug text-muted-foreground">
            {mode === "login" ? t("Sign in to pick up your conversations.") : t("It takes 30 seconds.")}
          </p>
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
            {mode === "login" && passwordReset && (
              <button type="button" data-testid="forgot-link" onClick={() => setView("forgot")} className="-mt-1 text-sm text-muted-foreground font-semibold hover:text-foreground">
                {t("Forgot password?")}
              </button>
            )}
            {mode === "register" && !inviteRequired && !showInvite && (
              <button type="button" data-testid="show-invite-button" onClick={() => setShowInvite(true)} className="text-sm text-primary font-semibold">
                {t("Have an invite code?")}
              </button>
            )}
            {mode === "register" && (inviteRequired || showInvite) && (
              <label className="block"><span className={label}>{t("Invite code")}</span>
                <Input data-testid="invite-input" className={field} value={form.invite_code} required autoComplete="off" onChange={set("invite_code")} /></label>
            )}
            {mode === "register" && (
              <p data-testid="consent-line" className="text-xs text-muted-foreground leading-relaxed">
                {t("By creating an account you agree to the [Terms of Service] and the [Privacy Policy].").split(/\[(.*?)\]/).map((part, i) =>
                  i % 2 ? <Link key={i} to={i === 1 ? "/terms" : "/privacy"} onClick={toLegal} className="text-primary font-semibold underline">{part}</Link> : part)}
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
              <button type="button" data-testid="toggle-auth-mode" className="text-primary font-bold" onClick={() => setView(mode === "login" ? "register" : "login")}>
                {mode === "login" ? t("Sign up") : t("Sign in")}
              </button>
            </p>
            <p className="text-xs text-center text-muted-foreground space-x-3 rtl:space-x-reverse">
              <Link to="/terms" onClick={toLegal} className="underline">{t("Terms of Service")}</Link>
              <Link to="/privacy" onClick={toLegal} className="underline">{t("Privacy Policy")}</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
