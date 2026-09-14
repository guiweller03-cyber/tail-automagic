import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onCrmReload } from "@/lib/crm-refresh";
import type { VendaFinanceira } from "@/lib/financeiro-supabase";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FilterX,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const ENDPOINT = "/api/crm/financeiro/vendas";
const PAGE_SIZE = 25;

type ApiResponse = {
  ok: true;
  vendas: VendaFinanceira[];
  total: number;
  atualizadoEm: string;
};

type Filtros = {
  busca: string;
  inicio: string;
  fim: string;
  pagamento: string;
  statusPagamento: string;
  statusVenda: string;
  origem: string;
};

const FILTROS_INICIAIS: Filtros = {
  busca: "",
  inicio: "",
  fim: "",
  pagamento: "todos",
  statusPagamento: "todos",
  statusVenda: "todos",
  origem: "todas",
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function textoComparavel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function dataVenda(value: VendaFinanceira): Date {
  return new Date(value.criadoEm);
}

function dataValida(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

function formatarDataHora(value: string | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (!dataValida(date)) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rotulo(value: string): string {
  const normalizado = value.replaceAll("_", " ").trim();
  if (!normalizado) return "Não informado";
  return normalizado.charAt(0).toLocaleUpperCase("pt-BR") + normalizado.slice(1);
}

function vendaCancelada(venda: VendaFinanceira): boolean {
  return ["cancelada", "cancelado", "reembolsada", "reembolsado"].includes(
    venda.status.toLocaleLowerCase("pt-BR"),
  );
}

function vendaPaga(venda: VendaFinanceira): boolean {
  return venda.statusPagamento.toLocaleLowerCase("pt-BR") === "pago";
}

function itensResumo(venda: VendaFinanceira): string {
  if (venda.itens.length === 0) return venda.observacao || "Venda sem itens detalhados";
  return venda.itens
    .slice(0, 2)
    .map((item) => `${item.quantidade}x ${item.nome}`)
    .join(" · ");
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function SelectFiltro({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}

export function HistoricoVendas() {
  const [vendas, setVendas] = useState<VendaFinanceira[]>([]);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro("");
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const data = (await response.json()) as ApiResponse | { ok?: false; erro?: string };
      if (!response.ok || !data.ok || !("vendas" in data)) {
        throw new Error("erro" in data ? data.erro : "Não foi possível carregar as vendas");
      }
      setVendas(data.vendas);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao carregar o histórico");
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    return onCrmReload(() => void carregar(true));
  }, [carregar]);

  const formasPagamento = useMemo(
    () => Array.from(new Set(vendas.map((venda) => venda.formaPagamento))).sort(),
    [vendas],
  );
  const statusPagamentos = useMemo(
    () => Array.from(new Set(vendas.map((venda) => venda.statusPagamento))).sort(),
    [vendas],
  );
  const statusVendas = useMemo(
    () => Array.from(new Set(vendas.map((venda) => venda.status))).sort(),
    [vendas],
  );

  const vendasFiltradas = useMemo(() => {
    const busca = textoComparavel(filtros.busca.trim());
    const inicio = filtros.inicio ? new Date(`${filtros.inicio}T00:00:00`) : null;
    const fim = filtros.fim ? new Date(`${filtros.fim}T23:59:59.999`) : null;

    return vendas.filter((venda) => {
      const data = dataVenda(venda);
      if (inicio && dataValida(data) && data < inicio) return false;
      if (fim && dataValida(data) && data > fim) return false;
      if (filtros.pagamento !== "todos" && venda.formaPagamento !== filtros.pagamento) {
        return false;
      }
      if (
        filtros.statusPagamento !== "todos" &&
        venda.statusPagamento !== filtros.statusPagamento
      ) {
        return false;
      }
      if (filtros.statusVenda !== "todos" && venda.status !== filtros.statusVenda) return false;
      if (filtros.origem !== "todas" && venda.origem !== filtros.origem) return false;
      if (!busca) return true;

      const conteudo = textoComparavel(
        [
          venda.id,
          venda.cliente,
          venda.telefone,
          venda.petNome,
          venda.observacao,
          venda.cupom,
          ...venda.itens.flatMap((item) => [item.nome, item.sku, item.petNome]),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return conteudo.includes(busca);
    });
  }, [filtros, vendas]);

  useEffect(() => setPagina(1), [filtros]);

  const resumo = useMemo(() => {
    const ativas = vendasFiltradas.filter((venda) => !vendaCancelada(venda));
    const pagas = ativas.filter(vendaPaga);
    const pendentes = ativas.filter((venda) => !vendaPaga(venda));
    return {
      quantidade: ativas.length,
      recebido: pagas.reduce((sum, venda) => sum + venda.total, 0),
      aReceber: pendentes.reduce((sum, venda) => sum + venda.total, 0),
      lucro: pagas.reduce((sum, venda) => sum + venda.lucro, 0),
      ticket: ativas.length
        ? ativas.reduce((sum, venda) => sum + venda.total, 0) / ativas.length
        : 0,
    };
  }, [vendasFiltradas]);

  const totalPaginas = Math.max(1, Math.ceil(vendasFiltradas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const vendasPagina = vendasFiltradas.slice(
    (paginaSegura - 1) * PAGE_SIZE,
    paginaSegura * PAGE_SIZE,
  );
  const temFiltros = Object.entries(filtros).some(
    ([key, value]) => value !== FILTROS_INICIAIS[key as keyof Filtros],
  );

  function exportarCsv() {
    const cabecalho = [
      "ID",
      "Data",
      "Cliente",
      "Telefone",
      "Pet",
      "Itens",
      "Origem",
      "Pagamento",
      "Status pagamento",
      "Status venda",
      "Processo",
      "Total bruto",
      "Desconto",
      "Total",
      "Custo produtos",
      "Lucro",
      "Margem (%)",
      "Cupom",
      "Observacao",
    ];
    const linhas = vendasFiltradas.map((venda) =>
      [
        venda.id,
        formatarDataHora(venda.criadoEm),
        venda.cliente,
        venda.telefone,
        venda.petNome,
        itensResumo(venda),
        venda.origem,
        venda.formaPagamento,
        venda.statusPagamento,
        venda.status,
        venda.processo,
        venda.totalBruto.toFixed(2),
        venda.desconto.toFixed(2),
        venda.total.toFixed(2),
        venda.custoProdutos.toFixed(2),
        venda.lucro.toFixed(2),
        venda.margem.toFixed(2),
        venda.cupom,
        venda.observacao,
      ]
        .map(escapeCsv)
        .join(";"),
    );
    const blob = new Blob(["\uFEFF", [cabecalho.map(escapeCsv).join(";"), ...linhas].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">Histórico completo de vendas</h2>
          <p className="text-sm text-muted-foreground">
            Todas as vendas antigas e as novas vendas finalizadas no PDV aparecem aqui.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarCsv} disabled={vendasFiltradas.length === 0}>
            <Download className="size-4" /> Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ResumoCard label="Vendas" value={String(resumo.quantidade)} />
        <ResumoCard label="Recebido" value={brl(resumo.recebido)} tone="success" />
        <ResumoCard label="A receber" value={brl(resumo.aReceber)} tone="warning" />
        <ResumoCard label="Lucro recebido" value={brl(resumo.lucro)} tone="primary" />
        <ResumoCard label="Ticket médio" value={brl(resumo.ticket)} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1 md:col-span-2">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Buscar
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtros.busca}
                onChange={(event) =>
                  setFiltros((atual) => ({ ...atual, busca: event.target.value }))
                }
                placeholder="Cliente, telefone, produto, SKU ou venda"
                className="pl-9"
              />
            </div>
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              De
            </span>
            <Input
              type="date"
              value={filtros.inicio}
              onChange={(event) =>
                setFiltros((atual) => ({ ...atual, inicio: event.target.value }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Até
            </span>
            <Input
              type="date"
              value={filtros.fim}
              onChange={(event) => setFiltros((atual) => ({ ...atual, fim: event.target.value }))}
            />
          </label>
          <SelectFiltro
            label="Pagamento"
            value={filtros.pagamento}
            onChange={(pagamento) => setFiltros((atual) => ({ ...atual, pagamento }))}
          >
            <option value="todos">Todos</option>
            {formasPagamento.map((forma) => (
              <option key={forma} value={forma}>
                {forma}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro
            label="Situação"
            value={filtros.statusPagamento}
            onChange={(statusPagamento) => setFiltros((atual) => ({ ...atual, statusPagamento }))}
          >
            <option value="todos">Todas</option>
            {statusPagamentos.map((status) => (
              <option key={status} value={status}>
                {rotulo(status)}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro
            label="Origem"
            value={filtros.origem}
            onChange={(origem) => setFiltros((atual) => ({ ...atual, origem }))}
          >
            <option value="todas">Todas</option>
            <option value="PDV">PDV</option>
            <option value="WhatsApp IA">WhatsApp IA</option>
            <option value="CRM">CRM</option>
          </SelectFiltro>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <SelectFiltro
              label="Status da venda"
              value={filtros.statusVenda}
              onChange={(statusVenda) => setFiltros((atual) => ({ ...atual, statusVenda }))}
            >
              <option value="todos">Todos</option>
              {statusVendas.map((status) => (
                <option key={status} value={status}>
                  {rotulo(status)}
                </option>
              ))}
            </SelectFiltro>
            {temFiltros && (
              <Button variant="ghost" size="sm" onClick={() => setFiltros(FILTROS_INICIAIS)}>
                <FilterX className="size-4" /> Limpar filtros
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {vendasFiltradas.length} de {vendas.length} venda(s)
          </p>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {carregando ? (
          <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin" /> Carregando todas as vendas…
            </span>
          </div>
        ) : vendasPagina.length === 0 ? (
          <div className="grid min-h-60 place-items-center px-4 text-center">
            <div>
              <PackageSearch className="mx-auto mb-2 size-8 text-muted-foreground" />
              <p className="font-semibold">Nenhuma venda encontrada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajuste os filtros para consultar outro período ou cliente.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-sm">
              <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Data / venda</th>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Itens</th>
                  <th className="px-4 py-3 font-semibold">Origem</th>
                  <th className="px-4 py-3 font-semibold">Pagamento</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Lucro</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {vendasPagina.map((venda) => {
                  const aberta = expandida === venda.id;
                  return (
                    <VendaRow
                      key={venda.id}
                      venda={venda}
                      aberta={aberta}
                      onToggle={() => setExpandida(aberta ? null : venda.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!carregando && vendasFiltradas.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Exibindo {(paginaSegura - 1) * PAGE_SIZE + 1}–
            {Math.min(paginaSegura * PAGE_SIZE, vendasFiltradas.length)} de {vendasFiltradas.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={paginaSegura <= 1}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
            >
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <span className="text-xs font-semibold">
              {paginaSegura} / {totalPaginas}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={paginaSegura >= totalPaginas}
              onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}
            >
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ResumoCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "primary";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn("mt-1 text-xl font-bold tabular-nums", {
          "text-success": tone === "success",
          "text-amber-600 dark:text-amber-400": tone === "warning",
          "text-primary": tone === "primary",
        })}
      >
        {value}
      </p>
    </div>
  );
}

function VendaRow({
  venda,
  aberta,
  onToggle,
}: {
  venda: VendaFinanceira;
  aberta: boolean;
  onToggle: () => void;
}) {
  const cancelada = vendaCancelada(venda);
  return (
    <>
      <tr
        className={cn("border-t border-border align-top hover:bg-secondary/30", {
          "opacity-60": cancelada,
        })}
      >
        <td className="px-4 py-3">
          <strong className="block whitespace-nowrap">{formatarDataHora(venda.criadoEm)}</strong>
          <span className="mt-0.5 block max-w-36 truncate font-mono text-[10px] text-muted-foreground">
            {venda.id}
          </span>
        </td>
        <td className="px-4 py-3">
          <strong className="block max-w-48 truncate">{venda.cliente}</strong>
          <span className="text-xs text-muted-foreground">{venda.telefone || "Sem telefone"}</span>
        </td>
        <td className="max-w-72 px-4 py-3">
          <span className="line-clamp-2">{itensResumo(venda)}</span>
          <span className="text-xs text-muted-foreground">
            {venda.quantidadeItens || venda.itens.length} item(ns)
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold">
            {venda.origem}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="block">{venda.formaPagamento}</span>
          <StatusPill tipo="pagamento" value={venda.statusPagamento} />
        </td>
        <td className="px-4 py-3 text-right font-bold tabular-nums">{brl(venda.total)}</td>
        <td className="px-4 py-3 text-right">
          <strong
            className={cn("tabular-nums", venda.lucro >= 0 ? "text-success" : "text-destructive")}
          >
            {brl(venda.lucro)}
          </strong>
          <span className="block text-[10px] text-muted-foreground">
            {venda.margem.toFixed(1)}%
          </span>
        </td>
        <td className="px-4 py-3">
          <StatusPill tipo="venda" value={venda.status} />
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {rotulo(venda.processo)}
          </span>
        </td>
        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={aberta ? "Fechar detalhes" : "Abrir detalhes"}
            aria-expanded={aberta}
          >
            <ChevronDown className={cn("size-4 transition-transform", aberta && "rotate-180")} />
          </button>
        </td>
      </tr>
      {aberta && (
        <tr className="border-t border-border bg-secondary/20">
          <td colSpan={9} className="p-4">
            <VendaDetalhes venda={venda} />
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ tipo, value }: { tipo: "pagamento" | "venda"; value: string }) {
  const lower = value.toLocaleLowerCase("pt-BR");
  const positivo = tipo === "pagamento" ? lower === "pago" : lower === "concluida";
  const negativo = ["cancelada", "cancelado", "reembolsada", "reembolsado"].includes(lower);
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", {
        "bg-success/10 text-success": positivo,
        "bg-destructive/10 text-destructive": negativo,
        "bg-warning/15 text-amber-700 dark:text-amber-300": !positivo && !negativo,
      })}
    >
      {rotulo(value)}
    </span>
  );
}

function VendaDetalhes({ venda }: { venda: VendaFinanceira }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Detalhe label="Cliente" value={venda.cliente} />
        <Detalhe label="Telefone" value={venda.telefone || "Não informado"} />
        <Detalhe label="Pet" value={venda.petNome || "Não informado"} />
        <Detalhe label="Criada em" value={formatarDataHora(venda.criadoEm)} />
        <Detalhe label="Recebida em" value={formatarDataHora(venda.faturadoEm)} />
        <Detalhe label="Origem" value={venda.origem} />
        <Detalhe label="Total bruto" value={brl(venda.totalBruto)} />
        <Detalhe label="Desconto" value={brl(venda.desconto)} />
        <Detalhe label="Total final" value={brl(venda.total)} />
        <Detalhe label="Custo dos produtos" value={brl(venda.custoProdutos)} />
        <Detalhe label="Lucro" value={brl(venda.lucro)} />
        <Detalhe label="Margem" value={`${venda.margem.toFixed(2)}%`} />
        <Detalhe label="Pagamento" value={venda.formaPagamento} />
        <Detalhe label="Status do pagamento" value={rotulo(venda.statusPagamento)} />
        <Detalhe label="Status da venda" value={rotulo(venda.status)} />
        <Detalhe label="Processo" value={rotulo(venda.processo)} />
        <Detalhe label="Cupom" value={venda.cupom || "Nenhum"} />
        <Detalhe label="Venda original" value={venda.vendaOrigem || "Não se aplica"} mono />
      </div>

      {venda.itens.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-[760px] w-full text-xs">
            <thead className="bg-secondary/70 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Produto</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Pet</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd.</th>
                <th className="px-3 py-2 text-right font-semibold">Unitário</th>
                <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                <th className="px-3 py-2 text-right font-semibold">Custo</th>
              </tr>
            </thead>
            <tbody>
              {venda.itens.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{item.nome}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{item.sku}</td>
                  <td className="px-3 py-2">{item.petNome || "—"}</td>
                  <td className="px-3 py-2 text-right">{item.quantidade}</td>
                  <td className="px-3 py-2 text-right">{brl(item.precoUnitario)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(item.subtotal)}</td>
                  <td className="px-3 py-2 text-right">{brl(item.custoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3 text-xs">
        <span className="font-bold text-muted-foreground">Observação</span>
        <p className="mt-1 whitespace-pre-wrap break-words">
          {venda.observacao || "Nenhuma observação registrada."}
        </p>
      </div>
    </div>
  );
}

function Detalhe({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <strong className={cn("mt-1 block break-words text-xs", mono && "font-mono text-[10px]")}>
        {value}
      </strong>
    </div>
  );
}
