import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Languages, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
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

  const fillDemo = (email) => setForm({ ...form, email, password: "demo1234" });

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-primary p-12 text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-2 text-2xl font-bold tracking-tight z-10">
          <Languages className="w-8 h-8" /> Lingua
        </div>
        <div className="z-10 space-y-6 max-w-md">
          <h1 className="text-5xl font-extrabold leading-tight">Everyone speaks their own language.</h1>
          <p className="text-lg text-primary-foreground/80">
            Write in Italian, your friend reads in Hindi. AI translates every message in real time, so language is never a barrier again.
          </p>
        </div>
        <div className="z-10 text-sm text-primary-foreground/60">Powered by Claude · 40+ languages</div>
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-20 top-20 w-40 h-40 rounded-full bg-white/10 blur-xl" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 text-2xl font-bold text-primary justify-center">
            <Languages className="w-7 h-7" /> Lingua
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">{mode === "login" ? "Sign in to keep chatting" : "Start chatting across languages"}</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Input data-testid="name-input" placeholder="Display name" value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            )}
            <Input data-testid="email-input" type="email" placeholder="Email" value={form.email} required
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input data-testid="password-input" type="password" placeholder="Password" value={form.password} required minLength={6}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button data-testid="submit-auth-button" type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <button data-testid="google-signin-button" onClick={googleLogin}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-border text-sm font-medium hover:bg-muted transition">
            <img alt="g" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" />
            Continue with Google
          </button>
          <p className="text-sm text-center text-muted-foreground">
            {mode === "login" ? "No account? " : "Have an account? "}
            <button data-testid="toggle-auth-mode" className="text-primary font-medium" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground">Demo accounts (password: demo1234)</p>
            <button className="block hover:text-primary" onClick={() => fillDemo("giulia@lingua.app")}>🇮🇹 giulia@lingua.app — Italian</button>
            <button className="block hover:text-primary" onClick={() => fillDemo("james@lingua.app")}>🇬🇧 james@lingua.app — English</button>
          </div>
        </div>
      </div>
    </div>
  );
}
