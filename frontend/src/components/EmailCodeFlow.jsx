// "Continue with email": the email, then the 6-digit code that arrives by email, then (only for a new account) the name
// and the Terms checkbox. The code proves the address, so the account needs no password and its email is confirmed.
import { useEffect, useState } from "react";
import { Loader2, Mail, User2 } from "lucide-react";
import { toast } from "sonner";
import { api, errText } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export default function EmailCodeFlow({ initialEmail = "", inviteCode = "", inviteLink = "", agreed, consent, onDone, onStep, styles }) {
  const { t, lang } = useI18n();
  const { label, pill, bare, main } = styles;
  const [step, setStep] = useState("email");  // email | code | name
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { onStep?.(step); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // the server's messages for this flow, in the reader's language
  const said = {
    "Wrong code": t("Wrong code"),
    "This code has expired. Ask for a new one.": t("This code has expired. Ask for a new one."),
    "Use your real email: temporary email addresses are not accepted": t("Use your real email: temporary email addresses are not accepted"),
    "Too many new accounts from this device. Sign in to the one you have.": t("Too many new accounts from this device. Sign in to the one you have."),
    "Too many codes for this email. Try again later.": t("Too many codes for this email. Try again later."),
    "This sign-up has expired. Start again.": t("This sign-up has expired. Start again."),
  };
  const fail = (err) => {
    const text = errText(err.response?.data?.detail);
    toast.error(said[text] || text || t("Failed"));
  };

  const sendCode = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/email/start", { email, lang });
      setCode("");
      setStep("code");
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const checkCode = async (value) => {
    setBusy(true);
    try {
      const { data } = await api.post("/auth/email/verify", { email, code: value });
      if (data.needs_signup) { setSignupToken(data.signup_token); setStep("name"); }
      else onDone(data);
    } catch (err) { fail(err); setCode(""); } finally { setBusy(false); }
  };

  const finish = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/email/complete", { signup_token: signupToken, name, accept_terms: agreed, invite_code: inviteCode, invite_link: inviteLink });
      onDone(data);
    } catch (err) {
      fail(err);
      if (err.response?.data?.detail === "This sign-up has expired. Start again.") setStep("email");
    } finally { setBusy(false); }
  };

  if (step === "code") {
    return (
      <form data-testid="email-code-step" className="mt-7 flex-1 flex flex-col" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) checkCode(code); }}>
        <p className="text-[15px] leading-relaxed text-center text-muted-foreground">{t("We sent a 6-digit code to {email}.", { email })}</p>
        <input data-testid="code-input" value={code} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label={t("Code")}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6 && !busy) checkCode(v); }}
          className="mt-6 h-16 w-full rounded-full border border-border bg-background text-center text-[28px] tracking-[0.5em] font-medium tabular-nums outline-none focus:border-foreground" />
        <p className="mt-3 text-center text-[13px] text-subtle">{t("It can take a minute. Check your spam folder too.")}</p>
        <div className="mt-4 flex justify-center gap-5 text-sm font-medium">
          <button type="button" data-testid="code-resend" onClick={sendCode} disabled={busy}>{t("Send a new code")}</button>
          <button type="button" data-testid="code-change-email" onClick={() => setStep("email")}>{t("Change email")}</button>
        </div>
        <div className="mt-auto pt-10">
          <Button data-testid="code-submit" type="submit" className={main} disabled={busy || code.length !== 6}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Continue")}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "name") {
    return (
      <form data-testid="email-name-step" className="mt-7 flex-1 flex flex-col" onSubmit={finish}>
        <p className="text-[15px] leading-relaxed text-center text-muted-foreground">{t("Your email is confirmed. One last thing:")}</p>
        <label className="block mt-6"><span className={label}>{t("Your name")}</span>
          <span className={pill}><User2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <input data-testid="name-input" className={bare} value={name} required autoFocus autoComplete="name" onChange={(e) => setName(e.target.value)} /></span></label>
        <div className="mt-auto pt-10 space-y-3.5">
          {consent("consent-line")}
          <Button data-testid="submit-auth-button" type="submit" className={main} disabled={busy || !name.trim() || !agreed}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Create account")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form data-testid="email-start-step" className="mt-7 flex-1 flex flex-col" onSubmit={sendCode}>
      <label className="block"><span className={label}>{t("Email")}</span>
        <span className={pill}><Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
          <input data-testid="email-input" className={bare} type="email" value={email} required autoComplete="email" placeholder="name@email.com" onChange={(e) => setEmail(e.target.value)} /></span></label>
      <p className="mt-3 text-[13px] text-center text-subtle">{t("We send you a code: no password to remember.")}</p>
      <div className="mt-auto pt-10">
        <Button data-testid="code-send" type="submit" className={main} disabled={busy || !/^\S+@\S+\.\S+$/.test(email)}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Get the code")}
        </Button>
      </div>
    </form>
  );
}
