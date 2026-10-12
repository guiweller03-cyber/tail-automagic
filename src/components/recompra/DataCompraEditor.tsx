import type { RecompraPrevista } from "@/lib/crm-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function hojeLocal(): string {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function somarDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T12:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toLocaleDateString("pt-BR");
}

export function DataCompraEditor({
  item,
  onAtualizados,
  className,
}: {
  item: RecompraPrevista;
  onAtualizados: (items: RecompraPrevista[]) => void;
  className?: string;
}) {
  const dataAtual = item.ultimaCompraIso?.slice(0, 10) ?? "";
  const [compraEm, setCompraEm] = useState(dataAtual);
  const [salvando, setSalvando] = useState(false);
  const alterada = /^\d{4}-\d{2}-\d{2}$/.test(compraEm) && compraEm !== dataAtual;
  const novaPrevisao = alterada ? somarDias(compraEm, item.previsaoBase) : null;

  useEffect(() => {
    setCompraEm(dataAtual);
  }, [dataAtual, item.id]);

  async function salvar() {
    if (!alterada || salvando) return;
    setSalvando(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "data_compra", id: item.id, compraEm }),
      });
      const data = (await response.json()) as { recompras?: RecompraPrevista[]; erro?: string };
      if (!response.ok || !data.recompras) {
        throw new Error(data.erro ?? "Não foi possível corrigir a data da compra");
      }
      onAtualizados(data.recompras);
      toast.success("Data da compra corrigida e previsão recalculada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível corrigir a data");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className={cn("rounded-lg border border-border p-3", className)}>
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Data real da compra
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Corrija aqui quando a venda foi lançada no dia errado. A previsão e os outros itens da
            mesma venda serão recalculados.
          </p>
        </div>
      </div>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void salvar();
        }}
      >
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Compra realizada em
          <Input
            type="date"
            value={compraEm}
            max={hojeLocal()}
            onChange={(event) => setCompraEm(event.target.value)}
            className="w-44"
          />
        </label>
        <Button type="submit" size="sm" disabled={!alterada || salvando}>
          {salvando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarClock className="size-4" />
          )}
          Corrigir data
        </Button>
      </form>
      {novaPrevisao ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Mantendo o ciclo atual, a recompra passa para{" "}
          <strong className="text-foreground">{novaPrevisao}</strong>.
        </p>
      ) : null}
    </section>
  );
}
