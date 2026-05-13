import { pedidos } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Filter } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cols: { key: typeof pedidos[number]["status"]; label: string }[] = [
  { key: "novo", label: "Novos" },
  { key: "pago", label: "Pagos" },
  { key: "separando", label: "Separando" },
  { key: "em rota", label: "Em rota" },
  { key: "entregue", label: "Entregues" },
];

export function Pedidos() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Quadro Kanban · arraste entre colunas</p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium inline-flex items-center gap-2">
            <Filter className="size-4" /> Filtros
          </button>
          <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
            <Plus className="size-4" /> Novo pedido
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {cols.map((col) => {
          const items = pedidos.filter((p) => p.status === col.key);
          return (
            <div key={col.key} className="bg-secondary/50 rounded-2xl p-3 min-h-[280px]">
              <div className="flex items-center justify-between px-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="text-xs font-bold size-5 grid place-items-center rounded-md bg-card text-muted-foreground">{items.length}</span>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {brl(items.reduce((s, i) => s + i.total, 0))}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <div key={p.id} className="card-soft p-3 cursor-grab hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">{p.id}</span>
                      <span className="text-[10px] text-muted-foreground">{p.hora}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1">{p.cliente}</div>
                    <div className="text-xs text-muted-foreground">{p.pet}</div>
                    <div className="text-xs text-muted-foreground mt-1">📍 {p.bairro}</div>
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-border">
                      <StatusBadge value={p.status} />
                      <span className="font-bold text-sm">{brl(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
