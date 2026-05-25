import type { DashboardData } from "@/lib/crm-supabase";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { useEffect, useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const vazio: Pick<DashboardData, "kpis" | "vendasSemana"> = {
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
  vendasSemana: [],
};

export function Financeiro() {
  const [financeiro, setFinanceiro] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const custosProdutos = Math.max(0, financeiro.kpis.faturamentoMes - financeiro.kpis.lucroMes);
  const margem =
    financeiro.kpis.faturamentoMes > 0
      ? (financeiro.kpis.lucroMes / financeiro.kpis.faturamentoMes) * 100
      : 0;

  useEffect(() => {
    async function carregarFinanceiro() {
      try {
        const response = await fetch("/api/crm/dashboard", { cache: "no-store" });
        const data = (await response.json()) as DashboardData | { erro?: string };
        if (!response.ok) {
          throw new Error("erro" in data ? data.erro : "Erro ao carregar financeiro");
        }

        setFinanceiro({
          kpis: (data as DashboardData).kpis,
          vendasSemana: (data as DashboardData).vendasSemana,
        });
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Erro desconhecido");
      }
    }

    void carregarFinanceiro();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada de vendas, custos e margem
        </p>
      </div>

      {erro && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Big label="Faturamento mês" value={brl(financeiro.kpis.faturamentoMes)} delta="0%" up />
        <Big label="Lucro líquido" value={brl(financeiro.kpis.lucroMes)} delta="0%" up />
        <Big label="CAC" value={brl(0)} delta="0%" up />
        <Big label="LTV" value={brl(0)} delta="0%" up />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Receita vs Lucro · semana</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeiro.vendasSemana}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="dia"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
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
                <Bar dataKey="vendas" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                <Bar dataKey="lucro" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3">DRE simplificado</h3>
          <ul className="text-sm space-y-2.5">
            <Line label="Receita bruta" value={brl(financeiro.kpis.faturamentoMes)} />
            <Line label="(-) Custos produtos" value={brl(custosProdutos)} muted />
            <Line label="(-) Frete" value={brl(0)} muted />
            <Line label="(-) Despesas gerais" value={brl(0)} muted />
            <Line label="Lucro líquido" value={brl(financeiro.kpis.lucroMes)} bold />
            <li className="pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>Margem</span>
              <span className="font-bold text-success">{margem.toFixed(1)}%</span>
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
          <span className="text-2xl font-bold">{brl(0)}</span>
          <span className="text-sm text-muted-foreground">/ {brl(0)}</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: "0%" }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          0% atingido · faltam {brl(0)} para bater a meta
        </p>
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  delta,
  up,
}: {
  label: string;
  value: string;
  delta: string;
  up?: boolean;
}) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <Wallet className="size-4" />
        <span
          className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${up ? "text-success" : "text-destructive"}`}
        >
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />} {delta}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-3">{label}</div>
      <div className="text-2xl font-bold tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <li
      className={`flex justify-between ${bold ? "font-bold pt-2 border-t border-border" : ""} ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </li>
  );
}
