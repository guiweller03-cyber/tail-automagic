import { produtos } from "@/lib/mock";
import { AlertTriangle, TrendingUp, Package, Plus, Boxes, Handshake } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Estoque() {
  const [tipo, setTipo] = useState<"todos" | "próprio" | "consignado">("todos");
  const list = tipo === "todos" ? produtos : produtos.filter(p => p.tipo === tipo);
  const criticos = list.filter(p => p.estoque < p.minimo);

  const valorProprio = produtos.filter(p=>p.tipo==="próprio").reduce((s,p)=>s+p.estoque*p.precoCompra,0);
  const valorConsig = produtos.filter(p=>p.tipo==="consignado").reduce((s,p)=>s+p.estoque*p.precoCompra,0);
  const margemMedia = produtos.reduce((s,p)=>s+(p.preco-p.precoCompra)/p.preco,0)/produtos.length*100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque inteligente</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro completo · próprio e consignado</p>
        </div>
        <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo produto
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={<Package className="size-4" />} label="SKUs ativos" value={String(produtos.length)} tone="primary" />
        <Card icon={<Boxes className="size-4" />} label="Estoque próprio" value={brl(valorProprio)} tone="primary" />
        <Card icon={<Handshake className="size-4" />} label="Consignado" value={brl(valorConsig)} tone="accent" />
        <Card icon={<TrendingUp className="size-4" />} label="Margem média" value={`${margemMedia.toFixed(0)}%`} tone="success" />
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
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Lucro un.</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const critico = p.estoque < p.minimo;
                const lucro = p.preco - p.precoCompra;
                const margem = (lucro / p.preco) * 100;
                const semMargem = margem < 20;
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
                    <td className="px-4 py-3 text-right hidden md:table-cell text-muted-foreground">{brl(p.precoCompra)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(p.preco)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${semMargem?"text-destructive":"text-success"}`}>{margem.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">{brl(lucro)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary"|"destructive"|"success"|"accent" }) {
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
