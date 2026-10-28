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
  const { t, lang, setUiLang, langName } = useI18n();
  const [view, setView] = useState(() => comingBack() || (pendingInvite() ? "invite" : seenBefore() ? "login" : "welcome")); // welcome | invite | login | register | forgot
  const mode = view === "register" ? "register" : "login";
  const [form, setForm] = useState(() => ({ name: "", email: "", password: "", invite_code: "", ...savedForm() }));
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [method, setMethod] = useState("email");  // email | google (the two tabs on the sign-in and sign-up pages)
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
  const toLegal = () => { rememberReturn(`login:${view}`); try { sessionStorage.setItem(FORM, JSON.stringify({ name: form.name, email: form.email })); } catch { /* storage blocked */ } };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : { ...form, invite_link: inviteCode };
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
      const { data } = await api.post("/auth/google", { credential, invite_code: form.invite_code, invite_link: inviteCode });
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
  // with the label above, and the main button that turns yellow when the form is filled in
  const label = "block text-sm font-medium mb-2";
  const pill = "flex items-center gap-2.5 h-12 rounded-full border border-border bg-background px-4 focus-within:border-foreground";
  const bare = "flex-1 min-w-0 bg-transparent outline-none text-[15px] placeholder:text-subtle";
  const round = "w-10 h-10 shrink-0 rounded-full border border-border bg-background inline-flex items-center justify-center";
  const main = "w-full h-[50px] rounded-full text-[15px] font-medium bg-sand text-[#1a1a1a] hover:bg-sand/90 disabled:opacity-100 disabled:bg-surface disabled:text-subtle";
  const ghost = "w-full h-[50px] rounded-full text-[15px] font-medium border border-border bg-background text-foreground hover:bg-surface";

  const consent = (testId) => (
    <p className="text-xs text-center text-subtle leading-relaxed" data-testid={testId}>
      {t("By creating an account you agree to the [Terms of Service] and the [Privacy Policy].").split(/\[(.*?)\]/).map((part, i) =>
        i % 2 ? <Link key={i} to={i === 1 ? "/terms" : "/privacy"} onClick={toLegal} className="underline text-muted-foreground">{part}</Link> : part)}
    </p>
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
    return page(
      <div className="flex-1 flex flex-col" data-testid="welcome-page">
        {view === "invite" && invite ? <InvitePreview invite={invite} /> : <WelcomePreview />}
        <div className="mt-6 text-center">
          {view === "invite" && invite ? (
            <>
              <h1 className="text-[25px] leading-tight font-medium tracking-tight">{person ? t("{name} invited you to Glotter", { name: invite.name }) : t("You are invited to the group {name}", { name: invite.name })}</h1>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                {person
                  ? <>{invite.language && <>{t("{name} writes in {language}, you read in yours.", { name: invite.name, language: langName(invite.language) })} </>}{t("Create your account and you will find {name} in your chats.", { name: invite.name })}</>
                  : t("After you sign up, an admin of the group will let you in.")}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-[25px] leading-tight font-medium tracking-tight">{t("Welcome to Glotter")}</h1>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{t("You write in your language, your friends read in theirs.")}<br />{t("Everyone in their own language, in 41 languages.")}</p>
            </>
          )}
        </div>
        <div className="mt-auto pt-8 space-y-2.5">
          {view === "invite" && invite ? (
            <>
              <Button data-testid="invite-accept" className={main} onClick={() => setView("register")}>{t("Accept the invite")}</Button>
              <Button data-testid="welcome-login" variant="outline" className={ghost} onClick={() => setView("login")}>{t("I already have an account")}</Button>
            </>
          ) : (
            <>
              <Button data-testid="welcome-login" className={main} onClick={() => setView("login")}>{t("Sign in")}</Button>
              <Button data-testid="welcome-register" variant="outline" className={ghost} onClick={() => setView("register")}>{t("Create your account")}</Button>
            </>
          )}
        </div>
      </div>,
      <><span />{languageMenu}</>
    );
  }

  const ready = form.email && form.password.length >= 8 && (mode === "login" || form.name.trim());
  return page(
    <div className="flex-1 flex flex-col">
      {heading(mode === "login" ? t("Welcome back.") : t("Create your account"),
        mode === "login" ? t("Sign in with your email or with Google to find your chats.") : t("It takes 30 seconds. Then choose your language and start chatting."))}

      {googleClientId && !codeNeeded && (
        <div className="mt-7 grid grid-cols-2 gap-2" role="tablist">
          {[["email", t("Email")], ["google", "Google"]].map(([id, name]) => (
            <button key={id} type="button" role="tab" aria-selected={method === id} data-testid={`method-${id}`} onClick={() => setMethod(id)}
              className={`h-11 rounded-full text-[15px] font-medium ${method === id ? "bg-primary text-primary-foreground" : "border border-border"}`}>{name}</button>
          ))}
        </div>
      )}

      {method === "google" && googleClientId && !codeNeeded ? (
        <div className="mt-7 flex-1 flex flex-col">
          <div className="flex justify-center"><GoogleSignIn clientId={googleClientId} onCredential={googleCredential} /></div>
          {mode === "register" && <div className="mt-6">{consent("consent-line")}</div>}
        </div>
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
            {mode === "login" && passwordReset && (
              <p className="text-center text-sm text-muted-foreground">
                <button type="button" data-testid="forgot-link" onClick={() => setView("forgot")} className="font-medium text-foreground">{t("Forgot password?")}</button>
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
            {mode === "register" && consent("consent-line")}
            <Button data-testid="submit-auth-button" type="submit" className={main} disabled={loading || !ready}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? t("Sign in") : t("Create account")}
            </Button>
          </div>
        </form>
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
