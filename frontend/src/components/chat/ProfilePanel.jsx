import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Plus, Trash2, BookMarked, Camera, Loader2, User2, AtSign, Phone, Mail, Moon, BarChart3, LogOut, ChevronRight, Bell, KeyRound } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { disablePush, enablePush, pushState } from "@/lib/push";
import { langByCode } from "@/data/languages";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import LanguagePicker from "@/components/LanguagePicker";

function Section({ title, children }) {
  return (
    <section className="bg-card rounded-xl border border-border mx-3 mt-3 p-4 space-y-3">
      {title && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

function NotificationsRow() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState); }, []);

  const toggle = async (on) => {
    setBusy(true);
    try {
      if (on) { await enablePush(); setState("on"); toast.success("Notifications are on"); }
      else { await disablePush(); setState("off"); }
    } catch { toast.error("Notifications were not allowed on this device"); setState(await pushState()); }
    finally { setBusy(false); }
  };

  const note = {
    "needs-install": "On iPhone: tap Share, then Add to Home Screen, and open glott from there.",
    blocked: "Blocked for this site. Allow notifications in your browser or phone settings.",
    unsupported: "This browser cannot show notifications.",
  }[state];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <Bell className="w-4 h-4 mt-0.5 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">Notifications</div>
          <div className="text-xs text-muted-foreground">{note || "Get notified when someone writes to you"}</div>
        </div>
      </div>
      {(state === "on" || state === "off") && <Switch data-testid="push-switch" checked={state === "on"} disabled={busy} onCheckedChange={toggle} />}
    </div>
  );
}

function PasswordSection() {
  const { auth } = useAuth();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/change-password", { current_password: cur, new_password: next });
      auth(data); // the old sign-in stops working, this is the new one
      toast.success("Password changed");
      setOpen(false); setCur(""); setNext("");
    } catch (err) { toast.error(errText(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <button data-testid="change-password-toggle" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-sm font-medium">
        <KeyRound className="w-4 h-4 text-muted-foreground" /> Change password <ChevronRight className={`w-4 h-4 ms-auto text-muted-foreground transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <Input data-testid="current-password-input" type="password" autoComplete="current-password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <Input data-testid="new-password-input" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" minLength={8} maxLength={72} required value={next} onChange={(e) => setNext(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy || next.length < 8} data-testid="change-password-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save new password"}</Button>
        </form>
      )}
    </div>
  );
}

export default function ProfilePanel({ onOpenAdmin }) {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [glossary, setGlossary] = useState([]);
  const [term, setTerm] = useState("");
  const [rule, setRule] = useState("");
  const [name, setName] = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const fileRef = useRef();

  useEffect(() => { api.get("/glossary").then(({ data }) => setGlossary(data)).catch(() => {}); }, []);

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
  const lang = langByCode(user.language);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scroll bg-muted/40 pb-6" data-testid="profile-panel">
      <div className="bg-card px-4 py-6 flex flex-col items-center gap-1.5">
        <div className="relative">
          <Avatar className="w-24 h-24"><AvatarImage src={user.avatar} /><AvatarFallback className="text-2xl bg-primary/10 text-primary">{(user.name || "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="change-avatar-button"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input type="file" accept="image/*" ref={fileRef} hidden onChange={uploadAvatar} />
        </div>
        <div className="text-xl font-semibold mt-1">{user.name}</div>
        <div className="text-sm text-muted-foreground">@{user.username} · {lang.flag} {lang.name}</div>
      </div>

      <Section title="Account">
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
      </Section>

      <Section title="My language">
        <button data-testid="language-toggle" onClick={() => setLangOpen((v) => !v)} className="w-full flex items-center gap-3 text-sm font-medium">
          <span className="text-xl leading-none">{lang.flag}</span> {lang.name}
          <span className="ms-auto text-xs text-primary font-semibold">{langOpen ? "Close" : "Change"}</span>
        </button>
        {langOpen && <LanguagePicker value={user.language} onChange={(c) => { changeLang(c); setLangOpen(false); }} testId="settings-language" />}
      </Section>

      <Section title="Preferences">
        <NotificationsRow />
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-medium">Show original under translation</div><div className="text-xs text-muted-foreground">Reveal source text by default</div></div>
          <Switch data-testid="show-original-switch" checked={!!user.settings?.show_original} onCheckedChange={toggleOriginal} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-medium">Share last seen & online</div><div className="text-xs text-muted-foreground">Let others see your status</div></div>
          <Switch data-testid="last-seen-switch" checked={!!user.settings?.last_seen_enabled} onCheckedChange={toggleLastSeen} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Moon className="w-4 h-4 text-muted-foreground" /><div className="text-sm font-medium">Dark mode</div></div>
          <Switch data-testid="theme-toggle-button" checked={theme === "dark"} onCheckedChange={toggle} />
        </div>
      </Section>

      <Section title="Personal glossary">
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><BookMarked className="w-4 h-4 shrink-0" /> Terms that must be kept or translated a specific way (names, brands, jargon).</p>
        <div className="flex gap-2">
          <Input data-testid="glossary-term-input" placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} />
          <Input data-testid="glossary-rule-input" placeholder="Rule (e.g. keep)" value={rule} onChange={(e) => setRule(e.target.value)} />
          <Button data-testid="glossary-add-button" size="icon" className="shrink-0" onClick={addTerm}><Plus className="w-4 h-4" /></Button>
        </div>
        <div className="space-y-1">
          {glossary.map((g) => (
            <div key={g.term} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-muted">
              <span className="font-medium">{g.term}</span><span className="text-muted-foreground">→ {g.rule}</span>
              <button className="ms-auto text-destructive" onClick={() => delTerm(g.term)}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </Section>

      <Section><PasswordSection /></Section>

      {user.role === "admin" && (
        <Section>
          <button data-testid="open-admin-item" onClick={onOpenAdmin} className="w-full flex items-center gap-3 text-sm font-medium">
            <BarChart3 className="w-4 h-4 text-muted-foreground" /> Admin dashboard <ChevronRight className="w-4 h-4 ms-auto text-muted-foreground" />
          </button>
        </Section>
      )}

      <div className="mx-3 mt-3">
        <Button data-testid="logout-item" variant="outline" className="w-full text-destructive" onClick={logout}><LogOut className="w-4 h-4 mr-2" /> Log out</Button>
      </div>
    </div>
  );
}
