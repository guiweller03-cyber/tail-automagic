import { produtos as seedProdutos, recomprasPrevistas, type Produto } from "@/lib/mock";
import { AlertTriangle, TrendingUp, Package, Plus, Boxes, Handshake, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type EditCell = { sku: string; field: "preco" | "precoCompra" } | null;

function calcMargem(p: Produto) {
  const venda = p.preco;
  if (venda <= 0) return { pct: 0, lucro: 0, tipoLabel: "—" };
  if (p.tipo === "consignado") {
    const comissao = p.precoCompra * 0.7;
    const lucro = venda - comissao;
    return { pct: (lucro / venda) * 100, lucro, tipoLabel: "Líq. consig." };
  }
  const lucro = venda - p.precoCompra;
  return { pct: (lucro / venda) * 100, lucro, tipoLabel: "Bruta" };
}

function comportamentoCompra(produto: Produto) {
  // Cruza categoria com clientes que recompram itens dessa categoria
  const cat = produto.categoria.toLowerCase();
  const matches = recomprasPrevistas.filter(r => r.racao.toLowerCase().includes(cat.slice(0, 4)) || produto.nome.split(" ").some(t => t.length > 3 && r.racao.toLowerCase().includes(t.toLowerCase())));
  const count = new Set(matches.map(m => m.clienteId)).size;
  if (count >= 3) return { label: "Alta demanda", tone: "bg-success/15 text-success", count };
  if (count >= 1) return { label: "Média", tone: "bg-accent/15 text-accent", count };
  return { label: "Baixa", tone: "bg-secondary text-muted-foreground", count };
}

const CATEGORIAS = ["Ração", "Higiene", "Petiscos", "Saúde", "Brinquedos", "Acessórios"];

export function Estoque() {
  const [produtos, setProdutos] = useState<Produto[]>(seedProdutos);
  const [tipo, setTipo] = useState<"todos" | "próprio" | "consignado">("todos");
  const [edit, setEdit] = useState<EditCell>(null);
  const [draft, setDraft] = useState("");
  const [showNovo, setShowNovo] = useState(false);

  // novo produto
  const [novo, setNovo] = useState({
    sku: "", nome: "", categoria: "Ração", tipo: "próprio" as Produto["tipo"],
    estoque: "", minimo: "", precoCompra: "", preco: "", fornecedor: "",
  });

  useEffect(() => {
    if (!showNovo) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setShowNovo(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showNovo]);

  const list = tipo === "todos" ? produtos : produtos.filter(p => p.tipo === tipo);
  const criticos = list.filter(p => p.estoque < p.minimo);

  const valorProprio = produtos.filter(p=>p.tipo==="próprio").reduce((s,p)=>s+p.estoque*p.precoCompra,0);
  const valorConsig = produtos.filter(p=>p.tipo==="consignado").reduce((s,p)=>s+p.estoque*p.precoCompra,0);
  const margemMedia = produtos.length > 0
    ? produtos.reduce((s, p) => s + calcMargem(p).pct, 0) / produtos.length
    : 0;

  function startEdit(sku: string, field: "preco" | "precoCompra", val: number) {
    setEdit({ sku, field });
    setDraft(String(val));
  }
  function commitEdit() {
    if (!edit) return;
    const n = Number(draft);
    if (isNaN(n) || n < 0) { setEdit(null); return; }
    setProdutos(prev => prev.map(p => p.sku === edit.sku ? { ...p, [edit.field]: n } : p));
    setEdit(null);
  }

  const novaMargem = useMemo(() => {
    const venda = Number(novo.preco) || 0;
    const compra = Number(novo.precoCompra) || 0;
    if (venda <= 0) return null;
    const lucro = novo.tipo === "consignado" ? venda - compra * 0.7 : venda - compra;
    return { pct: (lucro / venda) * 100, lucro };
  }, [novo.preco, novo.precoCompra, novo.tipo]);

  function salvarNovo() {
    if (!novo.sku || !novo.nome || !novo.preco || !novo.precoCompra) {
      toast.error("Preencha SKU, nome e preços");
      return;
    }
    if (produtos.some(p => p.sku === novo.sku)) {
      toast.error("SKU já existe");
      return;
    }
    setProdutos(prev => [...prev, {
      sku: novo.sku, nome: novo.nome, categoria: novo.categoria, tipo: novo.tipo,
      estoque: Number(novo.estoque) || 0, minimo: Number(novo.minimo) || 0,
      preco: Number(novo.preco), precoCompra: Number(novo.precoCompra),
      giro: "médio", fornecedor: novo.fornecedor || undefined,
    }]);
    toast.success("Produto adicionado ✅");
    setNovo({ sku: "", nome: "", categoria: "Ração", tipo: "próprio", estoque: "", minimo: "", precoCompra: "", preco: "", fornecedor: "" });
    setShowNovo(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque inteligente</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro completo · próprio e consignado · edição inline</p>
        </div>
        <button onClick={()=>setShowNovo(true)} className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo produto
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KCard icon={<Package className="size-4" />} label="SKUs ativos" value={String(produtos.length)} tone="primary" />
        <KCard icon={<Boxes className="size-4" />} label="Estoque próprio" value={brl(valorProprio)} tone="primary" />
        <KCard icon={<Handshake className="size-4" />} label="Consignado" value={brl(valorConsig)} tone="accent" />
        <KCard icon={<TrendingUp className="size-4" />} label="Margem média" value={`${margemMedia.toFixed(0)}%`} tone="success" />
      </div>

      {criticos.length > 0 && (
        <div className="card-soft p-5 border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">Atenção · {criticos.length} produtos abaixo do mínimo</h3>
              <p className="text-xs text-muted-foreground mt-0.5">A IA recomenda repor os itens abaixo nas próximas 48h.</p>
            </div>
            <button className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold">Gerar pedido</button>
          </div>
        </div>
      )}

      <div className="card-soft p-3 flex flex-wrap gap-2">
        {(["todos","próprio","consignado"] as const).map(t => (
          <button key={t} onClick={()=>setTipo(t)} className={`h-9 px-4 rounded-lg text-xs font-semibold capitalize ${tipo===t?"bg-foreground text-background":"bg-secondary hover:bg-secondary/70"}`}>{t === "todos" ? "Todos" : t === "próprio" ? "Estoque próprio" : "Consignado"}</button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Produto</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Tipo</th>
                <th className="font-medium px-4 py-3 text-center">Estoque</th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Custo</th>
                <th className="font-medium px-4 py-3 text-right">Venda</th>
                <th className="font-medium px-4 py-3 text-right">Margem</th>
                <th className="font-medium px-4 py-3 hidden xl:table-cell">Tipo margem</th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Lucro un.</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Demanda</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const critico = p.estoque < p.minimo;
                const m = calcMargem(p);
                const semMargem = m.pct < 20;
                const negativa = m.pct < 0;
                const comp = comportamentoCompra(p);
                return (
                  <tr key={p.sku} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.categoria} · {p.sku}{p.fornecedor?` · ${p.fornecedor}`:""}</div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-md capitalize ${p.tipo==="próprio"?"bg-primary/15 text-primary":"bg-accent/15 text-accent"}`}>{p.tipo}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${critico ? "text-destructive" : ""}`}>{p.estoque}</span>
                      <span className="text-muted-foreground text-xs">/{p.minimo}</span>
                      {critico && <div className="text-[9px] font-semibold text-destructive mt-0.5">CRÍTICO</div>}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {edit?.sku === p.sku && edit.field === "precoCompra" ? (
                        <input
                          autoFocus type="number" step="0.01" value={draft}
                          onChange={e=>setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e=>{ if (e.key==="Enter") commitEdit(); if (e.key==="Escape") setEdit(null); }}
                          className="w-24 h-8 px-2 text-right rounded bg-secondary outline-none focus:ring-2 ring-primary/30"
                        />
                      ) : (
                        <button onClick={()=>startEdit(p.sku, "precoCompra", p.precoCompra)} className="text-muted-foreground hover:text-foreground hover:underline">{brl(p.precoCompra)}</button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {edit?.sku === p.sku && edit.field === "preco" ? (
                        <input
                          autoFocus type="number" step="0.01" value={draft}
                          onChange={e=>setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e=>{ if (e.key==="Enter") commitEdit(); if (e.key==="Escape") setEdit(null); }}
                          className="w-24 h-8 px-2 text-right rounded bg-secondary outline-none focus:ring-2 ring-primary/30"
                        />
                      ) : (
                        <button onClick={()=>startEdit(p.sku, "preco", p.preco)} className="font-semibold hover:text-primary hover:underline">{brl(p.preco)}</button>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${negativa ? "text-destructive" : semMargem ? "text-destructive" : "text-success"}`}>
                      {m.pct.toFixed(0)}%
                      {negativa && <div className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-block ml-1">ATENÇÃO</div>}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-[10px] font-semibold text-muted-foreground">{m.tipoLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">{brl(m.lucro)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span title={`${comp.count} clientes compram regularmente`} className={`text-[10px] font-bold px-2 py-1 rounded-md ${comp.tone}`}>
                        {comp.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showNovo && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50" onClick={()=>setShowNovo(false)}>
          <div className="card-soft p-5 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-semibold inline-flex items-center gap-2"><Plus className="size-4 text-primary" /> Novo produto</h3>
              <button onClick={()=>setShowNovo(false)} className="p-1 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU"><input value={novo.sku} onChange={e=>setNovo(s=>({...s, sku: e.target.value.toUpperCase()}))} placeholder="RAC-XXX-00" className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Categoria">
                <select value={novo.categoria} onChange={e=>setNovo(s=>({...s, categoria: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30">
                  {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Nome" full><input value={novo.nome} onChange={e=>setNovo(s=>({...s, nome: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Tipo">
                <select value={novo.tipo} onChange={e=>setNovo(s=>({...s, tipo: e.target.value as Produto["tipo"]}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30">
                  <option value="próprio">Próprio</option>
                  <option value="consignado">Consignado</option>
                </select>
              </Field>
              <Field label="Fornecedor (opcional)"><input value={novo.fornecedor} onChange={e=>setNovo(s=>({...s, fornecedor: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Estoque atual"><input type="number" value={novo.estoque} onChange={e=>setNovo(s=>({...s, estoque: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Estoque mínimo"><input type="number" value={novo.minimo} onChange={e=>setNovo(s=>({...s, minimo: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Preço de compra"><input type="number" step="0.01" value={novo.precoCompra} onChange={e=>setNovo(s=>({...s, precoCompra: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
              <Field label="Preço de venda"><input type="number" step="0.01" value={novo.preco} onChange={e=>setNovo(s=>({...s, preco: e.target.value}))} className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30" /></Field>
            </div>
            {novaMargem && (
              <div className={`rounded-xl p-3 ${novaMargem.pct < 0 ? "bg-destructive/10" : novaMargem.pct < 20 ? "bg-accent/10" : "bg-success/10"}`}>
                <div className="text-xs text-muted-foreground">Margem prevista ({novo.tipo === "consignado" ? "líquida consignado" : "bruta"})</div>
                <div className={`text-2xl font-bold tabular-nums ${novaMargem.pct < 0 ? "text-destructive" : novaMargem.pct < 20 ? "text-accent" : "text-success"}`}>
                  {novaMargem.pct.toFixed(1)}% · {brl(novaMargem.lucro)}/un.
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={()=>setShowNovo(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
              <button onClick={salvarNovo} className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold">Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function KCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary"|"destructive"|"success"|"accent" }) {
  const cls = { primary: "bg-primary/15 text-primary", destructive: "bg-destructive/10 text-destructive", success: "bg-success/15 text-success", accent: "bg-accent/15 text-accent" }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
