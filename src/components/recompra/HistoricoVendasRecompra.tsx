import type { RecompraPrevista } from "@/lib/crm-types";
import type {
  ComparacaoCicloHistorico,
  HistoricoVendaRecompra,
  VereditoCicloHistorico,
} from "@/lib/historico-recompra";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const QTD_INICIAL = 5;

const VEREDITO: Record<VereditoCicloHistorico, { titulo: string; classe: string }> = {
  bate: {
    titulo: "Previsão bate com o histórico",
    classe: "border-success/25 bg-success/10 text-success",
  },
  curto: {
    titulo: "Previsão mais curta que o histórico",
    classe: "border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300",
  },
  longo: {
    titulo: "Previsão mais longa que o histórico",
    classe: "border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300",
  },
  sem_dados: {
    titulo: "Histórico insuficiente para comparar",
    classe: "border-border bg-secondary text-muted-foreground",
  },
};

function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(dataIso: string) {
  return new Date(`${dataIso}T12:00:00`).toLocaleDateString("pt-BR");
}

function diasDesde(dataIso: string) {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  return Math.round((hoje.getTime() - new Date(`${dataIso}T12:00:00`).getTime()) / 86_400_000);
}

function kg(valor: number) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

function textoComparacao(c: ComparacaoCicloHistorico, cicloUsado: number) {
  if (c.veredito === "sem_dados") {
    return c.comprasNoCiclo <= 1
      ? "Só há 1 compra de ração para esses pets. A comparação aparece a partir da 2ª compra."
      : "As compras de ração estão muito próximas ou muito distantes (fora de 3 a 180 dias) para comparar.";
  }
  const base = `Pelo histórico, esta compra deve durar ${c.cicloHistorico} dias${
    c.consumoRealG ? ` (consumo real de ${c.consumoRealG} g/dia)` : ""
  }. A previsão usa ${cicloUsado} dias`;
  if (c.veredito === "bate") return `${base}.`;
  return `${base}, ${Math.abs(c.diferencaDias ?? 0)} dias a ${
    c.veredito === "longo" ? "mais" : "menos"
  }.`;
}

export function HistoricoVendasRecompra({ item }: { item: RecompraPrevista }) {
  const [vendas, setVendas] = useState<HistoricoVendaRecompra[] | null>(null);
  const [comparacao, setComparacao] = useState<ComparacaoCicloHistorico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    let ativo = true;
    setVendas(null);
    setErro(null);
    setVerTodas(false);
    fetch(`/api/crm/recompra-prevista?historico=${encodeURIComponent(item.id)}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          vendas?: HistoricoVendaRecompra[];
          comparacao?: ComparacaoCicloHistorico;
          erro?: string;
        };
        if (!response.ok || !data.vendas || !data.comparacao) {
          throw new Error(data.erro ?? "Não foi possível carregar o histórico");
        }
        if (!ativo) return;
        setVendas(data.vendas);
        setComparacao(data.comparacao);
      })
      .catch((error: unknown) => {
        if (ativo) setErro(error instanceof Error ? error.message : "Erro ao carregar histórico");
      });
    return () => {
      ativo = false;
    };
    // Recarrega quando muda a previsão ou o ciclo/data salvos.
  }, [item.id, item.previsaoBase, item.ultimaCompraIso]);

  const visiveis = vendas ? (verTodas ? vendas : vendas.slice(0, QTD_INICIAL)) : [];
  const ultimaNoCiclo = vendas?.find((venda) => venda.itens.some((i) => i.entraNoCiclo));

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Histórico de vendas do cliente
        </p>
        {vendas && (
          <span className="text-xs text-muted-foreground">
            · {vendas.length} {vendas.length === 1 ? "venda" : "vendas"}
          </span>
        )}
      </div>

      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
      {!vendas && !erro && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando vendas...
        </p>
      )}

      {comparacao && (
        <div
          className={cn("mt-3 rounded-lg border px-3 py-2", VEREDITO[comparacao.veredito].classe)}
        >
          <p className="text-xs font-semibold">{VEREDITO[comparacao.veredito].titulo}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">
            {textoComparacao(comparacao, item.previsaoBase)}
            {comparacao.intervaloMedioDias
              ? ` Intervalo médio entre as compras de ração: ${comparacao.intervaloMedioDias} dias.`
              : ""}
          </p>
        </div>
      )}

      {vendas && vendas.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Nenhuma venda lançada para o cliente.</p>
      )}

      {visiveis.length > 0 && (
        <ol className="mt-3 space-y-2">
          {visiveis.map((venda) => {
            const noCiclo = venda.itens.some((i) => i.entraNoCiclo);
            const atual = venda.vendaId === ultimaNoCiclo?.vendaId;
            return (
              <li
                key={venda.vendaId}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  noCiclo ? "border-primary/25 bg-primary/5" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">{dataBr(venda.data)}</span>
                  <span className="text-muted-foreground">
                    {venda.total != null ? brl(Number(venda.total)) : ""}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {venda.itens.map((it, index) => (
                    <li
                      key={`${it.sku}-${index}`}
                      className={cn(it.entraNoCiclo ? "text-foreground" : "text-muted-foreground")}
                    >
                      {it.quantidade}× {it.nome}
                      {it.racao && it.pesoKg > 0 ? ` · ${kg(it.pesoKg)}` : ""}
                      {it.petNome ? ` · ${it.petNome}` : ""}
                      {it.racao && !it.entraNoCiclo ? " · outro pet/espécie" : ""}
                    </li>
                  ))}
                </ul>
                {noCiclo && (
                  <p className="mt-1 font-medium text-primary">
                    {venda.durouDias != null
                      ? `Durou ${venda.durouDias} dias até a próxima ração${
                          venda.consumoRealG ? ` · ${venda.consumoRealG} g/dia` : ""
                        }`
                      : atual
                        ? `Compra atual · ${diasDesde(venda.data)} dias até hoje · previsão de ${item.previsaoBase} dias`
                        : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {vendas && vendas.length > QTD_INICIAL && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setVerTodas((v) => !v)}
        >
          <ChevronDown className={cn("size-4 transition-transform", verTodas && "rotate-180")} />
          {verTodas ? "Mostrar só as últimas 5" : `Ver todas as ${vendas.length} vendas`}
        </Button>
      )}
    </section>
  );
}
