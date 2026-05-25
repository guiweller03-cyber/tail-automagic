import type { DashboardData } from "@/lib/crm-supabase";
import {
  AlertTriangle,
  Crown,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Route } from "@/routes/index";
import { onCrmReload } from "@/lib/crm-refresh";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const numeroSeguro = (value: unknown) => {
  const numero = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numero) ? numero : 0;
};

const brl = (n: unknown) =>
  numeroSeguro(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dashboardZerado: DashboardData = {
  kpis: {
    faturamentoHoje: 0,
    faturamentoSemana: 0,
    faturamentoMes: 0,
    lucroMes: 0,
    ticketMedio: 0,
    pedidosHoje: 0,
    taxaRecompra: 0,
    taxaUpsell: 0,
    clientesVip: 0,
    clientesRisco: 0,
    estoqueCritico: 0,
    leadsHoje: 0,
    leadsSemana: 0,
    conversaoHoje: 0,
    conversaoSemana: 0,
    conversaoMes: 0,
    recompraPrevista: 0,
  },
  vendasSemana: [
    { dia: "Seg", vendas: 0, lucro: 0 },
    { dia: "Ter", vendas: 0, lucro: 0 },
    { dia: "Qua", vendas: 0, lucro: 0 },
    { dia: "Qui", vendas: 0, lucro: 0 },
    { dia: "Sex", vendas: 0, lucro: 0 },
    { dia: "Sab", vendas: 0, lucro: 0 },
    { dia: "Dom", vendas: 0, lucro: 0 },
  ],
  crescimentoMensal: [
    { mes: "Jan", valor: 0 },
    { mes: "Fev", valor: 0 },
    { mes: "Mar", valor: 0 },
    { mes: "Abr", valor: 0 },
    { mes: "Mai", valor: 0 },
    { mes: "Jun", valor: 0 },
    { mes: "Jul", valor: 0 },
    { mes: "Ago", valor: 0 },
  ],
  funilDados: [
    { etapa: "Leads", valor: 0, cor: "var(--color-chart-4)" },
    { etapa: "Conversas", valor: 0, cor: "var(--color-accent)" },
    { etapa: "Pedidos", valor: 0, cor: "var(--color-primary)" },
    { etapa: "Clientes ativos", valor: 0, cor: "var(--color-success)" },
    { etapa: "Recompra", valor: 0, cor: "var(--color-chart-2)" },
  ],
  conversas: [],
};

export function Dashboard() {
  const loaderData = Route.useLoaderData();
  const [dashboard, setDashboard] = useState(loaderData ?? dashboardZerado);

  useEffect(() => {
    if (loaderData) setDashboard(loaderData);
  }, [loaderData]);

  useEffect(() => {
    async function carregarDashboard() {
      try {
        const response = await fetch("/api/crm/dashboard", { cache: "no-store" });
        if (!response.ok) return;

        setDashboard((await response.json()) as DashboardData);
      } catch (error) {
        console.error("Erro ao atualizar dashboard:", error);
      }
    }

    void carregarDashboard();
    return onCrmReload(() => void carregarDashboard());
  }, []);

  const { kpis, vendasSemana, funilDados, crescimentoMensal, conversas } = dashboard;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel com dados reais sincronizados do CRM
          </p>
        </div>
        <a
          href="/assistente"
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Sparkles className="size-4" /> Relatório IA
        </a>
      </div>

      <Section title="Receita" subtitle="visão financeira do período">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={<Wallet />}
            label="Faturamento hoje"
            value={brl(kpis.faturamentoHoje)}
            delta="0%"
            tone="primary"
          />
          <Kpi
            icon={<TrendingUp />}
            label="Faturamento semana"
            value={brl(kpis.faturamentoSemana)}
            delta="0%"
            tone="primary"
          />
          <Kpi
            icon={<TrendingUp />}
            label="Faturamento mês"
            value={brl(kpis.faturamentoMes)}
            delta="0%"
            tone="primary"
          />
          <Kpi
            icon={<Crown />}
            label="Lucro líquido mês"
            value={brl(kpis.lucroMes)}
            delta="0%"
            tone="success"
          />
        </div>
      </Section>

      <Section title="Aquisição & Conversão" subtitle="leads novos e taxas">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi
            icon={<Users />}
            label="Leads hoje"
            value={String(kpis.leadsHoje)}
            delta="0"
            tone="accent"
          />
          <Kpi
            icon={<Users />}
            label="Leads semana"
            value={String(kpis.leadsSemana)}
            delta="0"
            tone="accent"
          />
          <Kpi
            icon={<Target />}
            label="Conversão hoje"
            value={`${kpis.conversaoHoje}%`}
            delta="0pp"
            tone="success"
          />
          <Kpi
            icon={<Target />}
            label="Conversão semana"
            value={`${kpis.conversaoSemana}%`}
            delta="0pp"
            tone="success"
          />
          <Kpi
            icon={<Target />}
            label="Conversão mês"
            value={`${kpis.conversaoMes}%`}
            delta="0pp"
            tone="warning"
          />
        </div>
      </Section>

      <Section title="Operação" subtitle="pedidos, recompra e risco">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            icon={<ShoppingBag />}
            label="Pedidos hoje"
            value={String(kpis.pedidosHoje)}
            delta="0"
            tone="primary"
          />
          <Kpi
            icon={<RefreshCw />}
            label="Recompra prevista"
            value={String(kpis.recompraPrevista)}
            delta="0"
            tone="success"
          />
          <Kpi
            icon={<AlertTriangle />}
            label="Clientes em risco"
            value={String(kpis.clientesRisco)}
            delta="0"
            tone="destructive"
          />
          <Kpi
            icon={<Zap />}
            label="Taxa upsell"
            value={`${kpis.taxaUpsell}%`}
            delta="0pp"
            tone="accent"
          />
        </div>
      </Section>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-semibold">Crescimento mensal</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Faturamento consolidado</p>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={crescimentoMensal}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => brl(v)}
                />
                <Line
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--color-primary)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "var(--color-primary)" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Crescimento diário
            </h4>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={vendasSemana}>
                  <defs>
                    <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="dia"
                    stroke="var(--color-muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => brl(v)}
                  />
                  <Area
                    type="monotone"
                    dataKey="vendas"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    fill="url(#dg)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold">Funil de conversão</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Lead → Recompra</p>
          <div className="mt-4 space-y-2">
            {funilDados.map((f, i) => {
              const prev = i === 0 ? f.valor : funilDados[i - 1].valor;
              const totalLeads = funilDados[0]?.valor ?? 0;
              const taxa = totalLeads > 0 ? ((f.valor / totalLeads) * 100).toFixed(0) : "0";
              const conv = i === 0 || prev <= 0 ? null : ((f.valor / prev) * 100).toFixed(0);
              const width = totalLeads > 0 ? (f.valor / totalLeads) * 100 : 0;

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

      <div className="card-soft p-5">
        <h3 className="font-semibold mb-3 inline-flex items-center gap-2">WhatsApp · ao vivo</h3>
        <ul className="space-y-3">
          {conversas.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-primary/15 grid place-items-center font-semibold text-xs">
                {c.cliente
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline gap-2">
                  <p className="text-sm font-semibold truncate">{c.cliente}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{c.hora}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.ultima}</p>
              </div>
              {c.naoLidas > 0 && (
                <span className="text-[10px] font-bold size-5 grid place-items-center rounded-full bg-success text-success-foreground">
                  {c.naoLidas}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2.5 px-1">
        <h2 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
          {title}
        </h2>
        {subtitle && <span className="text-[10px] text-muted-foreground/70">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  delta,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  tone: "primary" | "success" | "accent" | "warning" | "destructive";
}) {
  const tones = {
    primary: { bg: "bg-primary/10", fg: "text-primary", delta: "text-muted-foreground" },
    success: { bg: "bg-success/10", fg: "text-success", delta: "text-muted-foreground" },
    accent: { bg: "bg-accent/10", fg: "text-accent", delta: "text-muted-foreground" },
    warning: { bg: "bg-accent/10", fg: "text-accent", delta: "text-muted-foreground" },
    destructive: {
      bg: "bg-destructive/10",
      fg: "text-destructive",
      delta: "text-muted-foreground",
    },
  }[tone];

  return (
    <div className="card-soft p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div
          className={`size-8 rounded-lg grid place-items-center ${tones.bg} ${tones.fg} [&_svg]:size-4`}
        >
          {icon}
        </div>
        <span className={`text-[10px] font-bold ${tones.delta}`}>{delta}</span>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-0.5 tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}
