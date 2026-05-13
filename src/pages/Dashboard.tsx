import { kpis, vendasSemana, origemLeads, pedidos, conversas } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import {
  TrendingUp, ShoppingBag, Wallet, RefreshCw, Crown, AlertTriangle,
  ArrowUpRight, Sparkles
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Bom dia, Ana 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aqui está o resumo do Mundo Pet — atualizado em tempo real.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium hover:bg-secondary transition">
            Hoje
          </button>
          <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition inline-flex items-center gap-2">
            <Sparkles className="size-4" /> Relatório IA
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-4">
        <KpiCard icon={<Wallet className="size-4" />} label="Faturamento hoje" value={brl(kpis.faturamentoHoje)} delta="+18%" />
        <KpiCard icon={<TrendingUp className="size-4" />} label="Faturamento mês" value={brl(kpis.faturamentoMes)} delta="+12%" />
        <KpiCard icon={<ShoppingBag className="size-4" />} label="Pedidos hoje" value={String(kpis.pedidosHoje)} delta="+6" />
        <KpiCard icon={<RefreshCw className="size-4" />} label="Recompra" value={`${kpis.taxaRecompra}%`} delta="+3%" />
        <KpiCard icon={<Crown className="size-4" />} label="Ticket médio" value={brl(kpis.ticketMedio)} delta="+R$ 8" />
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Vendas e lucro · últimos 7 dias</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Comparativo diário</p>
            </div>
            <span className="text-xs font-semibold text-success bg-success/10 px-2 py-1 rounded-md inline-flex items-center gap-1">
              <ArrowUpRight className="size-3" /> +14%
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={vendasSemana}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => brl(v)}
                />
                <Area type="monotone" dataKey="vendas" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#g1)" />
                <Area type="monotone" dataKey="lucro" stroke="var(--color-accent)" strokeWidth={2.5} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold">Origem dos leads</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Onde seus clientes vêm</p>
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={origemLeads} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {origemLeads.map((_, i) => (
                    <Cell key={i} fill={["var(--color-primary)","var(--color-accent)","var(--color-success)","var(--color-chart-4)","var(--color-muted-foreground)"][i]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Lower row */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Pedidos recentes</h3>
            <a className="text-xs font-semibold text-primary">Ver todos →</a>
          </div>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-medium px-2 py-2">Pedido</th>
                  <th className="font-medium px-2 py-2">Cliente</th>
                  <th className="font-medium px-2 py-2 hidden md:table-cell">Bairro</th>
                  <th className="font-medium px-2 py-2">Status</th>
                  <th className="font-medium px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.slice(0, 6).map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-2 py-3 font-mono text-xs font-semibold">{p.id}</td>
                    <td className="px-2 py-3">
                      <div className="font-medium">{p.cliente}</div>
                      <div className="text-xs text-muted-foreground">{p.pet}</div>
                    </td>
                    <td className="px-2 py-3 hidden md:table-cell text-muted-foreground">{p.bairro}</td>
                    <td className="px-2 py-3"><StatusBadge value={p.status} /></td>
                    <td className="px-2 py-3 text-right font-semibold">{brl(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-soft p-5">
            <h3 className="font-semibold mb-3">Alertas inteligentes</h3>
            <ul className="space-y-3 text-sm">
              <Alert color="destructive" icon={<AlertTriangle className="size-4" />} title={`${kpis.estoqueCritico} produtos em ruptura`} desc="Areia Pipicat 12kg acaba em 2 dias." />
              <Alert color="accent" icon={<RefreshCw className="size-4" />} title="14 recompras previstas hoje" desc="A IA já enviou 8 ofertas no WhatsApp." />
              <Alert color="primary" icon={<Crown className="size-4" />} title={`${kpis.clientesVip} clientes VIP ativos`} desc="Considere campanha exclusiva de fim de mês." />
            </ul>
          </div>

          <div className="card-soft p-5">
            <h3 className="font-semibold mb-3">WhatsApp · ao vivo</h3>
            <ul className="space-y-3">
              {conversas.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <div className="size-9 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold text-xs">
                    {c.cliente.split(" ").map(n=>n[0]).slice(0,2).join("")}
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
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, delta }: { icon: React.ReactNode; label: string; value: string; delta: string }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="size-8 rounded-lg bg-secondary grid place-items-center">{icon}</div>
        <span className="text-[11px] font-semibold text-success">{delta}</span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-0.5 tracking-tight">{value}</div>
    </div>
  );
}

function Alert({ color, icon, title, desc }: { color: "destructive"|"accent"|"primary"; icon: React.ReactNode; title: string; desc: string }) {
  const cls = {
    destructive: "bg-destructive/10 text-destructive",
    accent: "bg-accent/15 text-accent",
    primary: "bg-primary/15 text-primary",
  }[color];
  return (
    <li className="flex gap-3">
      <div className={`size-9 rounded-lg grid place-items-center shrink-0 ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}
