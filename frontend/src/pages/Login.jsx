import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Languages, Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GoogleSignIn from "@/components/GoogleSignIn";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
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
    api.get("/config").then(({ data }) => setGoogleClientId(data.google_client_id || "")).catch(() => {});
  }, []);

  const googleCredential = async (credential) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google", { credential });
      auth(data);
      nav(data.user.language ? "/" : "/onboarding");
    } catch (err) {
      toast.error(errText(err.response?.data?.detail) || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
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
            <Input data-testid="password-input" type="password" placeholder="Password" value={form.password} required minLength={8} maxLength={72}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button data-testid="submit-auth-button" type="submit" className="w-full" disabled={loading}>
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
            <button data-testid="toggle-auth-mode" className="text-primary font-medium" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
