import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Eye, EyeOff, Loader2, Lock, Mail, MoreHorizontal, User2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { WelcomePreview, InvitePreview } from "@/components/WelcomeHero";
import { returnTarget, rememberReturn, clearReturn } from "@/lib/returnTarget";
import GoogleSignIn from "@/components/GoogleSignIn";
import Logo from "@/components/Logo";
import HowItWorksLink from "@/components/HowItWorks";
import EmailCodeFlow from "@/components/EmailCodeFlow";
import { useI18n } from "@/i18n";
import { LANGUAGES } from "@/data/languages";
import { pendingInvite, clearInvite } from "@/lib/invite";

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
  const [view, setView] = useState(() => comingBack() || (pendingInvite() ? "invite" : seenBefore() ? "login" : "welcome")); // welcome | invite | login | register | forgot
  const mode = view === "register" ? "register" : "login";
  const [form, setForm] = useState(() => ({ name: "", email: "", password: "", invite_code: "", ...savedForm() }));
  const [agreed, setAgreed] = useState(() => !!savedForm().agreed);  // the one checkbox for the Terms and the Privacy Policy
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [emailCode, setEmailCode] = useState(false);  // the server can send codes by email: new accounts use them, no password
  const [useCode, setUseCode] = useState(false);  // on the sign-in page: a code by email instead of the password
  const [codeStep, setCodeStep] = useState("email");  // where the email-code flow is: past the first step, Google steps aside
  const [googleClientId, setGoogleClientId] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [passwordReset, setPasswordReset] = useState(false);  // "Forgot password?" only when the server can send emails
  const [resetSent, setResetSent] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState(null);  // the friend or group whose link brought the person here
  const inviteCode = invite ? pendingInvite() : "";
  const codeNeeded = inviteRequired && !(invite && !invite.needs_code);  // a friend's link is the invitation
  useEffect(() => {
    const code = pendingInvite();
    if (!code) return;
    api.get(`/invite/${encodeURIComponent(code)}`).then(({ data }) => setInvite(data)).catch((e) => { if (e.response?.status === 404) { clearInvite(); setView((v) => (v === "invite" ? "welcome" : v)); } });
  }, []);
  const { auth } = useAuth();
  const nav = useNavigate();
  useEffect(() => { clearReturn(); try { sessionStorage.removeItem(FORM); } catch { /* storage blocked */ } }, []);
  const toLegal = () => { rememberReturn(`login:${view}`); try { sessionStorage.setItem(FORM, JSON.stringify({ name: form.name, email: form.email, agreed })); } catch { /* storage blocked */ } };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : { ...form, invite_link: inviteCode, accept_terms: agreed };
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
      setEmailCode(!!data.email_code);
    }).catch(() => {});
  }, []);

  const googleCredential = async (credential) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { credential, invite_code: form.invite_code, invite_link: inviteCode, accept_terms: agreed });
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

  // the design of 28/10/2026: white page, round buttons with a thin border at the top, centred title, pill fields
  // with the label above, and the main button that lights up when the form is filled in
  const label = "block text-sm font-medium mb-2";
  const pill = "flex items-center gap-2.5 h-12 rounded-full border border-border bg-background px-4 focus-within:border-foreground";
  const bare = "flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-subtle";
  const round = "w-10 h-10 shrink-0 rounded-full border border-border bg-background inline-flex items-center justify-center";
  const main = "w-full h-[50px] rounded-full text-[15px] font-medium bg-sand text-[var(--gl-on-accent)] hover:bg-sand/90 disabled:opacity-100 disabled:bg-surface disabled:text-subtle";

  // One checkbox for the Terms and the Privacy Policy: the server records which version was accepted, and when.
  const consent = (testId) => (
    <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground cursor-pointer">
      <input type="checkbox" data-testid="consent-checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
        className="mt-0.5 w-[18px] h-[18px] shrink-0 accent-[var(--gl-accent)] cursor-pointer" />
      <span data-testid={testId}>
        {t("I agree to the [Terms of Service] and the [Privacy Policy].").split(/\[(.*?)\]/).map((part, i) =>
          i % 2 ? <Link key={i} to={i === 1 ? "/terms" : "/privacy"} onClick={toLegal} className="underline text-foreground">{part}</Link> : part)}
      </span>
    </label>
  );
  // ••• in a circle: the interface language (the real menu lies on top of the circle, invisible, so it opens the phone's own list)
  const languageMenu = (
    <span className={`relative ${round}`} title={t("Language")}>
      <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
      <select data-testid="ui-language-select" aria-label={t("Language")} value={lang} onChange={(e) => setUiLang(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.native}</option>)}
      </select>
    </span>
  );
  const back = (to, testid, after) => (
    <button type="button" data-testid={testid} onClick={() => { setView(to); after?.(); }} aria-label={t("Back")} className={round}>
      <ChevronLeft className="w-[18px] h-[18px] rtl:rotate-180" />
    </button>
  );
  const page = (children, top) => (
    <div className="min-h-dvh bg-background flex justify-center">
      <div className="w-full max-w-md min-h-dvh flex flex-col px-5 pt-5 pb-8">
        <div className="flex items-center justify-between min-h-10">{top}</div>
        {children}
      </div>
    </div>
  );
  const heading = (title, sub) => (
    <div className="mt-6 text-center">
      <h1 data-testid="auth-title" className="text-[25px] leading-tight font-medium tracking-tight">{title}</h1>
      {sub && <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
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
    return page(
      <div className="flex-1 flex flex-col" data-testid="forgot-page">
        {heading(t("Forgot your password?"), resetSent ? "" : t("Write the email of your account: we will send you a link to choose a new password."))}
        {resetSent ? (
          <p data-testid="forgot-sent" className="mt-6 text-[15px] leading-relaxed text-center">{t("If there is an account with this email, the link is on its way. Check your inbox, and also the spam folder.")}</p>
        ) : (
          <form onSubmit={askReset} className="flex-1 flex flex-col">
            <label className="block mt-8"><span className={label}>{t("Email")}</span>
              <span className={pill}><Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                <input data-testid="forgot-email" className={bare} type="email" value={form.email} required autoComplete="email" placeholder="name@email.com" onChange={set("email")} /></span></label>
            <div className="mt-auto pt-10">
              <Button data-testid="forgot-send" type="submit" className={main} disabled={loading || !form.email}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Send link")}
              </Button>
            </div>
          </form>
        )}
      </div>,
      <>{back("login", "forgot-back", () => setResetSent(false))}{languageMenu}</>
    );
  }

  if (view === "welcome" || view === "invite") {
    const person = invite?.kind === "person";
    if (view === "invite" && invite) return page(
      <div className="flex-1 flex flex-col" data-testid="welcome-page">
        <InvitePreview invite={invite} />
        <div className="mt-6 text-center">
          <h1 data-testid="invite-title" className="text-[25px] leading-tight font-medium tracking-tight">{person ? t("{name} invited you to Glotter", { name: invite.name }) : t("You are invited to the group {name}", { name: invite.name })}</h1>
          <p className="mt-2.5 text-[17px] leading-relaxed text-muted-foreground">{t("You'll forget you speak different languages.")}</p>
          {!person && <p className="mt-2 text-[14px] leading-relaxed text-subtle">{t("After you sign up, an admin of the group will let you in.")}</p>}
        </div>
        <div className="mt-auto pt-8 flex flex-col items-center gap-4">
          <Button data-testid="invite-accept" className={main} onClick={() => setView("register")}>{t("Accept the invite")}</Button>
          <button type="button" data-testid="welcome-login" className="text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setView("login")}>{t("I already have an account")}</button>
        </div>
      </div>,
      <><span />{languageMenu}</>
    );
    // The presentation: the logo, one sentence, two ways in, "See how it works" and a phone with a chat.
    return (
      <div className="min-h-dvh bg-background flex justify-center overflow-hidden">
        <div className="w-full max-w-md min-h-dvh flex flex-col px-5 pt-5" data-testid="welcome-page">
          <div className="relative flex items-center justify-center min-h-10">
            <Logo height={26} />
            <span className="absolute end-0 top-0">{languageMenu}</span>
          </div>
          <div className="mt-6 text-center">
            <h1 className="text-[36px] leading-[1.08] font-medium tracking-[-0.02em]">{t("Everyone in their own language")}.</h1>
            <p className="mt-3.5 text-[17px] leading-relaxed text-muted-foreground">{t("You write in your language, your friends read in theirs.")}</p>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Button data-testid="welcome-register" className="h-12 px-6 rounded-full text-base font-medium bg-sand text-[var(--gl-on-accent)] hover:bg-sand/90" onClick={() => setView("register")}>{t("Create your account")}</Button>
            <Button data-testid="welcome-login" variant="outline" className="h-12 px-6 rounded-full text-base font-medium" onClick={() => setView("login")}>{t("Sign in")}</Button>
          </div>
          <div className="mt-4 flex justify-center"><HowItWorksLink /></div>
          <div className="mt-auto pt-6"><WelcomePreview /></div>
        </div>
      </div>
    );
  }

  const ready = form.email && form.password.length >= 8 && (mode === "login" || (form.name.trim() && agreed));
  return page(
    <div className="flex-1 flex flex-col">
      {heading(mode === "login" ? t("Welcome back.") : t("Create your account"),
        mode === "login" ? t("Sign in with your email or with Google to find your chats.") : t("It takes 30 seconds. Then choose your language and start chatting."))}

      {/* Google first (one tap, the email is already confirmed by Google), then the email */}
      {googleClientId && !codeNeeded && codeStep === "email" && (
        <div className="mt-7">
          {mode === "register" && <div className="mb-5">{consent("consent-line")}</div>}
          {/* a new account with Google also needs the box ticked first */}
          <div className={`flex justify-center ${mode === "register" && !agreed ? "opacity-40 pointer-events-none" : ""}`} aria-disabled={mode === "register" && !agreed}>
            <GoogleSignIn clientId={googleClientId} onCredential={googleCredential} />
          </div>
          <div className="mt-6 flex items-center gap-3 text-[13px] text-subtle" aria-hidden="true"><span className="flex-1 h-px bg-border" />{t("or")}<span className="flex-1 h-px bg-border" /></div>
        </div>
      )}

      {mode === "register" && (codeNeeded || (showInvite && !invite)) && emailCode && (
        <label className="block mt-6"><span className={label}>{t("Invite code")}</span>
          <span className={pill}><input data-testid="invite-input" className={bare} value={form.invite_code} required autoComplete="off" onChange={set("invite_code")} /></span></label>
      )}

      {emailCode && (mode === "register" || useCode) ? (
        <EmailCodeFlow key={mode} initialEmail={form.email} inviteCode={form.invite_code} inviteLink={inviteCode} agreed={agreed}
          consent={(id) => (googleClientId && !codeNeeded && codeStep === "email" ? null : consent(id))} onStep={setCodeStep} styles={{ label, pill, bare, main }}
          onDone={(data) => { auth(data); markSeen(); nav(data.user.language ? "/" : "/onboarding"); }} />
      ) : (
        <form onSubmit={submit} className="mt-7 flex-1 flex flex-col">
          <div className="space-y-[18px]">
            {mode === "register" && (
              <label className="block"><span className={label}>{t("Your name")}</span>
                <span className={pill}><User2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <input data-testid="name-input" className={bare} value={form.name} required autoComplete="name" onChange={set("name")} /></span></label>
            )}
            <label className="block"><span className={label}>{t("Email")}</span>
              <span className={pill}><Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                <input data-testid="email-input" className={bare} type="email" value={form.email} required autoComplete="email" placeholder="name@email.com" onChange={set("email")} /></span></label>
            <label className="block"><span className={label}>{t("Password")}</span>
              <span className={pill}><Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                <input data-testid="password-input" className={bare} type={showPw ? "text" : "password"} value={form.password} required minLength={8} maxLength={72}
                  autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={set("password")} />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t("Hide password") : t("Show password")} className="text-subtle hover:text-foreground">
                  {showPw ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button></span></label>
            {mode === "login" && (passwordReset || emailCode) && (
              <p className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                {emailCode && <button type="button" data-testid="use-code-link" onClick={() => setUseCode(true)} className="font-medium text-foreground">{t("Sign in with a code by email")}</button>}
                {passwordReset && <button type="button" data-testid="forgot-link" onClick={() => setView("forgot")} className="font-medium text-muted-foreground">{t("Forgot password?")}</button>}
              </p>
            )}
            {mode === "register" && !codeNeeded && !invite && !showInvite && (
              <p className="text-center"><button type="button" data-testid="show-invite-button" onClick={() => setShowInvite(true)} className="text-sm font-medium">{t("Have an invite code?")}</button></p>
            )}
            {mode === "register" && (codeNeeded || (showInvite && !invite)) && (
              <label className="block"><span className={label}>{t("Invite code")}</span>
                <span className={pill}><input data-testid="invite-input" className={bare} value={form.invite_code} required autoComplete="off" onChange={set("invite_code")} /></span></label>
            )}
          </div>

          <div className="mt-auto pt-10 space-y-3.5">
            {mode === "register" && !(googleClientId && !codeNeeded) && consent("consent-line")}
            <Button data-testid="submit-auth-button" type="submit" className={main} disabled={loading || !ready}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? t("Sign in") : t("Create account")}
            </Button>
          </div>
        </form>
      )}

      {mode === "login" && useCode && (
        <p className="mt-4 text-sm text-center"><button type="button" data-testid="use-password-link" onClick={() => setUseCode(false)} className="font-medium">{t("Use my password")}</button></p>
      )}
      <p className="mt-4 text-sm text-center text-muted-foreground">
        {mode === "login" ? t("No account?") : t("Have an account?")}{" "}
        <button type="button" data-testid="toggle-auth-mode" className="font-medium text-foreground" onClick={() => setView(mode === "login" ? "register" : "login")}>
          {mode === "login" ? t("Sign up") : t("Sign in")}
        </button>
      </p>
    </div>,
    <>{back(invite ? "invite" : "welcome", "auth-back")}{languageMenu}</>
  );
}
