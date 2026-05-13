import { vendasSemana, kpis } from "@/lib/mock";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Financeiro() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada de vendas, custos e margem</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Big label="Faturamento mês" value={brl(kpis.faturamentoMes)} delta="+12%" up />
        <Big label="Lucro líquido" value={brl(kpis.lucroMes)} delta="+18%" up />
        <Big label="CAC" value={brl(11.4)} delta="-8%" up />
        <Big label="LTV" value={brl(1240)} delta="+5%" up />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Receita vs Lucro · semana</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendasSemana}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                <Bar dataKey="vendas" fill="var(--color-primary)" radius={[8,8,0,0]} />
                <Bar dataKey="lucro" fill="var(--color-accent)" radius={[8,8,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3">DRE simplificado</h3>
          <ul className="text-sm space-y-2.5">
            <Line label="Receita bruta" value={brl(87420)} />
            <Line label="(-) Custos produtos" value={brl(-48230)} muted />
            <Line label="(-) Frete" value={brl(-3120)} muted />
            <Line label="(-) Despesas gerais" value={brl(-11890)} muted />
            <Line label="Lucro líquido" value={brl(24180)} bold />
            <li className="pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>Margem</span><span className="font-bold text-success">27,7%</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="card-soft p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Meta do mês</h3>
          <Target className="size-4 text-muted-foreground" />
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-bold">{brl(87420)}</span>
          <span className="text-sm text-muted-foreground">/ {brl(120000)}</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: "72%" }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">72% atingido · faltam {brl(32580)} para bater a meta</p>
      </div>
    </div>
  );
}

function Big({ label, value, delta, up }: { label: string; value: string; delta: string; up?: boolean }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <Wallet className="size-4" />
        <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${up ? "text-success" : "text-destructive"}`}>
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />} {delta}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-3">{label}</div>
      <div className="text-2xl font-bold tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

function Line({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <li className={`flex justify-between ${bold ? "font-bold pt-2 border-t border-border" : ""} ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </li>
  );
}
