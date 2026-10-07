import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAvatar(`${api.defaults.baseURL}/files/${data.id}`);
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };

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

        <div className="flex items-center gap-3 flex-wrap">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setAvatar(a)}
              className={`w-14 h-14 rounded-full overflow-hidden ring-2 transition-all ${avatar === a ? "ring-primary scale-105" : "ring-transparent opacity-70"}`}>
              <img src={a} alt="avatar" className="w-full h-full object-cover" />
            </button>
          ))}
          {avatar && !AVATARS.includes(avatar) && (
            <button onClick={() => fileRef.current?.click()}
              className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-primary scale-105">
              <img src={avatar} alt="custom avatar" className="w-full h-full object-cover" />
            </button>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="onboarding-avatar-upload"
            className="w-14 h-14 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          </button>
          <input type="file" accept="image/*" ref={fileRef} hidden onChange={uploadAvatar} />
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
