import { StatusBadge } from "@/components/StatusBadge";
import { onCrmReload } from "@/lib/crm-refresh";
import type { PedidoCrm, PedidoProcesso } from "@/lib/supabase";
import {
  CheckCircle2,
  Filter,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const cols: {
  key: PedidoProcesso;
  label: string;
  tint: string;
  auto?: string;
  icon?: React.ReactNode;
}[] = [
  { key: "novo", label: "Novo pedido", tint: "border-t-chart-4" },
  {
    key: "pago",
    label: "Pago",
    tint: "border-t-primary",
    auto: "Confirma pagamento",
    icon: <CheckCircle2 className="size-3" />,
  },
  { key: "separando", label: "Separando", tint: "border-t-accent" },
  {
    key: "em rota",
    label: "Em rota",
    tint: "border-t-chart-2",
    auto: "Avisa cliente",
    icon: <Truck className="size-3" />,
  },
  {
    key: "entregue",
    label: "Entregue",
    tint: "border-t-success",
    auto: "Pos-venda + upsell",
    icon: <Sparkles className="size-3" />,
  },
  {
    key: "cancelado",
    label: "Cancelado",
    tint: "border-t-destructive",
    icon: <X className="size-3" />,
  },
];

import { Route } from "@/routes/pedidos";

export function Pedidos() {
  const loaderData = Route.useLoaderData();
  const [items, setItems] = useState<PedidoCrm[]>(loaderData ?? []);
  const [drag, setDrag] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendentes" | "pagos">("todos");
  const [novoPedido, setNovoPedido] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    total: "",
    formaPagamento: "Pix",
    observacao: "",
    bairro: "",
    pet: "",
  });

  useEffect(() => {
    if (loaderData) setItems(loaderData);
  }, [loaderData]);

  useEffect(() => {
    void carregarPedidos();
    return onCrmReload(() => void carregarPedidos());
  }, []);

  async function carregarPedidos() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/crm/pedidos", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(payload?.erro ?? "Erro ao carregar pedidos");
      }

      const data = (await response.json()) as PedidoCrm[];
      setItems(data);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Erro desconhecido";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function move(status: PedidoProcesso) {
    if (!drag) return;

    const pedido = items.find((item) => item.id === drag);
    if (!pedido || pedido.status === status) {
      setDrag(null);
      return;
    }

    const previousItems = items;
    setItems(items.map((item) => (item.id === drag ? { ...item, status } : item)));
    setDrag(null);

    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pedido.id, status }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(payload?.erro ?? "Erro ao atualizar pedido");
      }

      const pedidoAtualizado = (await response.json()) as PedidoCrm;
      setItems((current) =>
        current.map((item) => (item.id === pedidoAtualizado.id ? pedidoAtualizado : item)),
      );

      const auto = cols.find((col) => col.key === status)?.auto;
      setToast(`${pedido.cliente} -> ${status}${auto ? ` · ${auto} disparado` : ""}`);
      setTimeout(() => setToast(null), 2800);
    } catch (requestError) {
      setItems(previousItems);
      const message = requestError instanceof Error ? requestError.message : "Erro desconhecido";
      setToast(message);
      setTimeout(() => setToast(null), 3200);
    }
  }

  async function criarPedido(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, total: Number(form.total.replace(",", ".")) }),
      });
      const payload = (await response.json()) as PedidoCrm & { erro?: string };
      if (!response.ok) throw new Error(payload.erro ?? "Erro ao criar pedido");

      setItems((current) => [payload, ...current]);
      setForm({
        nome: "",
        telefone: "",
        total: "",
        formaPagamento: "Pix",
        observacao: "",
        bairro: "",
        pet: "",
      });
      setNovoPedido(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = items.filter((pedido) => {
    if (statusFilter === "pendentes") return pedido.statusPagamento !== "pago";
    if (statusFilter === "pagos") return pedido.statusPagamento === "pago";
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos reais do WhatsApp e PDV organizados por etapa da operação
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setStatusFilter((current) =>
                current === "todos" ? "pendentes" : current === "pendentes" ? "pagos" : "todos",
              )
            }
            className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium inline-flex items-center gap-2"
          >
            <Filter className="size-4" />{" "}
            {statusFilter === "todos" ? "Todos" : statusFilter === "pagos" ? "Pagos" : "Pendentes"}
          </button>
          <button
            onClick={() => void carregarPedidos()}
            className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium inline-flex items-center gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button
            onClick={() => setNovoPedido(true)}
            className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="size-4" /> Novo pedido
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cols.map((col) => {
          const list = filteredItems.filter((pedido) => pedido.status === col.key);
          const total = list.reduce((sum, item) => sum + item.total, 0);

          return (
            <div
              key={col.key}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void move(col.key)}
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
                {list.map((pedido) => (
                  <div
                    key={pedido.id}
                    draggable
                    onDragStart={() => setDrag(pedido.id)}
                    onDragEnd={() => setDrag(null)}
                    className={`card-soft p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition touch-none ${
                      drag === pedido.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground truncate">
                        {pedido.id.slice(0, 8)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {pedido.hora}
                      </span>
                    </div>
                    <div className="font-semibold text-sm mt-1 truncate">{pedido.cliente}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{pedido.pet}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 truncate">
                      {pedido.bairro}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 truncate">
                      {pedido.pagamento} · {pedido.statusPagamento}
                    </div>
                    <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-border">
                      <StatusBadge value={pedido.status} />
                      <span className="font-bold text-sm">{brl(pedido.total)}</span>
                    </div>
                  </div>
                ))}

                {list.length === 0 && (
                  <div className="text-center text-[11px] text-muted-foreground py-6 border border-dashed border-border rounded-xl">
                    {loading ? "Carregando" : "Solte aqui"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="md:hidden text-[11px] text-muted-foreground text-center">
        Em mobile, segure e arraste o card horizontalmente para outra coluna.
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium inline-flex items-center gap-2 z-50">
          <MessageSquare className="size-4" /> {toast}
        </div>
      )}

      {novoPedido && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setNovoPedido(false)}
        >
          <form
            onSubmit={(event) => void criarPedido(event)}
            onClick={(event) => event.stopPropagation()}
            className="w-full md:max-w-xl bg-card md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-5 border-b border-border flex justify-between items-center">
              <div>
                <h2 className="font-bold">Novo pedido</h2>
                <p className="text-xs text-muted-foreground">
                  Entra como pedido pendente no Kanban.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNovoPedido(false)}
                className="p-2 rounded-lg hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 grid md:grid-cols-2 gap-3">
              <PedidoField
                label="Cliente"
                value={form.nome}
                onChange={(nome) => setForm({ ...form, nome })}
                required
              />
              <PedidoField
                label="Telefone"
                value={form.telefone}
                onChange={(telefone) => setForm({ ...form, telefone })}
                required
              />
              <PedidoField
                label="Total"
                value={form.total}
                onChange={(total) => setForm({ ...form, total })}
                placeholder="89,90"
                required
              />
              <PedidoField
                label="Pagamento"
                value={form.formaPagamento}
                onChange={(formaPagamento) => setForm({ ...form, formaPagamento })}
              />
              <PedidoField
                label="Pet"
                value={form.pet}
                onChange={(pet) => setForm({ ...form, pet })}
              />
              <PedidoField
                label="Bairro"
                value={form.bairro}
                onChange={(bairro) => setForm({ ...form, bairro })}
              />
              <label className="md:col-span-2 grid gap-1 text-xs font-semibold text-muted-foreground">
                Observacao
                <textarea
                  value={form.observacao}
                  onChange={(event) => setForm({ ...form, observacao: event.target.value })}
                  className="min-h-20 rounded-lg bg-secondary px-3 py-2 text-sm text-foreground outline-none"
                />
              </label>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNovoPedido(false)}
                className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={loading}
                className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50"
              >
                {loading ? "Criando" : "Criar pedido"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PedidoField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-10 rounded-lg bg-secondary px-3 text-sm text-foreground outline-none"
      />
    </label>
  );
}
