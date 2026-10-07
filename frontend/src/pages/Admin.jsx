import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, DollarSign, Languages as LangIcon, Hash } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const [net, setNet] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch(() => setErr("Admin access required"));
    api.get("/admin/client-ip").then(({ data }) => setNet(data)).catch(() => {});
  }, []);

  if (err) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">{err}</p>
        <Button onClick={() => nav("/")}><ArrowLeft className="w-4 h-4 mr-2" /> Back to chats</Button>
      </div>
    );
  }

  const cards = [
    { icon: Hash, label: "Translations", value: stats?.total_translations ?? "—" },
    { icon: LangIcon, label: "Characters", value: (stats?.total_chars ?? 0).toLocaleString() },
    { icon: DollarSign, label: "Est. cost", value: `$${stats?.total_cost ?? 0}` },
  ];
  const max = Math.max(1, ...(stats?.daily || []).map((d) => d.count));

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => nav("/")}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Translation cost dashboard</h1>
            <p className="text-sm text-muted-foreground">Signed in as {user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-5">
              <c.icon className="w-5 h-5 text-primary mb-2" />
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-sm text-muted-foreground">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-xl p-5" data-testid="client-ip-check">
          <h2 className="text-lg font-semibold mb-1">Address check</h2>
          <p className="text-sm text-muted-foreground mb-3">
            The server sees your address as <span className="font-mono font-semibold text-foreground">{net?.resolved ?? "…"}</span>.
            Compare it with the address a "what is my IP" website shows: they must be the same. If not, set <code>CLIENT_IP_HEADER</code> or <code>TRUST_PROXY_HOPS</code> on the server (see docs/PUBBLICAZIONE.md).
          </p>
          {net && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
              <dt>connection</dt><dd>{net.peer || "—"}</dd>
              <dt>x-forwarded-for</dt><dd className="break-all">{net.x_forwarded_for || "—"}</dd>
              <dt>cf-connecting-ip</dt><dd>{net.cf_connecting_ip || "—"}</dd>
              <dt>hops / header</dt><dd>{net.trust_proxy_hops} / {net.client_ip_header || "—"}</dd>
            </dl>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Daily translations (last 30 days)</h2>
          <div className="space-y-2">
            {(stats?.daily || []).length === 0 && <p className="text-sm text-muted-foreground">No translations yet.</p>}
            {(stats?.daily || []).map((d) => (
              <div key={d.date} className="flex items-center gap-3 text-sm">
                <span className="w-24 text-muted-foreground tabular-nums">{d.date}</span>
                <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                  <div className="h-full bg-primary rounded-full flex items-center justify-end pr-2 text-[11px] text-primary-foreground font-medium" style={{ width: `${(d.count / max) * 100}%` }}>
                    {d.count}
                  </div>
                </div>
                <span className="w-16 text-right text-muted-foreground tabular-nums">${d.cost}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
