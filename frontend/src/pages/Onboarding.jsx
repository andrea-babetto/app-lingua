import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LanguagePicker from "@/components/LanguagePicker";
import Logo from "@/components/Logo";
import { useI18n } from "@/i18n";

export default function Onboarding() {
  const { t, langName } = useI18n();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [language, setLanguage] = useState(user?.language || "");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
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
    } catch { toast.error(t("Upload failed")); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const save = async () => {
    if (!language) return toast.error(t("Please choose your language"));
    setLoading(true);
    try {
      const { data } = await api.put("/auth/profile", avatar !== (user?.avatar || "") ? { name, avatar, language } : { name, language });
      updateUser(data);
      toast.success(t("All set! Welcome to Glotter"));
      nav("/");
    } catch (err) {
      toast.error(errText(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const progress = (
    <div className="flex gap-1.5" aria-hidden="true">
      {[1, 2].map((n) => <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-border"}`} />)}
    </div>
  );

  if (step === 2) {
    return (
      <div className="min-h-dvh h-dvh flex justify-center bg-background">
        <div className="w-full max-w-md flex flex-col px-6 pt-5 pb-6 min-h-0">
          <div className="flex items-center gap-3">
            <button aria-label={t("Back")} onClick={() => setStep(1)} className="w-9 h-9 -ms-2 rounded-full flex items-center justify-center hover:bg-muted">
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </button>
            <div className="flex-1">{progress}</div>
          </div>
          <h1 className="mt-7 text-[26px] font-bold tracking-tight leading-tight">{t("What's your language?")}</h1>
          <p className="text-[15px] text-muted-foreground mt-2 mb-5 leading-snug">{t("You write and read in this language. Others read you in theirs.")}</p>
          <LanguagePicker value={language} onChange={setLanguage} fill />
          <Button data-testid="confirm-language-button" className="w-full h-[52px] rounded-2xl text-base font-semibold mt-4 shrink-0" onClick={save} disabled={loading || !language}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : language ? t("Continue in {language}", { language: langName(language) }) : t("Start chatting")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex justify-center bg-background">
      <div className="w-full max-w-md flex flex-col px-6 pt-5 pb-6">
        {progress}
        <Logo height={36} className="mt-8" />
        <h1 className="mt-5 text-[26px] font-bold tracking-tight leading-tight">{t("Set up your profile")}</h1>
        <p className="text-[15px] text-muted-foreground mt-2 leading-snug">{t("This is how others will see you. Add a photo if you like, and pick the language you want to read & write in.")}</p>

        <div className="flex items-center gap-3 mt-7">
          {avatar ? (
            <button onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-primary">
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-16 h-16 rounded-full bg-label text-label-foreground flex items-center justify-center text-lg font-bold">
              {(name || "?").trim().slice(0, 2).toUpperCase()}
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="onboarding-avatar-upload"
            className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          </button>
          <input type="file" accept="image/*" ref={fileRef} hidden onChange={uploadAvatar} />
        </div>

        <label className="block mt-6">
          <span className="block text-[13px] font-semibold text-muted-foreground mb-1.5">{t("Display name")}</span>
          <Input data-testid="onboarding-name-input" className="h-12 rounded-[14px] border-[1.5px] px-4 text-base shadow-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/12"
            value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Your name")} />
        </label>

        <Button data-testid="onboarding-next-button" className="w-full h-[52px] rounded-2xl text-base font-semibold mt-auto" onClick={() => setStep(2)} disabled={!name.trim()}>
          {t("Next")}
        </Button>
      </div>
    </div>
  );
}
