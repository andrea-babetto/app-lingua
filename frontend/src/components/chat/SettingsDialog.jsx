import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, BookMarked } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { langByCode } from "@/data/languages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LanguagePicker from "@/components/LanguagePicker";

export default function SettingsDialog({ open, onOpenChange }) {
  const { user, updateUser } = useAuth();
  const [glossary, setGlossary] = useState([]);
  const [term, setTerm] = useState("");
  const [rule, setRule] = useState("");

  useEffect(() => { if (open) api.get("/glossary").then(({ data }) => setGlossary(data)); }, [open]);

  const save = async (patch) => {
    const { data } = await api.put("/auth/profile", patch);
    updateUser(data);
    toast.success("Saved");
  };

  const toggleOriginal = (v) => save({ settings: { ...user.settings, show_original: v } });
  const toggleLastSeen = (v) => save({ settings: { ...user.settings, last_seen_enabled: v } });
  const changeLang = (code) => save({ language: code });

  const addTerm = async () => {
    if (!term.trim()) return;
    const { data } = await api.post("/glossary", { term, rule });
    setGlossary(data); setTerm(""); setRule("");
  };
  const delTerm = async (t) => { const { data } = await api.delete(`/glossary/${encodeURIComponent(t)}`); setGlossary(data); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings-dialog" className="max-h-[85vh] overflow-y-auto chat-scroll">
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <div className="space-y-6">
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
