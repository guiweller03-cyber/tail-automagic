import { produtos } from "@/lib/mock";
import { AlertTriangle, TrendingUp, Package, Plus } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Estoque() {
  const criticos = produtos.filter(p => p.estoque < p.minimo);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque inteligente</h1>
          <p className="text-sm text-muted-foreground">A IA prevê rupturas baseando-se em recompras e consumo médio.</p>
        </div>
        <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo produto
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card icon={<Package className="size-4" />} label="SKUs ativos" value={String(produtos.length)} tone="primary" />
        <Card icon={<AlertTriangle className="size-4" />} label="Em ruptura" value={String(criticos.length)} tone="destructive" />
        <Card icon={<TrendingUp className="size-4" />} label="Alto giro" value={String(produtos.filter(p=>p.giro==="alto").length)} tone="success" />
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

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Produto</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">SKU</th>
                <th className="font-medium px-4 py-3">Estoque</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Mínimo</th>
                <th className="font-medium px-4 py-3">Giro</th>
                <th className="font-medium px-4 py-3 text-right">Preço</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => {
                const critico = p.estoque < p.minimo;
                return (
                  <tr key={p.sku} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.nome}</div>
                      <div className="text-xs text-muted-foreground">{p.categoria}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs hidden md:table-cell text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${critico ? "text-destructive" : ""}`}>{p.estoque}</span>
                      {critico && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">CRÍTICO</span>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{p.minimo}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{p.giro}</td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(p.preco)}</td>
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

function Card({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "primary"|"destructive"|"success" }) {
  const cls = { primary: "bg-primary/15 text-primary", destructive: "bg-destructive/10 text-destructive", success: "bg-success/15 text-success" }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
