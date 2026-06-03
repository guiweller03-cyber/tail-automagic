import type { Pedido, FormaPagamento, Produto } from "@/lib/crm-types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Plus,
  Filter,
  Sparkles,
  CheckCircle2,
  Truck,
  X,
  Search,
  Loader2,
  Trash2,
  PackagePlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { dispatchCrmReload, onCrmReload } from "@/lib/crm-refresh";

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

type PedidoFiltroStatus = Pedido["status"] | "todos";
type PedidoFiltroPagamento = FormaPagamento | "todos" | "Pago" | "Pendente";
type NovoPedidoItem = {
  sku: string;
  nome: string;
  quantidade: number;
  preco: number;
  precoCompra: number;
};

type NovoPedidoForm = {
  nome: string;
  telefone: string;
  bairro: string;
  pet: string;
  formaPagamento: FormaPagamento;
  pago: boolean;
  total: string;
  observacao: string;
  cupomCodigo: string;
};

const emptyNovoPedidoForm = (): NovoPedidoForm => ({
  nome: "",
  telefone: "",
  bairro: "",
  pet: "",
  formaPagamento: "Pix",
  pago: false,
  total: "",
  observacao: "",
  cupomCodigo: "",
});

function normalizarBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseMoney(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
}

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

export function Pedidos({ pedidosIniciais }: { pedidosIniciais: Pedido[] }) {
  const [items, setItems] = useState<Pedido[]>(pedidosIniciais);
  const [drag, setDrag] = useState<string | null>(null);
  const [confirmPago, setConfirmPago] = useState<{ pedido: Pedido } | null>(null);
  const [forma, setForma] = useState<FormaPagamento>("Pix");
  const [comprovante, setComprovante] = useState(true);
  const [salvandoStatus, setSalvandoStatus] = useState<string | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<PedidoFiltroStatus>("todos");
  const [pagamentoFiltro, setPagamentoFiltro] = useState<PedidoFiltroPagamento>("todos");
  const [novoAberto, setNovoAberto] = useState(false);
  const [novo, setNovo] = useState<NovoPedidoForm>(() => emptyNovoPedidoForm());
  const [novoItens, setNovoItens] = useState<NovoPedidoItem[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoBusca, setProdutoBusca] = useState("");
  const [carregandoProdutos, setCarregandoProdutos] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const filteredItems = useMemo(() => {
    const termo = normalizarBusca(busca);
    const digits = busca.replace(/\D/g, "");

    return items.filter((pedido) => {
      const texto = normalizarBusca(
        [pedido.id, pedido.cliente, pedido.pet, pedido.bairro, pedido.pagamento].join(" "),
      );
      const matchesBusca = !termo || texto.includes(termo) || (digits && pedido.id.includes(digits));
      const matchesStatus = statusFiltro === "todos" || pedido.status === statusFiltro;
      const matchesPagamento =
        pagamentoFiltro === "todos" ||
        (pagamentoFiltro === "Pago" && pedido.pago) ||
        (pagamentoFiltro === "Pendente" && !pedido.pago) ||
        pedido.pagamento === pagamentoFiltro;

      return matchesBusca && matchesStatus && matchesPagamento;
    });
  }, [busca, items, pagamentoFiltro, statusFiltro]);

  const totalNovoItens = useMemo(
    () => novoItens.reduce((sum, item) => sum + item.preco * item.quantidade, 0),
    [novoItens],
  );
  const totalNovo = novoItens.length > 0 ? totalNovoItens : parseMoney(novo.total);
  const produtosFiltrados = useMemo(() => {
    const termo = normalizarBusca(produtoBusca);
    return produtos
      .filter((produto) => produto.estoque > 0)
      .filter((produto) => {
        if (!termo) return true;
        return normalizarBusca([produto.sku, produto.nome, produto.categoria].join(" ")).includes(termo);
      })
      .slice(0, 8);
  }, [produtoBusca, produtos]);

  useEffect(() => {
    setItems(pedidosIniciais);
  }, [pedidosIniciais]);

  useEffect(() => {
    return onCrmReload(() => {
      void carregarPedidos().then(setItems).catch(() => {
        toast.error("Nao foi possivel atualizar os pedidos");
      });
    });
  }, []);

  useEffect(() => {
    if (!confirmPago) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmPago(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirmPago]);

  async function salvarStatusPedido(
    pedido: Pedido,
    status: Pedido["status"],
    options: { formaPagamento?: FormaPagamento; comprovante?: boolean } = {},
  ) {
    const anteriores = items;
    const taxa =
      options.formaPagamento === FORMAS[2] ? 2.5 : options.formaPagamento === FORMAS[1] ? 1.5 : 0;
    const otimista: Pedido = {
      ...pedido,
      status,
      pago: status === "pago" ? true : pedido.pago,
      pagamento: options.formaPagamento ?? pedido.pagamento,
      comprovante: options.comprovante ?? pedido.comprovante,
      taxaMaquina: status === "pago" ? taxa : pedido.taxaMaquina,
    };

    setSalvandoStatus(pedido.id);
    setItems((prev) => prev.map((item) => (item.id === pedido.id ? otimista : item)));

    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pedido.id,
          status,
          formaPagamento: options.formaPagamento,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof data.erro === "string" ? data.erro : "Nao foi possivel salvar");
      }

      const atualizado = normalizarPedido(data);
      setItems((prev) => prev.map((item) => (item.id === pedido.id ? atualizado : item)));
      dispatchCrmReload();

      const auto = cols.find((col) => col.key === status)?.auto;
      toast.success(`${pedido.id} -> ${status}${auto ? ` · ${auto}` : ""}`);
    } catch (error) {
      setItems(anteriores);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar status do pedido");
    } finally {
      setSalvandoStatus(null);
    }
  }

  async function move(status: Pedido["status"]) {
    if (!drag) return;
    const p = items.find((i) => i.id === drag);
    if (!p || p.status === status) { setDrag(null); return; }
    if (salvandoStatus) { setDrag(null); return; }
    if (status === "pago" && !p.pago) {
      setForma(p.pagamento === "Pendente" ? "Pix" : p.pagamento);
      setComprovante(p.comprovante);
      setConfirmPago({ pedido: p });
      setDrag(null);
      return;
    }
    setDrag(null);
    await salvarStatusPedido(p, status);
  }

  async function confirmarPagamento() {
    if (!confirmPago) return;
    const pedido = confirmPago.pedido;
    setConfirmPago(null);
    await salvarStatusPedido(pedido, "pago", { formaPagamento: forma, comprovante });
  }

  async function abrirNovoPedido() {
    setNovoAberto(true);
    if (produtos.length > 0 || carregandoProdutos) return;

    setCarregandoProdutos(true);
    try {
      const response = await fetch("/api/crm/produtos", { cache: "no-store" });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error("Nao foi possivel carregar os produtos");
      setProdutos(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar os produtos");
    } finally {
      setCarregandoProdutos(false);
    }
  }

  function addProduto(produto: Produto) {
    setNovoItens((current) => {
      const exists = current.find((item) => item.sku === produto.sku);
      if (exists) {
        return current.map((item) =>
          item.sku === produto.sku ? { ...item, quantidade: item.quantidade + 1 } : item,
        );
      }

      return [
        ...current,
        {
          sku: produto.sku,
          nome: produto.nome,
          quantidade: 1,
          preco: produto.preco,
          precoCompra: produto.precoCompra,
        },
      ];
    });
    setNovo((current) => ({ ...current, total: "" }));
  }

  function changeItemQuantidade(sku: string, delta: number) {
    setNovoItens((current) =>
      current.flatMap((item) => {
        if (item.sku !== sku) return [item];
        const quantidade = item.quantidade + delta;
        return quantidade <= 0 ? [] : [{ ...item, quantidade }];
      }),
    );
  }

  function fecharNovoPedido() {
    if (salvandoNovo) return;
    setNovoAberto(false);
    setProdutoBusca("");
  }

  async function criarNovoPedido() {
    const nome = novo.nome.trim();
    const total = totalNovo;

    if (!nome) {
      toast.error("Informe o nome do cliente");
      return;
    }

    if (!Number.isFinite(total) || total <= 0) {
      toast.error("Informe itens ou um total valido");
      return;
    }

    setSalvandoNovo(true);
    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          telefone: novo.telefone,
          bairro: novo.bairro,
          pet: novo.pet,
          formaPagamento: novo.formaPagamento,
          pago: novo.pago,
          total,
          observacao: novo.observacao || "Pedido manual do CRM",
          cupomCodigo: novo.cupomCodigo || null,
          itens: novoItens.map((item) => ({
            sku: item.sku,
            nome: item.nome,
            quantidade: item.quantidade,
            preco: item.preco,
            precoCompra: item.precoCompra,
          })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof data.erro === "string" ? data.erro : "Nao foi possivel criar o pedido");
      }

      const pedido = normalizarPedido(data);
      setItems((current) => [pedido, ...current.filter((item) => item.id !== pedido.id)]);
      setNovo(emptyNovoPedidoForm());
      setNovoItens([]);
      setProdutoBusca("");
      setNovoAberto(false);
      dispatchCrmReload();
      toast.success("Pedido criado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar pedido");
    } finally {
      setSalvandoNovo(false);
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
          <button
            onClick={() => setFiltrosAbertos((value) => !value)}
            className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:bg-secondary"
          >
            <Filter className="size-4" /> Filtros
          </button>
          <button
            onClick={() => void abrirNovoPedido()}
            className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
          >
            <Plus className="size-4" /> Novo pedido
          </button>
        </div>
      </div>

      {filtrosAbertos && (
        <div className="rounded-xl border border-border bg-card p-3 grid grid-cols-1 md:grid-cols-[1fr_180px_180px_auto] gap-2">
          <label className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por cliente, pedido, bairro ou pet"
              className="h-10 w-full rounded-lg bg-secondary pl-9 pr-3 text-sm outline-none border border-transparent focus:border-primary"
            />
          </label>
          <select
            value={statusFiltro}
            onChange={(event) => setStatusFiltro(event.target.value as PedidoFiltroStatus)}
            className="h-10 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
          >
            <option value="todos">Todos os status</option>
            {cols.map((col) => (
              <option key={col.key} value={col.key}>{col.label}</option>
            ))}
          </select>
          <select
            value={pagamentoFiltro}
            onChange={(event) => setPagamentoFiltro(event.target.value as PedidoFiltroPagamento)}
            className="h-10 rounded-lg bg-secondary px-3 text-sm outline-none border border-transparent focus:border-primary"
          >
            <option value="todos">Todo pagamento</option>
            <option value="Pago">Pago</option>
            <option value="Pendente">Pendente</option>
            {FORMAS.filter((formaItem) => formaItem !== "Pendente").map((formaItem) => (
              <option key={formaItem} value={formaItem}>{formaItem}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setBusca("");
              setStatusFiltro("todos");
              setPagamentoFiltro("todos");
            }}
            className="h-10 px-3 rounded-lg border border-border text-sm font-semibold hover:bg-secondary"
          >
            Limpar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {cols.map((col) => {
          const list = filteredItems.filter((p) => p.status === col.key);
          const total = list.reduce((s, i) => s + i.total, 0);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void move(col.key)}
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
                    draggable={!salvandoStatus}
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

      {novoAberto && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50" onClick={fecharNovoPedido}>
          <div className="card-soft w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <PackagePlus className="size-4" /> Novo pedido
                </h3>
                <p className="text-xs text-muted-foreground">Registre um pedido manual no CRM</p>
              </div>
              <button onClick={fecharNovoPedido} className="p-1 rounded-lg hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Cliente">
                  <input
                    value={novo.nome}
                    onChange={(event) => setNovo((current) => ({ ...current, nome: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="Nome do cliente"
                  />
                </Field>
                <Field label="Telefone">
                  <input
                    value={novo.telefone}
                    onChange={(event) => setNovo((current) => ({ ...current, telefone: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="WhatsApp ou telefone"
                  />
                </Field>
                <Field label="Bairro">
                  <input
                    value={novo.bairro}
                    onChange={(event) => setNovo((current) => ({ ...current, bairro: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="Bairro de entrega"
                  />
                </Field>
                <Field label="Pet">
                  <input
                    value={novo.pet}
                    onChange={(event) => setNovo((current) => ({ ...current, pet: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="Nome do pet"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_160px] gap-3">
                <Field label="Produto do estoque">
                  <div className="relative">
                    <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={produtoBusca}
                      onChange={(event) => setProdutoBusca(event.target.value)}
                      className="input-soft h-10 w-full pl-9"
                      placeholder="Buscar produto"
                    />
                  </div>
                </Field>
                <Field label="Pagamento">
                  <select
                    value={novo.formaPagamento}
                    onChange={(event) => setNovo((current) => ({ ...current, formaPagamento: event.target.value as FormaPagamento }))}
                    className="input-soft h-10 w-full"
                  >
                    {FORMAS.map((formaItem) => (
                      <option key={formaItem} value={formaItem}>{formaItem}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Total avulso">
                  <input
                    value={novo.total}
                    onChange={(event) => setNovo((current) => ({ ...current, total: event.target.value }))}
                    disabled={novoItens.length > 0}
                    className="input-soft h-10 w-full disabled:opacity-50"
                    placeholder="0,00"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <div className="p-3 bg-secondary/60 flex items-center justify-between">
                  <span className="text-sm font-semibold">Itens</span>
                  {carregandoProdutos && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>
                {produtosFiltrados.length > 0 && (
                  <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2 border-b border-border">
                    {produtosFiltrados.map((produto) => (
                      <button
                        key={produto.sku}
                        onClick={() => addProduto(produto)}
                        className="text-left rounded-lg border border-border p-2 hover:bg-secondary"
                      >
                        <div className="text-sm font-semibold truncate">{produto.nome}</div>
                        <div className="text-xs text-muted-foreground">{produto.sku} · {brl(produto.preco)} · estoque {produto.estoque}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-2 space-y-2">
                  {novoItens.map((item) => (
                    <div key={item.sku} className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{item.nome}</div>
                        <div className="text-xs text-muted-foreground">{brl(item.preco)} cada</div>
                      </div>
                      <button onClick={() => changeItemQuantidade(item.sku, -1)} className="size-8 rounded-lg border border-border hover:bg-card">-</button>
                      <span className="w-8 text-center text-sm font-semibold">{item.quantidade}</span>
                      <button onClick={() => changeItemQuantidade(item.sku, 1)} className="size-8 rounded-lg border border-border hover:bg-card">+</button>
                      <span className="w-20 text-right text-sm font-bold">{brl(item.preco * item.quantidade)}</span>
                      <button onClick={() => setNovoItens((current) => current.filter((row) => row.sku !== item.sku))} className="size-8 rounded-lg hover:bg-destructive/10 text-destructive">
                        <Trash2 className="size-4 mx-auto" />
                      </button>
                    </div>
                  ))}
                  {novoItens.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-5">
                      Adicione produtos ou informe um total avulso.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
                <Field label="Observacao">
                  <input
                    value={novo.observacao}
                    onChange={(event) => setNovo((current) => ({ ...current, observacao: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="Detalhes do pedido"
                  />
                </Field>
                <Field label="Cupom">
                  <input
                    value={novo.cupomCodigo}
                    onChange={(event) => setNovo((current) => ({ ...current, cupomCodigo: event.target.value }))}
                    className="input-soft h-10 w-full"
                    placeholder="Opcional"
                  />
                </Field>
              </div>

              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={novo.pago}
                  onChange={(event) => setNovo((current) => ({ ...current, pago: event.target.checked }))}
                />
                Pedido ja esta pago
              </label>
            </div>

            <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Total do pedido</div>
                <div className="text-lg font-bold">{brl(totalNovo)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={fecharNovoPedido} className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold">
                  Cancelar
                </button>
                <button
                  onClick={() => void criarNovoPedido()}
                  disabled={salvandoNovo}
                  className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {salvandoNovo && <Loader2 className="size-4 animate-spin" />}
                  Criar pedido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <button
                onClick={() => void confirmarPagamento()}
                disabled={Boolean(salvandoStatus)}
                className="flex-1 h-10 rounded-xl bg-success text-success-foreground text-sm font-semibold disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

async function carregarPedidos(): Promise<Pedido[]> {
  const response = await fetch("/api/crm/pedidos", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar pedidos");
  const data = await response.json();
  return Array.isArray(data) ? data.map(normalizarPedido) : [];
}

function normalizarPedido(pedido: Record<string, unknown>): Pedido {
  const statusPagamento = String(pedido.statusPagamento ?? pedido.status_pagamento ?? "");
  const pagamento = String(pedido.pagamento ?? "Pendente");
  const status = isPedidoStatus(pedido.status) ? pedido.status : "novo";

  return {
    id: String(pedido.id ?? ""),
    cliente: String(pedido.cliente ?? "Cliente"),
    pet: String(pedido.pet ?? ""),
    total: Number(pedido.total ?? 0),
    status,
    bairro: String(pedido.bairro ?? ""),
    hora: String(pedido.hora ?? ""),
    pagamento,
    pago: statusPagamento.toLowerCase() === "pago" || status === "pago",
    comprovante: statusPagamento.toLowerCase() === "pago",
    taxaMaquina: 0,
    notaFiscal: false,
  };
}

function isPedidoStatus(value: unknown): value is Pedido["status"] {
  return (
    value === "novo" ||
    value === "pago" ||
    value === "separando" ||
    value === "em rota" ||
    value === "entregue" ||
    value === "cancelado"
  );
}
