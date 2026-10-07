import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Plus, Trash2, BookMarked, Camera, Loader2, User2, AtSign, Phone, Mail } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import LanguagePicker from "@/components/LanguagePicker";

export default function SettingsDialog({ open, onOpenChange }) {
  const { user, updateUser } = useAuth();
  const [glossary, setGlossary] = useState([]);
  const [term, setTerm] = useState("");
  const [rule, setRule] = useState("");
  const [name, setName] = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (open) {
      api.get("/glossary").then(({ data }) => setGlossary(data));
      setName(user.name || ""); setUsername(user.username || ""); setPhone(user.phone || "");
    }
  }, [open]);

  const save = async (patch, silent) => {
    const { data } = await api.put("/auth/profile", patch);
    updateUser(data);
    if (!silent) toast.success("Saved");
    return data;
  };

  const toggleOriginal = (v) => save({ settings: { ...user.settings, show_original: v } });
  const toggleLastSeen = (v) => save({ settings: { ...user.settings, last_seen_enabled: v } });
  const changeLang = (code) => save({ language: code });

  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await save({ avatar: `${api.defaults.baseURL}/files/${data.id}` });
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try { await save({ name, username, phone }); }
    catch (e) { toast.error(errText(e.response?.data?.detail)); }
    finally { setSavingProfile(false); }
  };

  const addTerm = async () => {
    if (!term.trim()) return;
    const { data } = await api.post("/glossary", { term, rule });
    setGlossary(data); setTerm(""); setRule("");
  };
  const delTerm = async (t) => { const { data } = await api.delete(`/glossary/${encodeURIComponent(t)}`); setGlossary(data); };

  const dirty = name !== (user.name || "") || username !== (user.username || "") || phone !== (user.phone || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings-dialog" className="max-h-[85vh] overflow-y-auto chat-scroll">
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <div className="space-y-6">
          {/* Profile */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="w-24 h-24"><AvatarImage src={user.avatar} /><AvatarFallback className="text-2xl">{(user.name || "?").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="change-avatar-button"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input type="file" accept="image/*" ref={fileRef} hidden onChange={uploadAvatar} />
            </div>
            <span className="text-xs text-muted-foreground">Tap the camera to change your photo</span>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><User2 className="w-3.5 h-3.5" /> Display name</label>
              <Input data-testid="settings-name-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><AtSign className="w-3.5 h-3.5" /> Username <span className="opacity-70">(people can find you with this)</span></label>
              <Input data-testid="settings-username-input" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone number <span className="opacity-70">(optional, searchable)</span></label>
              <Input data-testid="settings-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5" /> {user.email}</div>
            {dirty && <Button data-testid="save-profile-button" className="w-full" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save profile"}</Button>}
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-2">
            <div className="text-sm font-medium">My language <span className="text-muted-foreground">· {langByCode(user.language).flag} {langByCode(user.language).name}</span></div>
            <LanguagePicker value={user.language} onChange={changeLang} testId="settings-language" />
          </div>

          <div className="flex items-center justify-between">
            <div><div className="text-sm font-medium">Show original under translation</div><div className="text-xs text-muted-foreground">Reveal source text by default</div></div>
            <Switch data-testid="show-original-switch" checked={!!user.settings?.show_original} onCheckedChange={toggleOriginal} />
          </div>
          <div className="flex items-center justify-between">
            <div><div className="text-sm font-medium">Share last seen & online</div><div className="text-xs text-muted-foreground">Let others see your status</div></div>
            <Switch data-testid="last-seen-switch" checked={!!user.settings?.last_seen_enabled} onCheckedChange={toggleLastSeen} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-2"><BookMarked className="w-4 h-4" /> Personal glossary</div>
            <p className="text-xs text-muted-foreground">Terms that must be kept or translated a specific way (names, brands, slang).</p>
            <div className="flex gap-2">
              <Input data-testid="glossary-term-input" placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} />
              <Input data-testid="glossary-rule-input" placeholder="Rule (e.g. keep)" value={rule} onChange={(e) => setRule(e.target.value)} />
              <Button data-testid="glossary-add-button" size="icon" onClick={addTerm}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-1">
              {glossary.map((g) => (
                <div key={g.term} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted">
                  <span className="font-medium">{g.term}</span><span className="text-muted-foreground">→ {g.rule}</span>
                  <button className="ms-auto text-destructive" onClick={() => delTerm(g.term)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
