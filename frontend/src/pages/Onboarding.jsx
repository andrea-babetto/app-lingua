import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LanguagePicker from "@/components/LanguagePicker";
import { langByCode } from "@/data/languages";

const AVATARS = [
  "https://images.unsplash.com/photo-1605596507299-0fe2cbf21ed0?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
  "https://images.unsplash.com/flagged/photo-1565751242292-352286c13b42?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
  "https://images.unsplash.com/photo-1673757519094-6063fec0549c?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
];

export default function Onboarding() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || AVATARS[0]);
  const [language, setLanguage] = useState(user?.language || "");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const save = async () => {
    if (!language) return toast.error("Please choose your language");
    setLoading(true);
    try {
      const { data } = await api.put("/auth/profile", { name, avatar, language });
      updateUser(data);
      toast.success("All set! Welcome to Lingua");
      nav("/");
    } catch (err) {
      toast.error(errText(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Set up your profile</h1>
          <p className="text-sm text-muted-foreground mt-1">This is how others will see you. Pick the language you want to read & write in.</p>
        </div>

        <div className="flex items-center gap-3">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setAvatar(a)}
              className={`w-14 h-14 rounded-full overflow-hidden ring-2 transition-all ${avatar === a ? "ring-primary scale-105" : "ring-transparent opacity-70"}`}>
              <img src={a} alt="avatar" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Display name</label>
          <Input data-testid="onboarding-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">My language {language && <span className="text-muted-foreground">· {langByCode(language).flag} {langByCode(language).name}</span>}</label>
          <LanguagePicker value={language} onChange={setLanguage} />
        </div>

        <Button data-testid="confirm-language-button" className="w-full" onClick={save} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start chatting"}
        </Button>
      </div>
    </div>
  );
}
