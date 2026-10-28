import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Download, Plus, Trash2, Camera, Loader2, User2, AtSign, Phone, Mail, Moon, Sun, Smartphone, BarChart3, LogOut, ChevronRight, Bell, KeyRound, ArrowLeft, Languages, Palette, Lock, BookMarked, Heart, HelpCircle, Ban, X, Info, Sparkles } from "lucide-react";
import { api, errText } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { disablePush, enablePush, pushState } from "@/lib/push";
import { langByCode } from "@/data/languages";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { avatarClass, initials } from "@/lib/avatar";
import { returnTarget, rememberReturn, clearReturn } from "@/lib/returnTarget";
import LanguagePicker from "@/components/LanguagePicker";
import { useI18n } from "@/i18n";
import { shareMyInvite } from "@/lib/invite";
import { featureGroups } from "@/data/features";

// ---- building blocks of the list-style profile ----
function Group({ children }) {
  return <div className="bg-card rounded-[18px] border border-border mx-3 mt-3 overflow-hidden divide-y divide-border">{children}</div>;
}

function Row({ icon: Icon, label, hint, onClick, testId }) {
  return (
    <button data-testid={testId} onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-start hover:bg-muted/60 active:bg-muted transition-colors">
      <Icon className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground truncate">{hint}</span>}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-subtle rtl:rotate-180" aria-hidden="true" />
    </button>
  );
}

function SubPage({ title, onBack, children }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scroll bg-surface pb-6" data-testid="profile-subpage">
      <div className="h-12 px-2 flex items-center gap-2 bg-card border-b border-border sticky top-0 z-10">
        <button aria-label={t("Back")} data-testid="profile-back" onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted">
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// Saves part of my profile and updates what the app knows about me.
function useSave() {
  const { updateUser } = useAuth();
  const { t } = useI18n();
  return async (patch, silent) => {
    const { data } = await api.put("/auth/profile", patch);
    updateUser(data);
    if (!silent) toast.success(t("Saved"));
    return data;
  };
}

function Section({ title, children }) {
  return (
    <section className="bg-card rounded-[18px] border border-border mx-3 mt-3 p-4 space-y-3">
      {title && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

function NotificationsRow() {
  const { t } = useI18n();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState); }, []);

  const toggle = async (on) => {
    setBusy(true);
    try {
      if (on) { await enablePush(); setState("on"); toast.success(t("Notifications are on")); }
      else { await disablePush(); setState("off"); }
    } catch { toast.error(t("Notifications were not allowed on this device")); setState(await pushState()); }
    finally { setBusy(false); }
  };

  const note = {
    "needs-install": t("On iPhone: tap Share, then Add to Home Screen, and open Glotter from there."),
    blocked: t("Blocked for this site. Allow notifications in your browser or phone settings."),
    unsupported: t("This browser cannot show notifications."),
  }[state];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2">
        <Bell className="w-4 h-4 mt-0.5 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">{t("Notifications")}</div>
          <div className="text-xs text-muted-foreground">{note || t("Get notified when someone writes to you")}</div>
        </div>
      </div>
      {(state === "on" || state === "off") && <Switch data-testid="push-switch" checked={state === "on"} disabled={busy} onCheckedChange={toggle} />}
    </div>
  );
}

function PasswordSection() {
  const { auth } = useAuth();
  const { t } = useI18n();
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
      toast.success(t("Password changed"));
      setOpen(false); setCur(""); setNext("");
    } catch (err) { toast.error(errText(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <button data-testid="change-password-toggle" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-sm font-medium">
        <KeyRound className="w-4 h-4 text-muted-foreground" /> {t("Change password")} <ChevronRight className={`w-4 h-4 ms-auto text-muted-foreground transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2.5">
          <Input data-testid="current-password-input" type="password" autoComplete="current-password" placeholder={t("Current password")} value={cur} onChange={(e) => setCur(e.target.value)} />
          <Input data-testid="new-password-input" type="password" autoComplete="new-password" placeholder={t("New password (8+ characters)")} minLength={8} maxLength={72} required value={next} onChange={(e) => setNext(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy || next.length < 8} data-testid="change-password-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Save new password")}</Button>
        </form>
      )}
    </div>
  );
}

function DeleteAccount() {
  const { logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/delete-account", { password: pw });
      toast.success(t("Your account has been deleted"));
      logout();
    } catch (err) { toast.error(errText(err.response?.data?.detail)); setBusy(false); }
  };

  return (
    <>
      <button data-testid="delete-account-open" onClick={() => setOpen(true)} className="w-full text-center text-sm font-medium text-destructive py-2">{t("Delete account")}</button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPw(""); }}>
        <DialogContent data-testid="delete-account-dialog">
          <DialogHeader><DialogTitle>{t("Delete your account?")}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("This permanently deletes your profile, the messages and files you sent, and your chats with one other person (they disappear for both of you). You will be removed from groups. This cannot be undone.")}</p>
            <Input data-testid="delete-account-password" type="password" autoComplete="current-password" placeholder={t("Enter your password to confirm")} value={pw} onChange={(e) => setPw(e.target.value)} required />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("Cancel")}</Button>
              <Button type="submit" data-testid="delete-account-confirm" disabled={busy || !pw} className="text-destructive-foreground bg-destructive hover:bg-destructive/90">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Delete my account")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- the pages behind each row ----
// "Download my data" (a European right): a JSON file with the profile, the messages I wrote, chats, contacts, glossary...
function DownloadData() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get("/auth/export", { responseType: "blob" });
      const name = /filename="([^"]+)"/.exec(res.headers["content-disposition"] || "")?.[1] || "glotter-data.json";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success(t("Your file is ready"));
    } catch { toast.error(t("Could not prepare the file. Try again later.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{t("Download my data")}</div>
      <p className="text-xs text-muted-foreground">{t("A file with your profile, the messages you wrote, your chats, contacts and glossary.")}</p>
      <Button data-testid="download-data" variant="outline" className="w-full" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Download className="w-4 h-4 me-2" /> {t("Download my data")}</>}
      </Button>
    </div>
  );
}

function AccountPage({ onBack }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const save = useSave();
  const [name, setName] = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [bio, setBio] = useState(user.bio || "");
  const [busy, setBusy] = useState(false);
  const dirty = name !== (user.name || "") || username !== (user.username || "") || phone !== (user.phone || "") || bio !== (user.bio || "");

  const saveProfile = async () => {
    setBusy(true);
    try { await save({ name, username, phone, bio }); }
    catch (e) { toast.error(errText(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <SubPage title={t("Account")} onBack={onBack}>
      <Section>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><User2 className="w-3.5 h-3.5" /> {t("Display name")}</label>
          <Input data-testid="settings-name-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><AtSign className="w-3.5 h-3.5" /> {t("Username")} <span className="opacity-70">{t("(people can find you with this)")}</span></label>
          <Input data-testid="settings-username-input" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> {t("About me")}</label>
          <Input data-testid="settings-bio-input" maxLength={140} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("A few words about you")} />
          <div className="text-[11px] text-subtle text-end" dir="ltr">{bio.length}/140</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {t("Phone number")} <span className="opacity-70">{t("(optional, searchable)")}</span></label>
          <Input data-testid="settings-phone-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+39 333 1234567" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3.5 h-3.5" /> {user.email}</div>
        {dirty && <Button data-testid="save-profile-button" className="w-full" onClick={saveProfile} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("Save profile")}</Button>}
      </Section>
      <Section><PasswordSection /></Section>
      <Section><DownloadData /></Section>
    </SubPage>
  );
}

// The language I write and read in, and whether the original is shown under translations.
function LanguagePage({ onBack }) {
  const { user } = useAuth();
  const { t, langName } = useI18n();
  const save = useSave();
  const [langOpen, setLangOpen] = useState(false);
  const lang = langByCode(user.language);
  return (
    <SubPage title={t("Language and translation")} onBack={onBack}>
      <Section>
        <button data-testid="language-toggle" onClick={() => setLangOpen((v) => !v)} className="w-full flex items-center gap-3 text-sm font-medium">
          <span className="text-xl leading-none">{lang.flag}</span> {langName(user.language)}
          <span className="ms-auto text-xs text-primary font-semibold">{langOpen ? t("Close") : t("Change")}</span>
        </button>
        {langOpen && <LanguagePicker value={user.language} onChange={(c) => { save({ language: c }); setLangOpen(false); }} testId="settings-language" />}
      </Section>
      <Section>
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-medium">{t("Show original under translation")}</div><div className="text-xs text-muted-foreground">{t("Reveal source text by default")}</div></div>
          <Switch data-testid="show-original-switch" checked={!!user.settings?.show_original} onCheckedChange={(v) => save({ settings: { ...user.settings, show_original: v } })} />
        </div>
      </Section>
    </SubPage>
  );
}

function NotificationsPage({ onBack }) {
  const { t } = useI18n();
  return <SubPage title={t("Notifications")} onBack={onBack}><Section><NotificationsRow /></Section></SubPage>;
}

function AppearancePage({ onBack }) {
  const { mode, setMode } = useTheme();
  const { t } = useI18n();
  const options = [["light", t("Light"), Sun], ["dark", t("Dark"), Moon], ["system", t("Same as phone"), Smartphone]];
  return (
    <SubPage title={t("Appearance")} onBack={onBack}>
      <Group>
        <div role="radiogroup" aria-label={t("Appearance")} className="divide-y divide-border">
          {options.map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={mode === id} data-testid={`theme-${id}`} onClick={() => setMode(id)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-start hover:bg-muted/60">
              <Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[15px] font-medium">{label}</span>
              <span className={`w-[22px] h-[22px] rounded-full shrink-0 ${mode === id ? "border-[7px] border-primary" : "border-2 border-border"}`} />
            </button>
          ))}
        </div>
      </Group>
    </SubPage>
  );
}

function GlossaryPage({ onBack }) {
  const { t } = useI18n();
  const [glossary, setGlossary] = useState([]);
  const [term, setTerm] = useState("");
  const [rule, setRule] = useState("");
  useEffect(() => { api.get("/glossary").then(({ data }) => setGlossary(data)).catch(() => {}); }, []);
  const addTerm = async () => {
    if (!term.trim()) return;
    const { data } = await api.post("/glossary", { term, rule });
    setGlossary(data); setTerm(""); setRule("");
  };
  const delTerm = async (x) => { const { data } = await api.delete(`/glossary/${encodeURIComponent(x)}`); setGlossary(data); };
  return (
    <SubPage title={t("Personal glossary")} onBack={onBack}>
      <Section>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5"><BookMarked className="w-4 h-4 shrink-0" /> {t("Terms that must be kept or translated a specific way (names, brands, jargon).")}</p>
        <div className="flex gap-2">
          <Input data-testid="glossary-term-input" placeholder={t("Term")} value={term} onChange={(e) => setTerm(e.target.value)} />
          <Input data-testid="glossary-rule-input" placeholder={t("Rule (e.g. keep)")} value={rule} onChange={(e) => setRule(e.target.value)} />
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
    </SubPage>
  );
}

function BlockedPage({ onBack }) {
  const { reload } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const load = () => api.get("/users/blocked/details").then(({ data }) => setRows(data)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const unblock = async (u) => {
    try { await api.post(`/users/${u.id}/unblock`); toast.success(t("Unblocked")); await reload(); load(); }
    catch (e) { toast.error(errText(e.response?.data?.detail)); }
  };
  return (
    <SubPage title={t("Blocked users")} onBack={onBack}>
      {rows && rows.length === 0 && <p data-testid="blocked-empty" className="px-8 pt-12 text-center text-[15px] text-muted-foreground">{t("You have not blocked anyone.")}</p>}
      {rows && rows.length > 0 && (
        <Group>
          {rows.map((u) => (
            <div key={u.id} data-testid={`blocked-${u.id}`} className="flex items-center gap-3 px-4 py-3">
              <Avatar className="w-10 h-10"><AvatarImage src={u.avatar} /><AvatarFallback className={`font-semibold ${avatarClass(u.name)}`}>{initials(u.name)}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0"><div className="text-[15px] font-medium truncate">{u.name}</div><div className="text-xs text-muted-foreground truncate" dir="ltr">@{u.username}</div></div>
              <Button size="sm" variant="outline" data-testid={`unblock-${u.id}`} onClick={() => unblock(u)}>{t("Unblock")}</Button>
            </div>
          ))}
        </Group>
      )}
    </SubPage>
  );
}

function PrivacyPage({ onBack, onOpen }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const save = useSave();
  return (
    <SubPage title={t("Privacy")} onBack={onBack}>
      <Section>
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-medium">{t("Share last seen & online")}</div><div className="text-xs text-muted-foreground">{t("Others see when you are online and when you read their messages. If you turn it off, you don't see theirs either.")}</div></div>
          <Switch data-testid="last-seen-switch" checked={!!user.settings?.last_seen_enabled} onCheckedChange={(v) => save({ settings: { ...user.settings, last_seen_enabled: v } })} />
        </div>
      </Section>
      <Section>
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-sm font-medium">{t("Show my local time")}</div><div className="text-xs text-muted-foreground">{t("People you chat with see what time it is for you")}</div></div>
          <Switch data-testid="local-time-switch" checked={user.settings?.local_time_enabled !== false} onCheckedChange={(v) => save({ settings: { ...user.settings, local_time_enabled: v } })} />
        </div>
      </Section>
      <Group><Row icon={Ban} label={t("Blocked users")} testId="profile-row-blocked" onClick={() => onOpen("blocked")} /></Group>
      <Section>
        <div className="flex flex-col gap-2 text-sm">
          <Link to="/terms" onClick={() => rememberReturn("profile:privacy")} className="hover:underline">{t("Terms of Service")}</Link>
          <Link to="/privacy" onClick={() => rememberReturn("profile:privacy")} className="hover:underline">{t("Privacy Policy")}</Link>
        </div>
      </Section>
    </SubPage>
  );
}

const HELP_EMAIL = import.meta.env.VITE_LEGAL_EMAIL || "";

// "What Glotter can do": every function in groups; tapping one opens what it is for and how to use it.
function FeaturesPage({ onBack, onOpen, onInvite }) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState(null);
  const groups = featureGroups(t);
  const feature = groups.flatMap((g) => g.items).find((f) => f.id === openId);
  if (feature) {
    const Icon = feature.icon;
    const tryIt = feature.try === "invite" ? onInvite : feature.try ? () => onOpen(feature.try) : null;
    return (
      <SubPage title={feature.title} onBack={() => setOpenId(null)}>
        <div className="px-4 pt-6 pb-2 flex flex-col items-center text-center gap-3" data-testid={`feature-detail-${feature.id}`}>
          <span className="w-16 h-16 rounded-full bg-label text-label-foreground flex items-center justify-center"><Icon className="w-8 h-8" aria-hidden="true" /></span>
          <h3 className="text-xl font-bold leading-snug">{feature.title}</h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{feature.what}</p>
        </div>
        <Section title={t("How")}>
          <p className="text-[15px] leading-relaxed">{feature.how}</p>
        </Section>
        {tryIt && (
          <div className="mx-3 mt-4">
            <Button data-testid="feature-try" className="w-full h-11 rounded-xl" onClick={tryIt}>{t("Try it")}</Button>
          </div>
        )}
      </SubPage>
    );
  }
  return (
    <SubPage title={t("What Glotter can do")} onBack={onBack}>
      <p className="px-4 pt-4 text-sm text-muted-foreground leading-relaxed">{t("Everything you can do with Glotter. Tap a function to see how it works.")}</p>
      {groups.map((g) => (
        <section key={g.id} className="mt-4">
          <h3 className="px-4 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h3>
          <div className="bg-card border-y border-border divide-y divide-border">
            {g.items.map((f) => {
              const Icon = f.icon;
              return (
                <button key={f.id} data-testid={`feature-${f.id}`} onClick={() => setOpenId(f.id)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 text-start hover:bg-muted/60 active:bg-muted transition-colors">
                  <Icon className="w-5 h-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-medium truncate">{f.title}</span>
                      {f.isNew && <span className="shrink-0 text-[10.5px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-label text-label-foreground">{t("New")}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">{f.what}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-subtle rtl:rotate-180" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </SubPage>
  );
}

function HelpPage({ onBack }) {
  const { t } = useI18n();
  const copy = async () => {
    try { await navigator.clipboard.writeText(HELP_EMAIL); toast.success(t("Copied")); } catch { toast(HELP_EMAIL); }
  };
  return (
    <SubPage title={t("Help and feedback")} onBack={onBack}>
      <Section>
        <p className="text-sm leading-relaxed">{t("We read every message. Tell us what is not working or what you would like to see.")}</p>
        <div className="rounded-2xl bg-surface border border-border px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground">{t("Email")}</div>
          <div data-testid="help-email" dir="ltr" className="mt-0.5 text-[15px] font-semibold break-all select-all">{HELP_EMAIL}</div>
        </div>
        <div className="flex gap-2">
          <Button data-testid="help-write" className="flex-1" onClick={() => { window.location.href = `mailto:${HELP_EMAIL}?subject=${encodeURIComponent("Glotter")}`; }}><Mail className="w-4 h-4 me-2" /> {t("Write to us")}</Button>
          <Button data-testid="help-copy" variant="outline" onClick={copy}>{t("Copy")}</Button>
        </div>
      </Section>
    </SubPage>
  );
}

export default function ProfilePanel({ onOpenAdmin }) {
  const { user, logout } = useAuth();
  const { mode } = useTheme();
  const { t, langName } = useI18n();
  const save = useSave();
  const [page, setPage] = useState(() => { const [tab, sub] = returnTarget().split(":"); return tab === "profile" && sub ? sub : "main"; });
  useEffect(() => { clearReturn(); }, []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const lang = langByCode(user.language);
  const back = () => setPage("main");

  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await save({ avatar: `${api.defaults.baseURL}/files/${data.id}` });
    } catch { toast.error(t("Upload failed")); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const invite = () => shareMyInvite(t);

  const pages = {
    account: <AccountPage onBack={back} />,
    language: <LanguagePage onBack={back} />,
    notifications: <NotificationsPage onBack={back} />,
    appearance: <AppearancePage onBack={back} />,
    glossary: <GlossaryPage onBack={back} />,
    privacy: <PrivacyPage onBack={back} onOpen={setPage} />,
    blocked: <BlockedPage onBack={() => setPage("privacy")} />,
    help: <HelpPage onBack={back} />,
    features: <FeaturesPage onBack={back} onOpen={setPage} onInvite={invite} />,
  };
  if (pages[page]) return pages[page];

  const themeLabel = { light: t("Light"), dark: t("Dark"), system: t("Same as phone") }[mode];
  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scroll bg-surface pb-6" data-testid="profile-panel">
      <div className="bg-card px-4 pt-4 pb-6 flex flex-col items-center gap-1.5">
        <div className="relative">
          <Avatar className="w-28 h-28"><AvatarImage src={user.avatar} /><AvatarFallback className={`text-3xl font-bold ${avatarClass(user.name)}`}>{initials(user.name)}</AvatarFallback></Avatar>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="change-avatar-button" aria-label={t("Change photo")}
            className="absolute bottom-0 end-0 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
          <input type="file" accept="image/*" ref={fileRef} hidden onChange={uploadAvatar} />
        </div>
        <div className="text-2xl font-bold mt-2 text-center">{user.name}</div>
        <div className="text-sm text-muted-foreground"><bdi dir="ltr">@{user.username}</bdi> · {lang.flag} {langName(user.language)}</div>
        {user.bio && <div data-testid="profile-bio" className="text-sm text-center text-foreground/80 mt-1 max-w-xs">{user.bio}</div>}
      </div>

      <Group>
        <Row icon={User2} label={t("Account")} testId="profile-row-account" onClick={() => setPage("account")} />
        <Row icon={Languages} label={t("Language and translation")} hint={langName(user.language)} testId="profile-row-language" onClick={() => setPage("language")} />
        <Row icon={Bell} label={t("Notifications")} testId="profile-row-notifications" onClick={() => setPage("notifications")} />
        <Row icon={Palette} label={t("Appearance")} hint={themeLabel} testId="profile-row-appearance" onClick={() => setPage("appearance")} />
        <Row icon={BookMarked} label={t("Personal glossary")} testId="profile-row-glossary" onClick={() => setPage("glossary")} />
        <Row icon={Lock} label={t("Privacy")} testId="profile-row-privacy" onClick={() => setPage("privacy")} />
      </Group>

      <Group>
        <Row icon={Heart} label={t("Invite a friend")} testId="profile-row-invite" onClick={invite} />
        <Row icon={Sparkles} label={t("What Glotter can do")} testId="profile-row-features" onClick={() => setPage("features")} />
        {HELP_EMAIL && <Row icon={HelpCircle} label={t("Help and feedback")} hint={HELP_EMAIL} testId="profile-row-help" onClick={() => setPage("help")} />}
        {user.role === "admin" && <Row icon={BarChart3} label={t("Admin dashboard")} testId="open-admin-item" onClick={onOpenAdmin} />}
      </Group>

      <div className="mx-3 mt-4">
        <Button data-testid="logout-item" variant="outline" className="w-full text-destructive" onClick={logout}><LogOut className="w-4 h-4 me-2" /> {t("Log out")}</Button>
      </div>
      <div className="mx-3 mt-2 flex justify-center text-xs text-muted-foreground"><DeleteAccount /></div>
    </div>
  );
}
