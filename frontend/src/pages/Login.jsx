import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Logo from "@/components/Logo";
import GoogleSignIn from "@/components/GoogleSignIn";

// What the product does, shown instead of a paragraph: one sentence, written and read in different languages.
function HeroDemo() {
  return (
    <div className="space-y-3 w-full max-w-sm" aria-hidden="true">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white text-slate-900 px-4 py-2.5 shadow-lg">
          <div className="text-[15px] font-medium">Ciao! Come stai oggi?</div>
          <div className="text-[11px] text-slate-500 mt-0.5">🇮🇹 written in Italian</div>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/20 backdrop-blur-sm text-white px-4 py-2.5">
          <div className="text-[15px] font-medium">Hi! How are you today?</div>
          <div className="text-[11px] text-white/75 mt-0.5">🇬🇧 read in English</div>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/20 backdrop-blur-sm text-white px-4 py-2.5">
          <div className="text-[15px] font-medium">नमस्ते! आज आप कैसे हैं?</div>
          <div className="text-[11px] text-white/75 mt-0.5">🇮🇳 read in Hindi</div>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
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
      toast.error(errText(err.response?.data?.detail) || "Failed");
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
      toast.error(errText(err.response?.data?.detail) || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-primary lg:bg-background">
      <section className="relative overflow-hidden flex flex-col justify-between gap-8 px-7 pt-10 pb-14 lg:w-1/2 lg:p-14 bg-primary text-primary-foreground">
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-16 top-16 w-40 h-40 rounded-full bg-white/10 blur-xl" />
        <Logo className="text-4xl lg:text-5xl z-10" />
        <div className="z-10 space-y-6 lg:space-y-8">
          <h1 className="text-[28px] leading-tight lg:text-5xl font-extrabold tracking-tight max-w-md">
            Write in your language. They read in theirs.
          </h1>
          <div className="hidden sm:block"><HeroDemo /></div>
        </div>
        <p className="hidden lg:block z-10 text-sm text-primary-foreground/70">Every message is translated for each person, in real time.</p>
      </section>

      <section className="flex-1 flex items-start lg:items-center justify-center -mt-6 lg:mt-0 rounded-t-[28px] lg:rounded-none bg-background px-6 pt-8 pb-10 relative z-10">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">{mode === "login" ? "Sign in to keep chatting" : "Start chatting across languages"}</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Input data-testid="name-input" className="h-12 rounded-xl" placeholder="Your name" value={form.name} required autoComplete="name" onChange={set("name")} />
            )}
            {mode === "register" && inviteRequired && (
              <Input data-testid="invite-input" className="h-12 rounded-xl" placeholder="Invite code" value={form.invite_code} required autoComplete="off" onChange={set("invite_code")} />
            )}
            <Input data-testid="email-input" className="h-12 rounded-xl" type="email" placeholder="Email" value={form.email} required autoComplete="email" onChange={set("email")} />
            <div className="relative">
              <Input data-testid="password-input" className="h-12 rounded-xl pr-11" type={showPw ? "text" : "password"} placeholder="Password" value={form.password} required minLength={8} maxLength={72}
                autoComplete={mode === "login" ? "current-password" : "new-password"} onChange={set("password")} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <Button data-testid="submit-auth-button" type="submit" className="w-full h-12 rounded-xl text-base font-semibold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {googleClientId && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
              <GoogleSignIn clientId={googleClientId} onCredential={googleCredential} />
            </>
          )}
          <p className="text-sm text-center text-muted-foreground">
            {mode === "login" ? "No account? " : "Have an account? "}
            <button data-testid="toggle-auth-mode" className="text-primary font-semibold" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
