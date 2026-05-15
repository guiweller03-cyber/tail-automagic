import { vendasSemana, kpis } from "@/lib/mock";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Target, Receipt, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVendas } from "@/contexts/VendasContext";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const META_KEY = "meta_mes";
const META_DEFAULT = 120000;

export function Financeiro() {
  const { vendas } = useVendas();
  const [meta, setMeta] = useState<number>(META_DEFAULT);
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftMeta, setDraftMeta] = useState<string>(String(META_DEFAULT));

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(META_KEY) : null;
    if (v) setMeta(Number(v) || META_DEFAULT);
  }, []);

  function salvarMeta() {
    const n = Math.max(0, Number(draftMeta.replace(/[^\d]/g, "")) || META_DEFAULT);
    setMeta(n);
    if (typeof window !== "undefined") localStorage.setItem(META_KEY, String(n));
    setEditingMeta(false);
  }

  const receitaHojeReal = useMemo(
    () => vendas.filter(v => v.data === "hoje" && v.status === "Concluída").reduce((s, v) => s + v.total, 0),
    [vendas],
  );

  const faturamentoMes = kpis.faturamentoMes + receitaHojeReal;
  const ticketReal = kpis.pedidosHoje > 0 ? kpis.faturamentoMes / Math.max(1, kpis.pedidosHoje * 20) : 0;
  const ticketMedioReal = faturamentoMes / Math.max(1, vendasSemana.length * 4 + vendas.length);

  const hoje = new Date();
  const diasPassados = hoje.getDate();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = (faturamentoMes / Math.max(1, diasPassados)) * diasMes;
  const pctProj = (projecao / meta) * 100;
  const projTone = projecao >= meta ? "text-success" : pctProj >= 80 ? "text-accent" : "text-destructive";

  const pctMeta = Math.min(100, (faturamentoMes / meta) * 100);
  const falta = Math.max(0, meta - faturamentoMes);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada de vendas, custos e margem</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Big label="Faturamento mês" value={brl(faturamentoMes)} delta="+12%" up />
        <Big label="Lucro líquido" value={brl(kpis.lucroMes)} delta="+18%" up />
        <Big label="Ticket médio real" value={brl(ticketMedioReal || ticketReal || kpis.ticketMedio)} delta="ao vivo" up icon={<Receipt className="size-4" />} />
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
            <Line label="Receita bruta (mês)" value={brl(faturamentoMes)} />
            <Line label="(+) Receita real hoje" value={brl(receitaHojeReal)} accent />
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
        <div className="flex items-baseline gap-2 mb-3 flex-wrap">
          <span className="text-2xl font-bold tabular-nums">{brl(faturamentoMes)}</span>
          <span className="text-sm text-muted-foreground">/</span>
          {editingMeta ? (
            <input
              autoFocus
              type="number"
              value={draftMeta}
              onChange={e => setDraftMeta(e.target.value)}
              onBlur={salvarMeta}
              onKeyDown={e => { if (e.key === "Enter") salvarMeta(); if (e.key === "Escape") setEditingMeta(false); }}
              className="w-36 h-9 px-2 rounded-lg bg-secondary text-base font-bold tabular-nums outline-none focus:ring-2 ring-primary/30"
            />
          ) : (
            <button onClick={()=>{ setDraftMeta(String(meta)); setEditingMeta(true); }} className="text-sm font-semibold inline-flex items-center gap-1.5 hover:text-primary">
              {brl(meta)} <Pencil className="size-3" />
            </button>
          )}
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pctMeta}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {pctMeta.toFixed(0)}% atingido · {falta > 0 ? `faltam ${brl(falta)} para bater a meta` : "🎉 meta batida!"}
        </p>
        <p className={`text-xs mt-1 font-semibold ${projTone}`}>
          📈 No ritmo atual, você deve faturar {brl(projecao)} este mês ({pctProj.toFixed(0)}% da meta)
        </p>
      </div>
    </div>
  );
}

function Big({ label, value, delta, up, icon }: { label: string; value: string; delta: string; up?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        {icon ?? <Wallet className="size-4" />}
        <span className={`text-[11px] font-semibold inline-flex items-center gap-0.5 ${up ? "text-success" : "text-destructive"}`}>
          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />} {delta}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-3">{label}</div>
      <div className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function Line({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: boolean }) {
  return (
    <li className={`flex justify-between ${bold ? "font-bold pt-2 border-t border-border" : ""} ${muted ? "text-muted-foreground" : ""} ${accent ? "text-success font-semibold" : ""}`}>
      <span>{label}</span><span className="tabular-nums">{value}</span>
    </li>
  );
}
