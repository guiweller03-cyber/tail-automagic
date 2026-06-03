import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Target, Receipt, Pencil,
  Fuel, Plus, ChevronDown, ChevronUp, X, Check, AlertCircle,
  Megaphone, Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { DashboardData } from "@/lib/crm-supabase";
import { onCrmReload } from "@/lib/crm-refresh";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const META_KEY = "meta_mes";
const META_DEFAULT = 120000;
const FUEL_KEY = "financeiro_abastecimentos";
const EXPENSES_KEY = "financeiro_despesas";
const MARKETING_KEY = "financeiro_marketing";

function readStoredList<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredList<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function useStoredList<T>(key: string, fallback: T[]) {
  const [list, setList] = useState<T[]>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setList(readStoredList(key, fallback));
    setReady(true);
  }, [key, fallback]);

  useEffect(() => {
    if (ready) writeStoredList(key, list);
  }, [key, list, ready]);

  return [list, setList] as const;
}

export function Financeiro() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Vendas, combustível, despesas e marketing num só lugar</p>
      </div>

      <Tabs defaultValue="vendas" className="space-y-5">
        <TabsList className="h-11 p-1">
          <TabsTrigger value="vendas" className="px-4 h-9">Vendas</TabsTrigger>
          <TabsTrigger value="combustivel" className="px-4 h-9">Combustível</TabsTrigger>
          <TabsTrigger value="despesas" className="px-4 h-9">Despesas</TabsTrigger>
          <TabsTrigger value="marketing" className="px-4 h-9">Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="space-y-5"><AbaVendas /></TabsContent>
        <TabsContent value="combustivel" className="space-y-5"><AbaCombustivel /></TabsContent>
        <TabsContent value="despesas" className="space-y-5"><AbaDespesas /></TabsContent>
        <TabsContent value="marketing" className="space-y-5"><AbaMarketing /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   ABA VENDAS
   ============================================================ */
function AbaVendas() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [meta, setMeta] = useState<number>(META_DEFAULT);
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftMeta, setDraftMeta] = useState<string>(String(META_DEFAULT));

  useEffect(() => {
    let alive = true;
    async function loadDashboard() {
      const res = await fetch("/api/crm/dashboard", { cache: "no-store" });
      if (alive) setDashboard(res.ok ? await res.json() : null);
    }
    void loadDashboard();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return onCrmReload(() => {
      void fetch("/api/crm/dashboard", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: DashboardData | null) => setDashboard(data));
    });
  }, []);

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

  const kpis = dashboard?.kpis ?? { faturamentoHoje: 0, faturamentoMes: 0, pedidosHoje: 0, lucroMes: 0 };
  const vendasSemana = dashboard?.vendasSemana ?? [];
  const receitaHojeReal = kpis.faturamentoHoje;

  const faturamentoMes = kpis.faturamentoMes;
  const pedidosMes = Math.max(1, kpis.pedidosHoje);
  const ticketMedioReal = faturamentoMes / pedidosMes;
  const custosProdutos = 0;
  const frete = 0;
  const despesasGerais = 0;

  const hoje = new Date();
  const diasPassados = hoje.getDate();
  const diasMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const projecao = (faturamentoMes / Math.max(1, diasPassados)) * diasMes;
  const pctProj = (projecao / meta) * 100;
  const projTone = projecao >= meta ? "text-success" : pctProj >= 80 ? "text-accent" : "text-destructive";

  const pctMeta = Math.min(100, (faturamentoMes / meta) * 100);
  const falta = Math.max(0, meta - faturamentoMes);

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Big label="Faturamento mês" value={brl(faturamentoMes)} delta="+12%" up />
        <Big label="Lucro líquido" value={brl(kpis.lucroMes)} delta="+18%" up />
        <Big label="Ticket médio real" value={brl(ticketMedioReal)} delta="ao vivo" up icon={<Receipt className="size-4" />} />
        <Big label="CAC" value={brl(0)} delta="sem dados" up />
        <Big label="LTV" value={brl(0)} delta="sem dados" up />
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
            <Line label="(-) Custos produtos" value={brl(-custosProdutos)} muted />
            <Line label="(-) Frete" value={brl(-frete)} muted />
            <Line label="(-) Despesas gerais" value={brl(-despesasGerais)} muted />
            <Line label="Lucro líquido" value={brl(kpis.lucroMes)} bold />
            <li className="pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>Margem</span><span className="font-bold text-success">{faturamentoMes > 0 ? `${((kpis.lucroMes / faturamentoMes) * 100).toFixed(1)}%` : "0,0%"}</span>
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
          📈 No ritmo atual, você fatura {brl(projecao)} este mês ({pctProj.toFixed(0)}% da meta)
        </p>
      </div>
    </>
  );
}

/* ============================================================
   ABA COMBUSTÍVEL
   ============================================================ */
type Abastecimento = {
  id: string; data: string; kmAtual: number; litros: number;
  valorLitro: number; valorTotal: number; posto?: string; obs?: string;
};

const abastecimentosIniciais: Abastecimento[] = [];

function AbaCombustivel() {
  const [lista, setLista] = useStoredList<Abastecimento>(FUEL_KEY, abastecimentosIniciais);
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState("");
  const [litros, setLitros] = useState("");
  const [valorLitro, setValorLitro] = useState("");
  const [posto, setPosto] = useState("");
  const [obs, setObs] = useState("");

  const valorTotalForm = (Number(litros) || 0) * (Number(valorLitro) || 0);

  const ordenada = [...lista].sort((a, b) => a.kmAtual - b.kmAtual);
  const linhas = ordenada.map((a, i) => {
    const prev = i > 0 ? ordenada[i - 1] : null;
    const kmPerc = prev ? a.kmAtual - prev.kmAtual : null;
    const kml = kmPerc && a.litros > 0 ? kmPerc / a.litros : null;
    const cpkm = kmPerc ? a.valorTotal / kmPerc : null;
    return { ...a, kmPerc, kml, cpkm };
  });
  const kmls = linhas.map(l => l.kml).filter((v): v is number => v != null);
  const melhor = kmls.length ? Math.max(...kmls) : null;
  const pior = kmls.length ? Math.min(...kmls) : null;

  const totalGasto = lista.reduce((s, a) => s + a.valorTotal, 0);
  const kmTotal = ordenada.length > 1 ? ordenada[ordenada.length - 1].kmAtual - ordenada[0].kmAtual : 0;
  const totalLitros = lista.reduce((s, a) => s + a.litros, 0);
  const mediaGeral = totalLitros > 0 ? kmTotal / totalLitros : 0;
  const custoPorKm = kmTotal > 0 ? totalGasto / kmTotal : 0;

  function salvar() {
    if (!km || !litros || !valorLitro) { toast.error("Preencha KM, litros e valor por litro"); return; }
    const [y, m, d] = data.split("-");
    const novo: Abastecimento = {
      id: `a${Date.now()}`, data: `${d}/${m}/${y}`,
      kmAtual: Number(km), litros: Number(litros), valorLitro: Number(valorLitro),
      valorTotal: Number(litros) * Number(valorLitro),
      posto: posto || undefined, obs: obs || undefined,
    };
    setLista(prev => [...prev, novo]);
    setKm(""); setLitros(""); setValorLitro(""); setPosto(""); setObs("");
    setAberto(false);
    toast.success("Abastecimento registrado ⛽");
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Big label="Total gasto" value={brl(totalGasto)} delta="combustível" icon={<Fuel className="size-4" />} up />
        <Big label="KM percorridos" value={`${kmTotal.toLocaleString("pt-BR")} km`} delta="período" up />
        <Big label="Média geral" value={`${mediaGeral.toFixed(2)} km/l`} delta="real" up />
        <Big label="Custo por km" value={brl(custoPorKm)} delta="médio" up />
      </div>

      <div className="card-soft">
        <button onClick={() => setAberto(v => !v)} className="w-full p-4 flex items-center justify-between font-semibold">
          <span className="inline-flex items-center gap-2"><Plus className="size-4" /> Registrar abastecimento</span>
          {aberto ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {aberto && (
          <div className="px-4 pb-4 border-t border-border pt-4 space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Data"><input type="date" value={data} onChange={e=>setData(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="KM atual"><input type="number" value={km} onChange={e=>setKm(e.target.value)} placeholder="48900" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Litros"><input type="number" step="0.1" value={litros} onChange={e=>setLitros(e.target.value)} placeholder="30" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Valor por litro"><input type="number" step="0.01" value={valorLitro} onChange={e=>setValorLitro(e.target.value)} placeholder="6.29" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Posto (opcional)"><input value={posto} onChange={e=>setPosto(e.target.value)} placeholder="Shell Tijucas" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Observação (opcional)"><input value={obs} onChange={e=>setObs(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            </div>
            <div className="flex items-center justify-between bg-secondary rounded-xl p-4">
              <span className="text-sm text-muted-foreground">Valor total calculado</span>
              <span className="text-2xl font-bold tabular-nums text-primary">{brl(valorTotalForm)}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setAberto(false)} className="h-10 px-4 rounded-lg bg-secondary text-sm font-semibold">Cancelar</button>
              <button onClick={salvar} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold">Salvar</button>
            </div>
          </div>
        )}
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">Histórico de abastecimentos</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-secondary/40">
              <tr>
                <th className="text-left p-3">Data</th>
                <th className="text-right p-3">KM atual</th>
                <th className="text-right p-3">KM perc.</th>
                <th className="text-right p-3">Litros</th>
                <th className="text-right p-3">R$/litro</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Km/l</th>
                <th className="text-right p-3">Custo/km</th>
                <th className="text-left p-3">Posto</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const tone = l.kml != null && l.kml === melhor ? "bg-success/10"
                  : l.kml != null && l.kml === pior && melhor !== pior ? "bg-destructive/10" : "";
                return (
                  <tr key={l.id} className={`border-t border-border ${tone}`}>
                    <td className="p-3">{l.data}</td>
                    <td className="p-3 text-right tabular-nums">{l.kmAtual.toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-right tabular-nums">{l.kmPerc != null ? `${l.kmPerc} km` : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{l.litros.toFixed(1)} L</td>
                    <td className="p-3 text-right tabular-nums">{brl(l.valorLitro)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{brl(l.valorTotal)}</td>
                    <td className="p-3 text-right tabular-nums">{l.kml != null ? l.kml.toFixed(2) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{l.cpkm != null ? brl(l.cpkm) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{l.posto ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ABA DESPESAS
   ============================================================ */
type CategoriaDespesa = "aluguel" | "energia" | "internet" | "embalagem" | "manutencao" | "salario" | "contador" | "outros";
type Despesa = {
  id: string; data: string; categoria: CategoriaDespesa;
  descricao: string; valor: number; recorrente: boolean; pago: boolean;
};

const CAT_LABEL: Record<CategoriaDespesa, string> = {
  aluguel: "Aluguel", energia: "Energia", internet: "Internet", embalagem: "Embalagem",
  manutencao: "Manutenção", salario: "Salário", contador: "Contador", outros: "Outros",
};
const CAT_EMOJI: Record<CategoriaDespesa, string> = {
  aluguel: "🏠", energia: "⚡", internet: "🌐", embalagem: "📦",
  manutencao: "🔧", salario: "👤", contador: "📋", outros: "💼",
};

const despesasIniciais: Despesa[] = [];

function AbaDespesas() {
  const [lista, setLista] = useStoredList<Despesa>(EXPENSES_KEY, despesasIniciais);
  const [modal, setModal] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0,10));
  const [categoria, setCategoria] = useState<CategoriaDespesa>("outros");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [pago, setPago] = useState(true);

  useEscape(() => setModal(false), modal);

  const total = lista.reduce((s, d) => s + d.valor, 0);
  const totalPago = lista.filter(d => d.pago).reduce((s, d) => s + d.valor, 0);
  const totalPendente = total - totalPago;

  const porCategoria = lista.reduce<Record<string, number>>((acc, d) => {
    acc[d.categoria] = (acc[d.categoria] || 0) + d.valor; return acc;
  }, {});
  const maiorEntry = Object.entries(porCategoria).sort((a,b)=>b[1]-a[1])[0];

  const grupos = Object.entries(porCategoria).sort((a,b)=>b[1]-a[1]);

  function salvar() {
    if (!descricao || !valor) { toast.error("Preencha descrição e valor"); return; }
    const [y, m, d] = data.split("-");
    setLista(prev => [...prev, {
      id: `d${Date.now()}`, data: `${d}/${m}/${y}`, categoria, descricao,
      valor: Number(valor), recorrente, pago,
    }]);
    setDescricao(""); setValor(""); setRecorrente(false); setPago(true); setCategoria("outros");
    setModal(false);
    toast.success("Despesa adicionada");
  }

  function togglePago(id: string) {
    setLista(prev => prev.map(d => d.id === id ? { ...d, pago: !d.pago } : d));
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Big label="Total do mês" value={brl(total)} delta="despesas" up />
        <Big label="Pago" value={brl(totalPago)} delta="quitado" up />
        <Big label="Pendente" value={brl(totalPendente)} delta={totalPendente > 0 ? "atenção" : "ok"} up={totalPendente === 0} icon={<AlertCircle className="size-4" />} />
        <Big label="Maior despesa" value={maiorEntry ? brl(maiorEntry[1]) : "—"} delta={maiorEntry ? CAT_LABEL[maiorEntry[0] as CategoriaDespesa] : "—"} up />
      </div>

      <div className="flex justify-end">
        <button onClick={()=>setModal(true)} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2">
          <Plus className="size-4" /> Nova despesa
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2 space-y-4">
          {grupos.map(([cat, vTot]) => {
            const itens = lista.filter(d => d.categoria === cat);
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold inline-flex items-center gap-2">
                    <span className="text-lg">{CAT_EMOJI[cat as CategoriaDespesa]}</span>
                    {CAT_LABEL[cat as CategoriaDespesa]}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">{brl(vTot)}</span>
                </div>
                <ul className="space-y-2">
                  {itens.map(d => (
                    <li key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/40">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{d.descricao}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          {d.data}
                          {d.recorrente && <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold uppercase">Recorrente</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold tabular-nums">{brl(d.valor)}</span>
                        <button onClick={()=>togglePago(d.id)} className={`h-7 px-2.5 rounded-md text-xs font-bold ${d.pago ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                          {d.pago ? "Pago" : "Pendente"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3">Distribuição por categoria</h3>
          <ul className="space-y-2.5">
            {grupos.map(([cat, v]) => {
              const pct = total > 0 ? (v / total) * 100 : 0;
              return (
                <li key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="inline-flex items-center gap-1.5"><span>{CAT_EMOJI[cat as CategoriaDespesa]}</span>{CAT_LABEL[cat as CategoriaDespesa]}</span>
                    <span className="font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {modal && (
        <Modal onClose={()=>setModal(false)} title="Nova despesa">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Data"><input type="date" value={data} onChange={e=>setData(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Categoria">
              <select value={categoria} onChange={e=>setCategoria(e.target.value as CategoriaDespesa)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30">
                {Object.entries(CAT_LABEL).map(([k,v]) => <option key={k} value={k}>{CAT_EMOJI[k as CategoriaDespesa]} {v}</option>)}
              </select>
            </Field>
            <Field label="Descrição" full><input value={descricao} onChange={e=>setDescricao(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Valor"><input type="number" step="0.01" value={valor} onChange={e=>setValor(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <div className="flex items-center gap-4 pt-6">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={recorrente} onChange={e=>setRecorrente(e.target.checked)} /> Recorrente</label>
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={pago} onChange={e=>setPago(e.target.checked)} /> Já pago</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={()=>setModal(false)} className="h-10 px-4 rounded-lg bg-secondary text-sm font-semibold">Cancelar</button>
            <button onClick={salvar} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold">Salvar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ============================================================
   ABA MARKETING
   ============================================================ */
type TipoMkt = "meta_ads" | "influenciador" | "panfleto" | "cupom" | "brinde" | "outros";
type GastoMkt = {
  id: string; data: string; tipo: TipoMkt; descricao: string; valor: number;
  resultado?: string; roi?: number; campanha?: string; pago: boolean;
};
const TIPO_LABEL: Record<TipoMkt, string> = {
  meta_ads: "Meta Ads", influenciador: "Influenciador", panfleto: "Panfleto",
  cupom: "Cupom", brinde: "Brinde", outros: "Outros",
};
const TIPO_TONE: Record<TipoMkt, string> = {
  meta_ads: "bg-primary/15 text-primary",
  influenciador: "bg-accent/15 text-accent",
  panfleto: "bg-chart-4/15 text-chart-4",
  cupom: "bg-success/15 text-success",
  brinde: "bg-chart-2/15 text-chart-2",
  outros: "bg-muted text-foreground",
};
const gastosMktIniciais: GastoMkt[] = [];

function AbaMarketing() {
  const [lista, setLista] = useStoredList<GastoMkt>(MARKETING_KEY, gastosMktIniciais);
  const [modal, setModal] = useState(false);
  const [data, setData] = useState(() => new Date().toISOString().slice(0,10));
  const [tipo, setTipo] = useState<TipoMkt>("meta_ads");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [resultado, setResultado] = useState("");
  const [roi, setRoi] = useState("");
  const [campanha, setCampanha] = useState("");
  const [pago, setPago] = useState(true);

  useEscape(() => setModal(false), modal);

  const total = lista.reduce((s, g) => s + g.valor, 0);
  const rois = lista.map(g => g.roi).filter((v): v is number => v != null);
  const roiMedio = rois.length ? rois.reduce((s,v)=>s+v,0) / rois.length : 0;
  const melhor = [...lista].filter(g => g.roi != null).sort((a,b)=>(b.roi!)-(a.roi!))[0];
  const pendente = lista.filter(g => !g.pago).reduce((s,g)=>s+g.valor, 0);

  // Ranking por tipo
  const tipos: TipoMkt[] = ["meta_ads","influenciador","panfleto","cupom","brinde","outros"];
  const ranking = tipos.map(t => {
    const items = lista.filter(g => g.tipo === t && g.roi != null);
    const avg = items.length ? items.reduce((s,g)=>s+(g.roi||0),0) / items.length : 0;
    return { tipo: t, avg, count: items.length };
  }).filter(r => r.count > 0).sort((a,b)=>b.avg-a.avg);
  const maxAvg = ranking[0]?.avg || 1;

  function salvar() {
    if (!descricao || !valor) { toast.error("Preencha descrição e valor"); return; }
    const [y, m, d] = data.split("-");
    setLista(prev => [...prev, {
      id: `m${Date.now()}`, data: `${d}/${m}/${y}`, tipo, descricao,
      valor: Number(valor), resultado: resultado || undefined,
      roi: roi ? Number(roi) : undefined, campanha: campanha || undefined, pago,
    }]);
    setDescricao(""); setValor(""); setResultado(""); setRoi(""); setCampanha("");
    setPago(true); setTipo("meta_ads");
    setModal(false);
    toast.success("Gasto de marketing registrado");
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Big label="Total investido" value={brl(total)} delta="marketing" icon={<Megaphone className="size-4" />} up />
        <Big label="ROI médio" value={`${roiMedio.toFixed(1)}x`} delta="retorno" up />
        <Big label="Melhor ROI" value={melhor ? `${melhor.roi!.toFixed(1)}x` : "—"} delta={melhor ? TIPO_LABEL[melhor.tipo] : "—"} icon={<Trophy className="size-4" />} up />
        <Big label="Pendente" value={brl(pendente)} delta="a pagar" up={pendente === 0} />
      </div>

      <div className="flex justify-end">
        <button onClick={()=>setModal(true)} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo gasto
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-0 overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-border font-semibold">Gastos com marketing</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-secondary/40">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Tipo</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Campanha</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-left p-3">Resultado</th>
                  <th className="text-center p-3">ROI</th>
                  <th className="text-center p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(g => {
                  const roiBadge = g.roi == null
                    ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-muted-foreground">Aguardando</span>
                    : g.roi >= 3 ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-success/20 text-success">Excelente · {g.roi.toFixed(1)}x</span>
                    : g.roi < 1 ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-destructive/20 text-destructive">Prejuízo · {g.roi.toFixed(1)}x</span>
                    : <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-accent/20 text-accent">{g.roi.toFixed(1)}x</span>;
                  return (
                    <tr key={g.id} className="border-t border-border">
                      <td className="p-3 whitespace-nowrap">{g.data}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${TIPO_TONE[g.tipo]}`}>{TIPO_LABEL[g.tipo]}</span></td>
                      <td className="p-3">{g.descricao}</td>
                      <td className="p-3 text-muted-foreground">{g.campanha ?? "—"}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{brl(g.valor)}</td>
                      <td className="p-3 text-muted-foreground text-xs">{g.resultado ?? "—"}</td>
                      <td className="p-3 text-center">{roiBadge}</td>
                      <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded text-[11px] font-bold ${g.pago ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{g.pago ? "Pago" : "Pendente"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3 inline-flex items-center gap-2"><Trophy className="size-4" /> Ranking por ROI</h3>
          <ul className="space-y-3">
            {ranking.map(r => (
              <li key={r.tipo}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold">{TIPO_LABEL[r.tipo]}</span>
                  <span className="tabular-nums">{r.avg.toFixed(1)}x</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(r.avg / maxAvg) * 100}%` }} />
                </div>
              </li>
            ))}
            {ranking.length === 0 && <li className="text-sm text-muted-foreground">Sem ROI registrado ainda</li>}
          </ul>
        </div>
      </div>

      {modal && (
        <Modal onClose={()=>setModal(false)} title="Novo gasto de marketing">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Data"><input type="date" value={data} onChange={e=>setData(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Tipo">
              <select value={tipo} onChange={e=>setTipo(e.target.value as TipoMkt)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30">
                {Object.entries(TIPO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Descrição" full><input value={descricao} onChange={e=>setDescricao(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Campanha (opcional)"><input value={campanha} onChange={e=>setCampanha(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Valor"><input type="number" step="0.01" value={valor} onChange={e=>setValor(e.target.value)} className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="Resultado (opcional)" full><input value={resultado} onChange={e=>setResultado(e.target.value)} placeholder="42 leads · 11 vendas" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <Field label="ROI (opcional)"><input type="number" step="0.1" value={roi} onChange={e=>setRoi(e.target.value)} placeholder="3.2" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" /></Field>
            <div className="flex items-center pt-6">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={pago} onChange={e=>setPago(e.target.checked)} /> Já pago</label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={()=>setModal(false)} className="h-10 px-4 rounded-lg bg-secondary text-sm font-semibold">Cancelar</button>
            <button onClick={salvar} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold">Salvar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ============================================================
   COMPONENTES UTILITÁRIOS
   ============================================================ */
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-semibold text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60" onClick={onClose}>
      <div className="card-soft bg-background w-full max-w-lg p-5" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="size-8 rounded-lg grid place-items-center hover:bg-secondary"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useEscape(fn: () => void, when: boolean) {
  useEffect(() => {
    if (!when) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [when, fn]);
}
