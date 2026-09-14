import type { OrigemCicloRecompra, RecompraPetCalculo, RecompraPrevista } from "@/lib/crm-types";
import { Link } from "@tanstack/react-router";
import {
  dataRecompra,
  explicacaoCiclo,
  mensagemRecompra,
  nomesPets,
  previsaoPorMes,
  situacaoPainel,
  telefoneComparavel,
  telefoneWhatsApp,
  type PainelSituacao,
} from "@/lib/painel-recompra";
import { onCrmReload } from "@/lib/crm-refresh";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Cat,
  Check,
  ChevronDown,
  Copy,
  Database,
  Dog,
  ExternalLink,
  Info,
  Loader2,
  MessageCircle,
  PackageCheck,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type RecompraApiData = {
  recompras: RecompraPrevista[];
};

type ConversaMensagem = {
  id?: string;
  role?: string;
  content?: string;
  at?: string;
  fromMe?: boolean;
  messageType?: string;
};

type ConversaApi = {
  id: string;
  telefone: string;
  nome_cliente?: string | null;
  historico?: ConversaMensagem[];
};

const COLUNAS: PainelSituacao[] = ["atrasado", "urgente", "normal"];

const SITUACAO_META: Record<
  PainelSituacao,
  { titulo: string; descricao: string; dot: string; chip: string; bar: string }
> = {
  atrasado: {
    titulo: "Atrasado",
    descricao: "A previsão já passou",
    dot: "bg-destructive",
    chip: "border-destructive/25 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
  },
  urgente: {
    titulo: "Urgente",
    descricao: "Até 3 dias restantes",
    dot: "bg-warning",
    chip: "border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300",
    bar: "bg-warning",
  },
  normal: {
    titulo: "Normal",
    descricao: "Mais de 3 dias restantes",
    dot: "bg-success",
    chip: "border-success/25 bg-success/10 text-success",
    bar: "bg-success",
  },
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function percentual(parte: number, total: number) {
  return total > 0 ? (parte / total) * 100 : 0;
}

function fonteCalculo(item: RecompraPrevista): "tabela" | "estimativa" {
  if (item.fonteCalculo) return item.fonteCalculo;
  return item.petsCalculo?.some((pet) => pet.linha && pet.linha !== "generica")
    ? "tabela"
    : "estimativa";
}

function formatarData(iso: string | undefined, fallback: string) {
  if (!iso) return fallback;
  const data = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(data.getTime())) return fallback;
  return data.toLocaleDateString("pt-BR");
}

const ORIGEM_CICLO: Record<OrigemCicloRecompra, string> = {
  historico: "histórico de compras",
  observacao: "anotação do pedido",
  cadastro_manual: "cadastro manual",
  consumo: "consumo dos pets",
};

function somarDias(iso: string | undefined, dias: number) {
  if (!iso) return null;
  const data = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(data.getTime())) return null;
  data.setDate(data.getDate() + dias);
  return data.toLocaleDateString("pt-BR");
}

function rotuloDias(dias: number) {
  if (dias < 0) return `${Math.abs(dias)} d atrás`;
  if (dias === 0) return "hoje";
  return `em ${dias} d`;
}

function progressoCiclo(item: RecompraPrevista) {
  const ciclo = Math.max(1, item.previsaoBase);
  const consumido = ciclo - item.diasRestantes;
  return Math.max(0, Math.min(100, (consumido / ciclo) * 100));
}

function urlPdv(item: RecompraPrevista) {
  return `/pdv?${new URLSearchParams({
    cliente: item.cliente,
    telefone: item.telefone,
    sku: item.sku,
    pet: item.pet,
    quantidade: String(Math.max(1, item.quantidade)),
  })}`;
}

function buscaConversa(item: RecompraPrevista) {
  return {
    telefone: telefoneWhatsApp(item.telefone),
    clienteId: item.clienteId,
    cliente: item.cliente,
    origem: "recompra",
  };
}

export function PainelRecompra() {
  const [items, setItems] = useState<RecompraPrevista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recalculando, setRecalculando] = useState(false);
  const [busca, setBusca] = useState("");
  const [metodologiaAberta, setMetodologiaAberta] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm/recompra-prevista", { cache: "no-store" });
      const data = (await response.json()) as RecompraApiData | { erro?: string };
      if (!response.ok || !("recompras" in data)) {
        throw new Error("erro" in data ? data.erro : "Não foi possível carregar as recompras");
      }
      setItems(data.recompras ?? []);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Falha ao carregar recompras";
      setItems([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    return onCrmReload(() => void carregar());
  }, [carregar]);

  async function recalcular() {
    if (recalculando) return;
    setRecalculando(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; vendas?: number; erro?: string };
      if (!response.ok || !data.ok) throw new Error(data.erro ?? "Falha ao recalcular previsões");
      toast.success(`${data.vendas ?? 0} vendas analisadas`);
      await carregar();
    } catch (recalculateError) {
      toast.error(
        recalculateError instanceof Error
          ? recalculateError.message
          : "Falha ao recalcular previsões",
      );
    } finally {
      setRecalculando(false);
    }
  }

  const filtrados = useMemo(() => {
    const query = busca.trim().toLocaleLowerCase("pt-BR");
    if (!query) return items;
    return items.filter((item) =>
      `${item.cliente} ${item.pet} ${item.racao} ${item.sku}`
        .toLocaleLowerCase("pt-BR")
        .includes(query),
    );
  }, [busca, items]);

  const selecionado = items.find((item) => item.id === abertoId) ?? null;
  const totalPrevisto = items.reduce((sum, item) => sum + item.valorEstimado, 0);
  const comTabela = items.filter((item) => fonteCalculo(item) === "tabela").length;
  const noPrazo = items.filter((item) => item.diasRestantes >= 0).length;
  const multiPet = items.filter((item) => nomesPets(item).length > 1).length;
  const serie = useMemo(() => previsaoPorMes(items), [items]);
  const pesosInferidos = useMemo(
    () =>
      items.filter((item) =>
        (item.petsCalculo ?? []).some(
          (pet) => pet.pesoOrigem && pet.pesoOrigem !== "informado" && pet.pesoOrigem !== "medido",
        ),
      ),
    [items],
  );
  const semDetalhes = items.filter((item) => !item.petsCalculo?.length).length;

  function marcarContatado(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, contatado: true } : item)),
    );
  }

  function atualizarItem(atualizado: RecompraPrevista) {
    setItems((current) =>
      current.map((item) => (item.id === atualizado.id ? { ...item, ...atualizado } : item)),
    );
  }

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
            <PackageCheck className="size-4" />
            Operação de recorrência
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Painel de recompra</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} combinações de cliente, pet e ração · {brl(totalPrevisto)} previstos
          </p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:items-center">
          <div className="relative min-w-0 sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar cliente, pet ou produto"
              aria-label="Buscar na fila de recompra"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void recalcular()}
            disabled={recalculando}
            className="w-full sm:w-auto"
          >
            {recalculando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Recalcular
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> {error}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setMetodologiaAberta((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/50"
          aria-expanded={metodologiaAberta}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4 text-primary" /> Como o cálculo real funciona
          </span>
          <ChevronDown
            className={cn("size-4 transition-transform", metodologiaAberta && "rotate-180")}
          />
        </button>
        {metodologiaAberta && (
          <div className="grid gap-5 border-t border-border px-4 py-4 text-sm md:grid-cols-2">
            <ol className="space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">1.</strong> Usa o peso e a quantidade da ração
                registrada na venda.
              </li>
              <li>
                <strong className="text-foreground">2.</strong> Soma o consumo diário dos pets
                vinculados ao pacote.
              </li>
              <li>
                <strong className="text-foreground">3.</strong> Considera espécie, porte, raça, fase
                de vida e peso cadastrado ou estimado.
              </li>
              <li>
                <strong className="text-foreground">4.</strong> Compara o ciclo calculado com o
                histórico real de compras quando ele existe.
              </li>
              <li>
                <strong className="text-foreground">5.</strong> Recalcula a data prevista e ordena a
                fila pelos dias restantes.
              </li>
            </ol>
            <div className="space-y-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="font-semibold">Qualidade dos dados</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {pesosInferidos.length} previsões usam peso inferido por raça, porte ou curva de
                  crescimento.
                  {semDetalhes > 0
                    ? ` ${semDetalhes} registros antigos ainda não têm detalhamento por pet.`
                    : ""}
                </p>
              </div>
              {pesosInferidos.slice(0, 4).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setAbertoId(item.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-secondary/60"
                >
                  <span className="min-w-0 truncate">
                    <strong>{item.pet}</strong> · {item.cliente}
                  </span>
                  <span className="shrink-0 text-muted-foreground">ver dados</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <RingStat
          percent={percentual(comTabela, items.length)}
          tone="primary"
          label="Com tabela de consumo"
          sublabel="Linha identificada no cadastro técnico do produto."
        />
        <RingStat
          percent={percentual(noPrazo, items.length)}
          tone="info"
          label="Fila dentro do prazo"
          sublabel="Previsões que ainda não passaram da data calculada."
        />
        <RingStat
          percent={percentual(multiPet, items.length)}
          tone="warning"
          label="Pacotes compartilhados"
          sublabel="Recompras calculadas para dois ou mais pets."
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Valor previsto por mês</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Somente previsões reais carregadas do CRM.
            </p>
          </div>
          <span className="text-sm font-bold">{brl(totalPrevisto)}</span>
        </div>
        <div className="mt-3 h-60">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : serie.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Nenhuma previsão disponível.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="recompraArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <YAxis
                  tickFormatter={(value) => brl(Number(value)).replace(",00", "")}
                  tickLine={false}
                  axisLine={false}
                  width={82}
                  fontSize={12}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  formatter={(value) => [brl(Number(value)), "Previsto"]}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="valor"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#recompraArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {COLUNAS.map((coluna) => {
          const meta = SITUACAO_META[coluna];
          const colunaItems = filtrados.filter((item) => situacaoPainel(item) === coluna);
          return (
            <div
              key={coluna}
              className="flex min-h-48 flex-col rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", meta.dot)} /> {meta.titulo}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta.descricao}</p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                  {colunaItems.length}
                </span>
              </div>
              <div className="mt-3 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
                {loading ? (
                  <div className="grid h-28 place-items-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : colunaItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Nenhuma recompra aqui
                  </p>
                ) : (
                  colunaItems.map((item) => (
                    <RecompraCard key={item.id} item={item} onOpen={() => setAbertoId(item.id)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Fila detalhada</h2>
          <span className="text-xs text-muted-foreground">{filtrados.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pet / cliente</th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Prevista</th>
                <th className="px-4 py-3 font-medium">Ciclo</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setAbertoId(item.id)}
                  className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <EspecieIcon especie={item.especie} />
                      <div className="min-w-0">
                        <p className="font-medium">{nomesPets(item).join(" + ") || item.pet}</p>
                        <p className="text-xs text-muted-foreground">{item.cliente}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-72 truncate text-xs font-medium">{item.racao}</p>
                    <div className="mt-1">
                      <FonteBadge fonte={fonteCalculo(item)} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">
                      {formatarData(item.dataPrevistaIso, item.dataPrevista)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rotuloDias(item.diasRestantes)}
                      {item.cicloManual ? " · ciclo ajustado" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          SITUACAO_META[situacaoPainel(item)].bar,
                        )}
                        style={{ width: `${progressoCiclo(item)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip situacao={situacaoPainel(item)} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{brl(item.valorEstimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtrados.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {busca
              ? `Nada encontrado para “${busca}”.`
              : "Nenhuma previsão de recompra cadastrada."}
          </p>
        )}
      </section>

      <Dialog open={Boolean(selecionado)} onOpenChange={(open) => !open && setAbertoId(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          {selecionado && (
            <RecompraDetalhe
              item={selecionado}
              onContatado={() => marcarContatado(selecionado.id)}
              onAtualizado={atualizarItem}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecompraCard({ item, onOpen }: { item: RecompraPrevista; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <EspecieIcon especie={item.especie} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {nomesPets(item).join(" + ") || item.pet}
          </p>
          <p className="truncate text-xs text-muted-foreground">{item.cliente}</p>
        </div>
        {item.contatado && (
          <Check className="size-4 shrink-0 text-success" aria-label="Cliente contatado" />
        )}
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{item.racao}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {item.dataPrevista} · {rotuloDias(item.diasRestantes)}
          {item.cicloManual ? " · ajustado" : ""}
        </span>
        <span className="font-semibold">{brl(item.valorEstimado)}</span>
      </div>
    </button>
  );
}

function RingStat({
  label,
  sublabel,
  percent,
  tone,
}: {
  label: string;
  sublabel: string;
  percent: number;
  tone: "primary" | "warning" | "info";
}) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const fill = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  const color = {
    primary: "var(--primary)",
    warning: "var(--warning)",
    info: "var(--chart-4)",
  }[tone];

  return (
    <div className="flex min-h-32 items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--muted)" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-xl font-bold">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}

function StatusChip({ situacao }: { situacao: PainelSituacao }) {
  const meta = SITUACAO_META[situacao];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.chip,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} /> {meta.titulo}
    </span>
  );
}

function FonteBadge({ fonte }: { fonte: "tabela" | "estimativa" }) {
  const tabela = fonte === "tabela";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tabela
          ? "border-success/25 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300",
      )}
      title={
        tabela
          ? "Consumo calculado pela linha técnica do produto"
          : "Consumo estimado por peso e perfil do pet"
      }
    >
      {tabela ? <Database className="size-3" /> : <Sparkles className="size-3" />}
      {tabela ? "tabela" : "estimativa"}
    </span>
  );
}

function EspecieIcon({ especie }: { especie: RecompraPrevista["especie"] }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground"
      title={especie === "cachorro" ? "Cachorro" : "Gato"}
    >
      {especie === "cachorro" ? <Dog className="size-4" /> : <Cat className="size-4" />}
    </span>
  );
}

function RecompraDetalhe({
  item,
  onContatado,
  onAtualizado,
}: {
  item: RecompraPrevista;
  onContatado: () => void;
  onAtualizado: (item: RecompraPrevista) => void;
}) {
  const pets = item.petsCalculo ?? [];
  const situacao = situacaoPainel(item);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-7 text-lg">
          {nomesPets(item).join(" + ") || item.pet} · {item.cliente}
        </DialogTitle>
        <DialogDescription>
          Dados da previsão, pets considerados e contato de recompra.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip situacao={situacao} />
          <FonteBadge fonte={fonteCalculo(item)} />
          {item.contatado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <Check className="size-3" /> Contatado
            </span>
          )}
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          <DetailField label="Produto" value={item.racao} />
          <DetailField label="SKU" value={item.sku || "Não informado"} />
          <DetailField
            label="Compra"
            value={formatarData(item.ultimaCompraIso, item.ultimaCompra)}
          />
          <DetailField
            label="Pacote"
            value={`${item.quantidade} un. · ${item.pesoKg.toLocaleString("pt-BR")} kg`}
          />
          <DetailField
            label="Consumo diário"
            value={`${Math.round(item.consumoDiaKg * 1000)} g/dia`}
          />
          <DetailField label="Valor estimado" value={brl(item.valorEstimado)} />
          <DetailField
            label="Recompra prevista"
            value={`${formatarData(item.dataPrevistaIso, item.dataPrevista)} (${rotuloDias(item.diasRestantes)})`}
            className="sm:col-span-2"
          />
        </dl>

        <CicloEditor item={item} onAtualizado={onAtualizado} />

        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Pets considerados</p>
          <div className="mt-2 space-y-2">
            {pets.length > 0 ? (
              pets.map((pet, index) => <PetRow key={`${pet.nome}-${index}`} pet={pet} />)
            ) : (
              <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
                {item.pet} · registro anterior ao detalhamento individual do cálculo
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild variant="outline" size="sm">
            <a href={urlPdv(item)}>
              <ShoppingBag className="size-4" /> Criar pedido no PDV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/conversas" search={buscaConversa(item)}>
              <MessageCircle className="size-4" /> Abrir conversa no CRM
            </Link>
          </Button>
        </div>

        <WhatsAppReal item={item} onContatado={onContatado} />
      </div>
    </>
  );
}

function CicloEditor({
  item,
  onAtualizado,
}: {
  item: RecompraPrevista;
  onAtualizado: (item: RecompraPrevista) => void;
}) {
  const [valor, setValor] = useState(String(item.previsaoBase));
  const [salvando, setSalvando] = useState(false);
  const cicloCalculado = item.cicloCalculado ?? item.previsaoBase;
  const dias = Number(valor);
  const valido = valor.trim() !== "" && Number.isInteger(dias) && dias >= 1 && dias <= 365;
  const alterado = valido && dias !== item.previsaoBase;
  const novaData = alterado ? somarDias(item.ultimaCompraIso, dias) : null;

  useEffect(() => {
    setValor(String(item.previsaoBase));
  }, [item.id, item.previsaoBase]);

  async function salvar(novoCiclo: number | null) {
    if (salvando) return;
    setSalvando(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "ciclo_manual", id: item.id, dias: novoCiclo }),
      });
      const data = (await response.json()) as { recompra?: RecompraPrevista; erro?: string };
      if (!response.ok || !data.recompra) {
        throw new Error(data.erro ?? "Não foi possível salvar o ciclo");
      }
      onAtualizado(data.recompra);
      toast.success(
        novoCiclo ? `Ciclo ajustado para ${novoCiclo} dias` : "Voltou para o cálculo automático",
      );
    } catch (saveError) {
      toast.error(
        saveError instanceof Error ? saveError.message : "Não foi possível salvar o ciclo",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ciclo de recompra</p>
          <p className="mt-1 text-lg font-bold">{item.previsaoBase} dias</p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            item.cicloManual
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-secondary text-muted-foreground",
          )}
        >
          {item.cicloManual
            ? "Ajustado manualmente"
            : `Automático · ${ORIGEM_CICLO[item.origemCiclo ?? "consumo"]}`}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explicacaoCiclo(item)}</p>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (alterado) void salvar(dias);
        }}
      >
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Dias que a compra dura
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            className="w-28"
          />
        </label>
        <Button type="submit" size="sm" disabled={salvando || !alterado}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
          Salvar ciclo
        </Button>
        {item.cicloManual ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={salvando}
            onClick={() => void salvar(null)}
          >
            <RotateCcw className="size-4" /> Voltar ao automático ({cicloCalculado} dias)
          </Button>
        ) : null}
      </form>
      {novaData && (
        <p className="mt-2 text-xs text-muted-foreground">
          Com {dias} dias contados da compra, a recompra passa para{" "}
          <strong className="text-foreground">{novaData}</strong>.
        </p>
      )}
      {valor.trim() !== "" && !valido && (
        <p className="mt-2 text-xs text-destructive">Informe um número inteiro entre 1 e 365.</p>
      )}
    </section>
  );
}

function DetailField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg bg-secondary px-3 py-2", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function PetRow({ pet }: { pet: RecompraPetCalculo }) {
  const origemPeso = {
    informado: "peso informado",
    medido: "peso medido",
    crescimento: "curva de crescimento",
    raca: "peso médio da raça",
    porte: "peso médio do porte",
  }[pet.pesoOrigem ?? "porte"];

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs">
      <EspecieIcon especie={pet.especie} />
      <div className="min-w-0">
        <p className="font-semibold">{pet.nome}</p>
        <p className="mt-0.5 text-muted-foreground">
          {[
            pet.raca,
            pet.porte ? `porte ${pet.porte}` : "",
            pet.fase,
            pet.pesoKg ? `${pet.pesoKg.toLocaleString("pt-BR")} kg` : "",
            pet.consumoDiaG ? `${pet.consumoDiaG} g/dia` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {pet.pesoOrigem && (
          <p className="mt-0.5 text-muted-foreground">Base do peso: {origemPeso}</p>
        )}
      </div>
    </div>
  );
}

function WhatsAppReal({ item, onContatado }: { item: RecompraPrevista; onContatado: () => void }) {
  const [conversa, setConversa] = useState<ConversaApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [marcandoContato, setMarcandoContato] = useState(false);
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [copied, setCopied] = useState(false);
  const [texto, setTexto] = useState(() => mensagemRecompra(item));

  useEffect(() => {
    setTexto(mensagemRecompra(item));
    setCopied(false);
  }, [item]);

  useEffect(() => {
    let alive = true;
    async function carregarConversa() {
      setLoading(true);
      try {
        const response = await fetch("/api/crm/conversas", { cache: "no-store" });
        const data = (await response.json()) as ConversaApi[] | { erro?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(!Array.isArray(data) ? data.erro : "Falha ao carregar conversa");
        }
        const telefone = telefoneComparavel(item.telefone);
        const encontrada =
          data.find((row) => telefone && telefoneComparavel(row.telefone) === telefone) ?? null;
        if (alive) setConversa(encontrada);
      } catch (conversationError) {
        if (alive) {
          setConversa(null);
          toast.error(
            conversationError instanceof Error
              ? conversationError.message
              : "Falha ao carregar conversa",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void carregarConversa();
    return () => {
      alive = false;
    };
  }, [item.telefone]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar a mensagem");
    }
  }

  async function registrarContato() {
    const response = await fetch("/api/crm/recompra-prevista", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipo: "contatado", id: item.id, contatado: true }),
    });
    if (!response.ok) throw new Error("Não foi possível marcar o contato");
    onContatado();
  }

  async function marcarComoContatado() {
    if (marcandoContato) return;
    setMarcandoContato(true);
    try {
      await registrarContato();
      toast.success("Contato marcado como realizado");
    } catch (contactError) {
      toast.error(
        contactError instanceof Error ? contactError.message : "Não foi possível marcar o contato",
      );
    } finally {
      setMarcandoContato(false);
    }
  }

  async function enviarNoCrm() {
    if (!conversa || !texto.trim() || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "mensagem",
          id: conversa.id,
          telefone: conversa.telefone,
          texto: texto.trim(),
        }),
      });
      const responseText = await response.text();
      const data = responseText
        ? (JSON.parse(responseText) as ConversaApi & { erro?: string })
        : null;
      if (!response.ok) throw new Error(data?.erro ?? "Não foi possível enviar a mensagem");
      if (data) setConversa(data);
      try {
        await registrarContato();
      } catch {
        toast.warning("Mensagem enviada, mas a marcação de contato falhou");
      }
      setConfirmandoEnvio(false);
      toast.success("Mensagem enviada pelo WhatsApp");
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : "Não foi possível enviar");
    } finally {
      setSending(false);
    }
  }

  const historico = (conversa?.historico ?? []).filter((mensagem) => mensagem.content).slice(-12);
  const whatsappLink = `https://wa.me/${telefoneWhatsApp(item.telefone)}?text=${encodeURIComponent(texto)}`;

  return (
    <section className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Conversa real no WhatsApp</h3>
        <span className="text-xs text-muted-foreground">{item.telefone || "Sem telefone"}</span>
      </div>

      <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-border bg-secondary/60 p-3">
        {loading ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : historico.length > 0 ? (
          historico.map((mensagem, index) => {
            const daLoja =
              mensagem.fromMe || mensagem.role === "assistant" || mensagem.role === "ai";
            return (
              <div
                key={mensagem.id ?? `${mensagem.at}-${index}`}
                className={cn("flex", daLoja ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[86%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed shadow-sm",
                    daLoja ? "bg-primary/20 text-foreground" : "bg-card text-card-foreground",
                  )}
                >
                  {mensagem.content}
                  {mensagem.at && (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {new Date(mensagem.at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid h-24 place-items-center px-4 text-center text-xs text-muted-foreground">
            Nenhum histórico real encontrado para este telefone.
          </div>
        )}
      </div>

      <label
        className="mt-4 block text-xs font-semibold text-muted-foreground"
        htmlFor={`mensagem-${item.id}`}
      >
        Mensagem de recompra
      </label>
      <textarea
        id={`mensagem-${item.id}`}
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        rows={5}
        className="input mt-2 resize-y bg-card text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {conversa && (
          <Button
            type="button"
            size="sm"
            onClick={() => setConfirmandoEnvio(true)}
            disabled={sending || !texto.trim()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Revisar envio
          </Button>
        )}
        {item.telefone ? (
          <Button asChild size="sm" variant={conversa ? "outline" : "default"}>
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Abrir no WhatsApp
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            <ExternalLink className="size-4" /> Abrir no WhatsApp
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => void copiar()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setTexto(mensagemRecompra(item))}
        >
          <MessageCircle className="size-4" /> Restaurar sugestão
        </Button>
        {!item.contatado && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void marcarComoContatado()}
            disabled={marcandoContato}
          >
            {marcandoContato ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            Marcar como contatado
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmandoEnvio}
        onOpenChange={(open) => {
          if (!sending) setConfirmandoEnvio(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio pelo WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Revise o destinatário e a mensagem. O disparo só ocorrerá ao confirmar abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm">
              <p className="font-medium">{item.cliente}</p>
              <p className="text-xs text-muted-foreground">{item.telefone}</p>
            </div>
            <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm leading-relaxed">
              {texto.trim()}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending || !texto.trim()}
              onClick={(event) => {
                event.preventDefault();
                void enviarNoCrm();
              }}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Confirmar envio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
