import { kpis, vendasSemana, funilDados, crescimentoMensal, conversas } from "@/lib/mock";
import {
  TrendingUp, ShoppingBag, Wallet, RefreshCw, Crown, AlertTriangle,
  ArrowUpRight, Sparkles, Target, Users, Zap, AlertCircle, TrendingDown,
  Lightbulb, Loader2, X,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useVendas } from "@/contexts/VendasContext";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const WEBHOOK_RELATORIO = "https://webhook.n8n.clinizap.com.br/webhook/relatorio-diario";
const WEBHOOK_ALERTA = "https://webhook.n8n.clinizap.com.br/webhook/alerta-acao";

export function Dashboard() {
  const { vendas } = useVendas();
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [enviandoRel, setEnviandoRel] = useState(false);

  const { pedidosHoje, faturamentoHoje } = useMemo(() => {
    const hoje = vendas.filter(v => v.data === "hoje" && v.status === "Concluída");
    return { pedidosHoje: hoje.length, faturamentoHoje: hoje.reduce((s, v) => s + v.total, 0) };
  }, [vendas]);

  async function enviarRelatorio() {
    setEnviandoRel(true);
    try {
      const r = await fetch(WEBHOOK_RELATORIO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual", timestamp: new Date().toISOString(), origem: "dashboard" }),
      });
      if (!r.ok) throw new Error();
      toast.success("Relatório enviado no WhatsApp ✅");
      setShowRelatorio(false);
    } catch {
      toast.error("Erro ao enviar. Verifique o n8n ❌");
    } finally {
      setEnviandoRel(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Bom dia, Ana 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel de crescimento — Mundo Pet em tempo real
          </p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium hover:bg-secondary transition">
            Hoje
          </button>
          <button onClick={()=>setShowRelatorio(true)} className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
            <Sparkles className="size-4" /> Relatório IA
          </button>
        </div>
      </div>

      {/* LINHA 1 — Receita */}
      <Section title="Receita" subtitle="visão financeira do período">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<Wallet />} label="Faturamento hoje" value={brl(faturamentoHoje)} delta="ao vivo" tone="primary" />
          <Kpi icon={<TrendingUp />} label="Faturamento semana" value={brl(kpis.faturamentoSemana)} delta="+9%" tone="primary" />
          <Kpi icon={<TrendingUp />} label="Faturamento mês" value={brl(kpis.faturamentoMes)} delta="+12%" tone="primary" />
          <Kpi icon={<Crown />} label="Lucro líquido mês" value={brl(kpis.lucroMes)} delta="+14%" tone="success" />
        </div>
      </Section>

      {/* LINHA 2 — Aquisição & Conversão */}
      <Section title="Aquisição & Conversão" subtitle="leads novos e taxas">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={<Users />} label="Leads hoje" value={String(kpis.leadsHoje)} delta="+5" tone="accent" />
          <Kpi icon={<Users />} label="Leads semana" value={String(kpis.leadsSemana)} delta="+22" tone="accent" />
          <Kpi icon={<Target />} label="Conversão hoje" value={`${kpis.conversaoHoje}%`} delta="+3pp" tone="success" />
          <Kpi icon={<Target />} label="Conversão semana" value={`${kpis.conversaoSemana}%`} delta="+1pp" tone="success" />
          <Kpi icon={<Target />} label="Conversão mês" value={`${kpis.conversaoMes}%`} delta="-1pp" tone="warning" />
        </div>
      </Section>

      {/* LINHA 3 — Operação */}
      <Section title="Operação" subtitle="pedidos, recompra e risco">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<ShoppingBag />} label="Pedidos hoje" value={String(pedidosHoje)} delta="ao vivo" tone="primary" />
          <Kpi icon={<RefreshCw />} label="Recompra prevista" value={String(kpis.recompraPrevista)} delta="hoje" tone="success" />
          <Kpi icon={<AlertTriangle />} label="Clientes em risco" value={String(kpis.clientesRisco)} delta="-2" tone="destructive" />
          <Kpi icon={<Zap />} label="Taxa upsell" value={`${kpis.taxaUpsell}%`} delta="+4pp" tone="accent" />
        </div>
      </Section>

      {/* GRÁFICOS */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Crescimento mensal · 8 meses</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Faturamento consolidado</p>
            </div>
            <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-md inline-flex items-center gap-1">
              <ArrowUpRight className="size-3" /> +68% YTD
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={crescimentoMensal}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => brl(v)}
                />
                <Line type="monotone" dataKey="valor" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-primary)" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Crescimento diário (semana)</h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={vendasSemana}>
                  <defs>
                    <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                  <Area type="monotone" dataKey="vendas" stroke="var(--color-accent)" strokeWidth={2} fill="url(#dg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* FUNIL */}
        <div className="card-soft p-5">
          <h3 className="font-semibold">Funil de conversão</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Lead → Recompra</p>
          <div className="mt-4 space-y-2">
            {funilDados.map((f, i) => {
              const prev = i === 0 ? f.valor : funilDados[i - 1].valor;
              const taxa = ((f.valor / funilDados[0].valor) * 100).toFixed(0);
              const conv = i === 0 ? null : ((f.valor / prev) * 100).toFixed(0);
              const width = (f.valor / funilDados[0].valor) * 100;
              return (
                <div key={f.etapa}>
                  <div className="flex justify-between items-baseline text-xs mb-1">
                    <span className="font-semibold">{f.etapa}</span>
                    <span className="text-muted-foreground">
                      <b className="text-foreground">{f.valor}</b> · {taxa}%
                      {conv && <span className="text-success ml-1">↳ {conv}%</span>}
                    </span>
                  </div>
                  <div className="h-7 rounded-lg bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{ width: `${width}%`, background: f.cor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ALERTAS IA + WHATSAPP */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold inline-flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Alertas da IA
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Análise automática a cada 15 min</p>
            </div>
          </div>
          <ul className="grid sm:grid-cols-2 gap-2.5">
            <IaAlert tone="destructive" icon={<TrendingDown />} title="Queda de conversão −3pp"
              desc="Conversão de hoje 31% vs meta 34%. Reveja respostas IA." />
            <IaAlert tone="success" icon={<TrendingUp />} title="Recompra +18% em ração"
              desc="Categoria premium acelera. Estoque suficiente para 9 dias." />
            <IaAlert tone="destructive" icon={<AlertCircle />} title="Estoque crítico · 7 itens"
              desc="Shampoo Hipoalergênico tem 1 unidade." />
            <IaAlert tone="warning" icon={<Target />} title="Campanha ruim · Black Pet"
              desc="ROI 1.1x. Sugiro pausar e realocar verba." />
            <IaAlert tone="primary" icon={<Lightbulb />} title="Oportunidade · Royal Canin Renal"
              desc="Pedido 8x sem estoque. R$ 2.560 em vendas perdidas." />
            <IaAlert tone="primary" icon={<Crown />} title="Cliente lucrativo: Roberto Lima"
              desc="Margem 39%, comprou +3 vezes esse mês." />
          </ul>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3 inline-flex items-center gap-2">
            WhatsApp · ao vivo
            <span className="size-2 rounded-full bg-success animate-pulse" />
          </h3>
          <ul className="space-y-3">
            {conversas.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <div className="size-9 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center font-semibold text-xs">
                  {c.cliente.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="text-sm font-semibold truncate">{c.cliente}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.hora}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.ultima}</p>
                </div>
                {c.naoLidas > 0 && (
                  <span className="text-[10px] font-bold size-5 grid place-items-center rounded-full bg-success text-success-foreground">{c.naoLidas}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {showRelatorio && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50" onClick={()=>!enviandoRel && setShowRelatorio(false)}>
          <div className="card-soft p-5 w-full max-w-sm space-y-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-semibold inline-flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Relatório IA</h3>
              <button disabled={enviandoRel} onClick={()=>setShowRelatorio(false)} className="p-1 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Gerar relatório completo do dia e enviar no WhatsApp?</p>
            <div className="flex gap-2">
              <button disabled={enviandoRel} onClick={()=>setShowRelatorio(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold disabled:opacity-40">Cancelar</button>
              <button disabled={enviandoRel} onClick={enviarRelatorio} className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {enviandoRel ? <><Loader2 className="size-4 animate-spin" /> Enviando…</> : "Enviar agora"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2.5 px-1">
        <h2 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">{title}</h2>
        {subtitle && <span className="text-[10px] text-muted-foreground/70">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ icon, label, value, delta, tone }: {
  icon: React.ReactNode; label: string; value: string; delta: string;
  tone: "primary" | "success" | "accent" | "warning" | "destructive";
}) {
  const tones = {
    primary: { bg: "bg-primary/10", fg: "text-primary", delta: "text-success" },
    success: { bg: "bg-success/10", fg: "text-success", delta: "text-success" },
    accent: { bg: "bg-accent/10", fg: "text-accent", delta: "text-success" },
    warning: { bg: "bg-accent/10", fg: "text-accent", delta: "text-accent" },
    destructive: { bg: "bg-destructive/10", fg: "text-destructive", delta: "text-destructive" },
  }[tone];
  return (
    <div className="card-soft p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className={`size-8 rounded-lg grid place-items-center ${tones.bg} ${tones.fg} [&_svg]:size-4`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold ${tones.delta}`}>{delta}</span>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-0.5 tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function IaAlert({ tone, icon, title, desc }: {
  tone: "destructive" | "warning" | "success" | "primary"; icon: React.ReactNode; title: string; desc: string;
}) {
  const [loading, setLoading] = useState(false);
  const tones = {
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-accent/15 text-accent",
    success: "bg-success/10 text-success",
    primary: "bg-primary/10 text-primary",
  }[tone];
  async function agir() {
    setLoading(true);
    try {
      const r = await fetch(WEBHOOK_ALERTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alerta: title, descricao: desc, timestamp: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error();
      toast.success("Ação enviada ✅");
    } catch {
      toast.error("Erro ao enviar. Verifique o n8n ❌");
    } finally {
      setLoading(false);
    }
  }
  return (
    <li className="flex gap-3 p-2.5 rounded-xl border border-border hover:bg-secondary/40 transition">
      <div className={`size-8 rounded-lg grid place-items-center shrink-0 ${tones} [&_svg]:size-4`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <button onClick={agir} disabled={loading} className="self-center h-7 px-2.5 rounded-lg bg-foreground text-background text-[10px] font-bold inline-flex items-center gap-1 disabled:opacity-60">
        {loading ? <Loader2 className="size-3 animate-spin" /> : "Agir"}
      </button>
    </li>
  );
}
