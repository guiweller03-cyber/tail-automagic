import { pedidos as initial, type Pedido } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Filter, Sparkles, CheckCircle2, Truck, MessageSquare, X } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const cols: { key: Pedido["status"]; label: string; tint: string; auto?: string; icon?: React.ReactNode }[] = [
  { key: "novo", label: "Novo pedido", tint: "border-t-chart-4" },
  { key: "pago", label: "Pago", tint: "border-t-primary", auto: "Confirma pagamento", icon: <CheckCircle2 className="size-3" /> },
  { key: "separando", label: "Separando", tint: "border-t-accent" },
  { key: "em rota", label: "Em rota", tint: "border-t-chart-2", auto: "Avisa cliente", icon: <Truck className="size-3" /> },
  { key: "entregue", label: "Entregue", tint: "border-t-success", auto: "Pós-venda + upsell", icon: <Sparkles className="size-3" /> },
  { key: "cancelado", label: "Cancelado", tint: "border-t-destructive", icon: <X className="size-3" /> },
];

export function Pedidos() {
  const [items, setItems] = useState<Pedido[]>(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function move(status: Pedido["status"]) {
    if (!drag) return;
    const p = items.find((i) => i.id === drag);
    setItems(items.map((i) => (i.id === drag ? { ...i, status } : i)));
    setDrag(null);
    if (p && p.status !== status) {
      const auto = cols.find((c) => c.key === status)?.auto;
      setToast(`${p.id} → ${status}${auto ? ` · ${auto} disparado` : ""}`);
      setTimeout(() => setToast(null), 2800);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">Arraste entre colunas — automações disparam ao mover</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cols.map((col) => {
          const list = items.filter((p) => p.status === col.key);
          const total = list.reduce((s, i) => s + i.total, 0);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => move(col.key)}
              className={`bg-secondary/40 rounded-2xl p-3 min-h-[320px] border-t-4 ${col.tint} flex flex-col`}
            >
              <div className="flex items-center justify-between px-1 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm">{col.label}</span>
                  <span className="text-[10px] font-bold size-5 grid place-items-center rounded-md bg-card text-muted-foreground">
                    {list.length}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-success">{brl(total)}</span>
              </div>

              {col.auto && (
                <div className="text-[10px] text-muted-foreground italic px-1 pb-2 inline-flex items-center gap-1">
                  {col.icon} auto: {col.auto}
                </div>
              )}

              <div className="space-y-2 flex-1">
                {list.map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDrag(p.id)}
                    onDragEnd={() => setDrag(null)}
                    className={`card-soft p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition touch-none ${
                      drag === p.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">{p.id}</span>
                      <span className="text-[10px] text-muted-foreground">{p.hora}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1 truncate">{p.cliente}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.pet}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">📍 {p.bairro}</div>
                    <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-border">
                      <StatusBadge value={p.status} />
                      <span className="font-bold text-sm">{brl(p.total)}</span>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="text-center text-[11px] text-muted-foreground py-6 border border-dashed border-border rounded-xl">
                    Solte aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile fallback hint */}
      <div className="md:hidden text-[11px] text-muted-foreground text-center">
        Em mobile, segure e arraste o card horizontalmente para outra coluna.
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium inline-flex items-center gap-2 z-50">
          <MessageSquare className="size-4" /> {toast}
        </div>
      )}
    </div>
  );
}
