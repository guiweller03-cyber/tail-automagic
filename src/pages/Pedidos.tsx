import { pedidos as initial, type Pedido, type FormaPagamento } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Filter, Sparkles, CheckCircle2, Truck, MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const cols: { key: Pedido["status"]; label: string; tint: string; auto?: string; icon?: React.ReactNode }[] = [
  { key: "novo", label: "Novo pedido", tint: "border-t-chart-4" },
  { key: "pago", label: "Pago", tint: "border-t-primary", auto: "Confirma pagamento", icon: <CheckCircle2 className="size-3" /> },
  { key: "separando", label: "Separando", tint: "border-t-accent" },
  { key: "em rota", label: "Em rota", tint: "border-t-chart-2", auto: "Avisa cliente", icon: <Truck className="size-3" /> },
  { key: "entregue", label: "Entregue", tint: "border-t-success", auto: "Pós-venda + upsell", icon: <Sparkles className="size-3" /> },
  { key: "cancelado", label: "Cancelado", tint: "border-t-destructive", icon: <X className="size-3" /> },
];

const FORMAS: FormaPagamento[] = ["Pix", "Cartão débito", "Cartão crédito", "Dinheiro", "Pendente"];

function PagamentoBadges({ p }: { p: Pedido }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${p.pago ? "bg-success/15 text-success" : p.pagamento === "Dinheiro" ? "bg-accent/15 text-accent" : "bg-amber-500/15 text-amber-600"}`}>
        {p.pago ? "✅ Pago" : p.pagamento === "Dinheiro" ? "💵 Dinheiro na entrega" : "⏳ Pendente"}
      </span>
      {(p.pagamento === "Cartão crédito" || p.pagamento === "Cartão débito") && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
          💳 {p.pagamento === "Cartão crédito" ? "Crédito" : "Débito"}
        </span>
      )}
      {p.pagamento === "Pix" && !p.pago && !p.comprovante && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">⚠️ Sem comprovante</span>
      )}
      {p.notaFiscal && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">NF</span>}
    </div>
  );
}

export function Pedidos() {
  const [items, setItems] = useState<Pedido[]>(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [confirmPago, setConfirmPago] = useState<{ pedido: Pedido } | null>(null);
  const [forma, setForma] = useState<FormaPagamento>("Pix");
  const [comprovante, setComprovante] = useState(true);

  useEffect(() => {
    if (!confirmPago) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmPago(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirmPago]);

  function move(status: Pedido["status"]) {
    if (!drag) return;
    const p = items.find((i) => i.id === drag);
    if (!p || p.status === status) { setDrag(null); return; }
    if (status === "pago" && !p.pago) {
      setForma(p.pagamento === "Pendente" ? "Pix" : p.pagamento);
      setComprovante(p.comprovante);
      setConfirmPago({ pedido: p });
      setDrag(null);
      return;
    }
    setItems(items.map((i) => (i.id === drag ? { ...i, status } : i)));
    setDrag(null);
    const auto = cols.find((c) => c.key === status)?.auto;
    toast(`${p.id} → ${status}${auto ? ` · ${auto} disparado` : ""}`);
  }

  function confirmarPagamento() {
    if (!confirmPago) return;
    const taxa = forma === "Cartão crédito" ? 2.5 : forma === "Cartão débito" ? 1.5 : 0;
    setItems(prev => prev.map(i => i.id === confirmPago.pedido.id ? {
      ...i, status: "pago", pago: true, pagamento: forma, comprovante, taxaMaquina: taxa,
    } : i));
    toast.success(`Pagamento confirmado · ${forma}`);
    setConfirmPago(null);
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
                  <span className="text-[10px] font-bold size-5 grid place-items-center rounded-md bg-card text-muted-foreground">{list.length}</span>
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
                    className={`card-soft p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition touch-none ${drag === p.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">{p.id}</span>
                      <span className="text-[10px] text-muted-foreground">{p.hora}</span>
                    </div>
                    <div className="font-semibold text-sm mt-1 truncate">{p.cliente}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.pet}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">📍 {p.bairro}</div>
                    <PagamentoBadges p={p} />
                    <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-border">
                      <StatusBadge value={p.status} />
                      <span className="font-bold text-sm">{brl(p.total)}</span>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="text-center text-[11px] text-muted-foreground py-6 border border-dashed border-border rounded-xl">Solte aqui</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="md:hidden text-[11px] text-muted-foreground text-center">
        Em mobile, segure e arraste o card horizontalmente para outra coluna.
      </div>

      {confirmPago && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50" onClick={()=>setConfirmPago(null)}>
          <div className="card-soft p-5 w-full max-w-sm space-y-4" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-success" /> Confirmar pagamento</h3>
                <p className="text-xs text-muted-foreground">{confirmPago.pedido.id} · {confirmPago.pedido.cliente} · {brl(confirmPago.pedido.total)}</p>
              </div>
              <button onClick={()=>setConfirmPago(null)} className="p-1 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">Forma de pagamento</div>
              <select value={forma} onChange={e=>setForma(e.target.value as FormaPagamento)} className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none">
                {FORMAS.filter(f=>f!=="Pendente").map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={comprovante} onChange={e=>setComprovante(e.target.checked)} />
              Comprovante recebido
            </label>
            <div className="flex gap-2">
              <button onClick={()=>setConfirmPago(null)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold">Cancelar</button>
              <button onClick={confirmarPagamento} className="flex-1 h-10 rounded-xl bg-success text-success-foreground text-sm font-semibold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
