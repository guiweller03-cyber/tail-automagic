import { produtosProcurados } from "@/lib/mock";
import { Search, TrendingDown, Package2, AlertCircle, DollarSign } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusCls: Record<string, string> = {
  "pendente": "bg-accent/15 text-accent",
  "comprado fornecedor": "bg-primary/15 text-primary",
  "adicionado estoque": "bg-success/15 text-success",
};

export function ProdutosProcurados() {
  const [filter, setFilter] = useState<"todos" | "pendente" | "comprado fornecedor" | "adicionado estoque">("todos");
  const list = filter === "todos" ? produtosProcurados : produtosProcurados.filter(p => p.status === filter);
  const oportunidade = produtosProcurados.reduce((s, p) => s + p.vezes * p.ticketMedio, 0);
  const topMarcas = ["Royal Canin", "Hills", "Seresto", "Pedigree", "Premier"];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Produtos Procurados</h1>
        <p className="text-sm text-muted-foreground">Itens pedidos por clientes que o pet shop ainda não vende — registrados automaticamente pela IA.</p>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Card icon={<Package2 className="size-4" />} label="Itens registrados" value={String(produtosProcurados.length)} tone="primary" />
        <Card icon={<AlertCircle className="size-4" />} label="Pendentes" value={String(produtosProcurados.filter(p=>p.status==="pendente").length)} tone="accent" />
        <Card icon={<TrendingDown className="size-4" />} label="Oportunidades perdidas" value={String(produtosProcurados.reduce((s,p)=>s+p.vezes,0))} tone="destructive" />
        <Card icon={<DollarSign className="size-4" />} label="Faturamento estimado" value={brl(oportunidade)} tone="success" />
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-4">
        <div className="card-soft overflow-hidden">
          <div className="p-3 flex flex-wrap gap-2 border-b border-border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none" placeholder="Buscar produto..." />
            </div>
            {(["todos","pendente","comprado fornecedor","adicionado estoque"] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)} className={`h-9 px-3 rounded-lg text-xs font-semibold capitalize ${filter===f?"bg-foreground text-background":"bg-secondary hover:bg-secondary/70"}`}>{f}</button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="text-xs text-muted-foreground text-left">
                  <th className="font-medium px-4 py-3">Produto</th>
                  <th className="font-medium px-4 py-3 hidden md:table-cell">Cliente</th>
                  <th className="font-medium px-4 py-3 hidden lg:table-cell">Data</th>
                  <th className="font-medium px-4 py-3 text-center">Pedidos</th>
                  <th className="font-medium px-4 py-3">Status</th>
                  <th className="font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(p => (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.categoria}{p.obs ? ` · ${p.obs}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="text-sm">{p.cliente}</div>
                      <div className="text-xs text-muted-foreground">{p.telefone}</div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{p.data} · {p.hora}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-grid place-items-center size-7 rounded-lg bg-accent/15 text-accent text-xs font-bold">{p.vezes}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-md capitalize ${statusCls[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-semibold">Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-soft p-4">
            <h3 className="font-semibold text-sm mb-3">Mais pedidos sem estoque</h3>
            <div className="space-y-2">
              {[...produtosProcurados].sort((a,b)=>b.vezes-a.vezes).slice(0,4).map(p => (
                <div key={p.id} className="flex justify-between items-center text-xs">
                  <span className="truncate">{p.nome}</span>
                  <span className="font-bold ml-2">{p.vezes}x</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card-soft p-4">
            <h3 className="font-semibold text-sm mb-3">Marcas mais procuradas</h3>
            <div className="flex flex-wrap gap-1.5">
              {topMarcas.map(m => (
                <span key={m} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-secondary">{m}</span>
              ))}
            </div>
          </div>
          <div className="card-soft p-4 bg-gradient-to-br from-accent/10 to-primary/10 border-accent/20">
            <div className="text-xs text-muted-foreground">Insight IA</div>
            <p className="text-xs mt-1 leading-relaxed">Adicionar <b>linha medicamentosa Royal Canin</b> pode gerar até <b>{brl(2200)}/mês</b> baseado nas solicitações recentes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary"|"accent"|"destructive"|"success" }) {
  const cls = { primary:"bg-primary/15 text-primary", accent:"bg-accent/15 text-accent", destructive:"bg-destructive/10 text-destructive", success:"bg-success/15 text-success" }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
