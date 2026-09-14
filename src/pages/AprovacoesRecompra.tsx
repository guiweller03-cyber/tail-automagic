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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Followup, FollowupStatus } from "@/lib/followups-supabase";
import { onCrmReload } from "@/lib/crm-refresh";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  UserRoundX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ENDPOINT = "/api/crm/recompra-aprovacoes";

type ApiList = {
  ok: true;
  janelaDias: number;
  criadas: number;
  aprovacoes: Followup[];
};

type ApiAction = {
  ok: true;
  aprovacao: Followup;
  bloqueadoPor?: string;
  agendada?: boolean;
};

const statusMeta: Record<FollowupStatus, { label: string; className: string }> = {
  pendente: { label: "Preparando", className: "bg-warning/10 text-amber-700 dark:text-amber-300" },
  aguardando_confirmacao: {
    label: "Aguardando aprovação",
    className: "bg-primary/10 text-primary",
  },
  enviado: { label: "Enviada", className: "bg-success/10 text-success" },
  cancelado: { label: "Cancelada", className: "bg-secondary text-muted-foreground" },
  erro: { label: "Revisar", className: "bg-destructive/10 text-destructive" },
};

function formatarData(value?: string): string {
  if (!value) return "Data não informada";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatarDataHora(value?: string): string {
  if (!value) return "Horário não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ehFollowupWhatsappIa(item: Followup): boolean {
  return item.contexto.origem === "whatsapp_ia";
}

function followupWhatsappAutorizado(item: Followup): boolean {
  return ehFollowupWhatsappIa(item) && item.status === "pendente" && item.disparo === "automatico";
}

function aguardandoDecisao(item: Followup): boolean {
  if (ehFollowupWhatsappIa(item)) {
    return item.status === "aguardando_confirmacao" || item.status === "erro";
  }
  return ["pendente", "aguardando_confirmacao", "erro"].includes(item.status);
}

function statusDoItem(item: Followup): { label: string; className: string } {
  if (followupWhatsappAutorizado(item)) {
    return { label: "Autorizada", className: "bg-success/10 text-success" };
  }
  return statusMeta[item.status];
}

function rotuloPrazo(value?: string): string {
  const dias = Number(value);
  if (!Number.isFinite(dias)) return "";
  if (dias < 0) {
    const atraso = Math.abs(dias);
    return `${atraso} ${atraso === 1 ? "dia" : "dias"} em atraso`;
  }
  if (dias === 0) return "Prevista para hoje";
  return `Prevista em ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function AprovacoesRecompra() {
  const [aprovacoes, setAprovacoes] = useState<Followup[]>([]);
  const [janelaDias, setJanelaDias] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const carregar = useCallback(
    async (janela = janelaDias, silencioso = false) => {
      if (!silencioso) setLoading(true);
      setError("");
      try {
        const response = await fetch(`${ENDPOINT}?janelaDias=${janela}`, { cache: "no-store" });
        const data = (await response.json()) as ApiList | { ok?: false; erro?: string };
        if (!response.ok || !data.ok || !("aprovacoes" in data)) {
          throw new Error("erro" in data ? data.erro : "Não foi possível carregar as aprovações");
        }
        setAprovacoes(data.aprovacoes);
        if (data.criadas > 0) {
          toast.success(`${data.criadas} nova(s) mensagem(ns) pronta(s) para revisar`);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar aprovações");
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [janelaDias],
  );

  useEffect(() => {
    void carregar(janelaDias);
    return onCrmReload(() => void carregar(janelaDias, true));
  }, [carregar, janelaDias]);

  const pendentes = useMemo(
    () =>
      aprovacoes
        .filter(aguardandoDecisao)
        .sort(
          (a, b) =>
            (ehFollowupWhatsappIa(a)
              ? new Date(a.agendadoPara).getTime()
              : Date.now() + Number(a.contexto.diasRestantes ?? 999) * 86_400_000) -
            (ehFollowupWhatsappIa(b)
              ? new Date(b.agendadoPara).getTime()
              : Date.now() + Number(b.contexto.diasRestantes ?? 999) * 86_400_000),
        ),
    [aprovacoes],
  );
  const historico = useMemo(
    () =>
      aprovacoes
        .filter(
          (item) =>
            item.status === "enviado" ||
            item.status === "cancelado" ||
            followupWhatsappAutorizado(item),
        )
        .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)),
    [aprovacoes],
  );
  const semCadastro = useMemo(
    () => pendentes.filter((item) => item.contexto.contatoSemCadastro === true).length,
    [pendentes],
  );

  async function agir(id: string, acao: "enviar" | "cancelar", mensagem?: string) {
    if (acaoId) return;
    setAcaoId(id);
    try {
      const response = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, acao, mensagem }),
      });
      const data = (await response.json()) as ApiAction | { ok?: false; erro?: string };
      if (!response.ok || !data.ok || !("aprovacao" in data)) {
        throw new Error("erro" in data ? data.erro : "Não foi possível concluir a ação");
      }

      setAprovacoes((current) => current.map((item) => (item.id === id ? data.aprovacao : item)));
      if (data.bloqueadoPor) {
        toast.warning(`Envio cancelado automaticamente: ${data.bloqueadoPor}`);
      } else {
        toast.success(
          acao === "cancelar"
            ? "Mensagem cancelada"
            : data.agendada
              ? "Mensagem autorizada e mantida para o horário agendado"
              : "Mensagem aprovada e enviada",
        );
      }
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Falha na aprovação");
    } finally {
      setAcaoId(null);
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="size-4" /> Disparo com revisão humana
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Aprovar recompras e follow-ups</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Revise o texto e autorize somente quem deve receber. Os follow-ups do WhatsApp IA
            aguardam sua decisão aqui antes do horário agendado.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Preparar até
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={30}
                value={janelaDias}
                onChange={(event) =>
                  setJanelaDias(Math.max(0, Math.min(30, Number(event.target.value))))
                }
                className="w-24"
                aria-label="Janela de dias para aprovações"
              />
              <span className="text-sm text-muted-foreground">dias antes</span>
            </div>
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => void carregar(janelaDias)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Atualizar fila
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Clock3 className="size-4 text-primary" />}
          label="Para autorizar"
          value={pendentes.length}
        />
        <Metric
          icon={<UserRoundX className="size-4 text-amber-600" />}
          label="Sem cadastro"
          value={semCadastro}
        />
        <Metric
          icon={<CheckCircle2 className="size-4 text-success" />}
          label="Autorizadas"
          value={
            historico.filter(
              (item) => item.status === "enviado" || followupWhatsappAutorizado(item),
            ).length
          }
        />
        <Metric
          icon={<X className="size-4 text-muted-foreground" />}
          label="Canceladas"
          value={historico.filter((item) => item.status === "cancelado").length}
        />
      </section>

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Follow-ups autorizados continuam respeitando o dia e o horário escolhidos. Nas recompras,
          o CRM também confere novamente o histórico e uma compra mais recente antes de disparar.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> {error}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void carregar(janelaDias)}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Mensagens aguardando sua decisão</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {pendentes.length}
          </span>
        </div>
        {loading ? (
          <div className="grid min-h-52 place-items-center rounded-lg border border-border bg-card">
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
              Preparando a fila…
            </div>
          </div>
        ) : pendentes.length === 0 ? (
          <div className="grid min-h-52 place-items-center rounded-lg border border-dashed border-border bg-card px-4 text-center">
            <div>
              <CheckCircle2 className="mx-auto mb-2 size-8 text-success" />
              <p className="font-semibold">Tudo revisado por enquanto</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Novas recompras e follow-ups agendados no WhatsApp IA aparecerão aqui.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {pendentes.map((item) => (
              <ApprovalCard key={item.id} item={item} busy={acaoId === item.id} onAction={agir} />
            ))}
          </div>
        )}
      </section>

      {historico.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <button
            type="button"
            onClick={() => setMostrarHistorico((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/50"
            aria-expanded={mostrarHistorico}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" /> Histórico de decisões
            </span>
            <span className="text-xs text-muted-foreground">{historico.length} registro(s)</span>
          </button>
          {mostrarHistorico && (
            <div className="divide-y divide-border border-t border-border">
              {historico.slice(0, 30).map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
      <div className="grid size-9 place-items-center rounded-lg bg-secondary">{icon}</div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ApprovalCard({
  item,
  busy,
  onAction,
}: {
  item: Followup;
  busy: boolean;
  onAction: (id: string, action: "enviar" | "cancelar", mensagem?: string) => Promise<void>;
}) {
  const [mensagem, setMensagem] = useState(item.mensagem);
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => setMensagem(item.mensagem), [item.id, item.mensagem]);
  const meta = statusDoItem(item);
  const contatoSemCadastro = item.contexto.contatoSemCadastro === true;
  const whatsappIa = ehFollowupWhatsappIa(item);
  const contatoSemPrevisao = item.contexto.contatoSemPrevisao === true;

  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{item.clienteNome || item.telefone}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageCircle className="size-3.5" /> {item.telefone}
          </p>
          <span className="mt-1 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {whatsappIa ? "Follow-up do WhatsApp IA" : "Recompra"}
          </span>
        </div>
        <span
          className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-bold", meta.className)}
        >
          {meta.label}
        </span>
      </div>

      {contatoSemPrevisao && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <UserRoundX className="size-3.5 shrink-0" />
          {contatoSemCadastro
            ? "Contato do WhatsApp ainda sem cadastro completo no CRM"
            : "Contato na etapa de recompra ainda sem previsão cadastrada"}
        </div>
      )}

      {whatsappIa && (
        <div className="mt-3 space-y-2 rounded-lg bg-secondary/60 p-3 text-xs">
          <p className="flex gap-2">
            <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              <span className="block text-muted-foreground">Envio agendado</span>
              <strong>{formatarDataHora(item.agendadoPara)}</strong>
            </span>
          </p>
          {item.contexto.resumo && (
            <p>
              <span className="text-muted-foreground">Contexto:</span>{" "}
              <strong>{item.contexto.resumo}</strong>
            </p>
          )}
          {item.contexto.ultimaMensagem && (
            <p className="line-clamp-2">
              <span className="text-muted-foreground">Última mensagem:</span>{" "}
              {item.contexto.ultimaMensagem}
            </p>
          )}
        </div>
      )}

      {!whatsappIa && (
        <div className="mt-3 grid min-w-0 gap-2 rounded-lg bg-secondary/60 p-3 text-xs sm:grid-cols-2">
          {contatoSemPrevisao ? (
            <>
              <p className="flex gap-2 sm:col-span-2">
                <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  <span className="block text-muted-foreground">Última interação</span>
                  <strong>{formatarData(item.contexto.ultimaInteracao)}</strong>
                </span>
              </p>
              {item.contexto.ultimaMensagem && (
                <p className="min-w-0 sm:col-span-2">
                  <span className="text-muted-foreground">Última mensagem:</span>{" "}
                  <strong className="line-clamp-3 break-words">
                    {item.contexto.ultimaMensagem}
                  </strong>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="flex gap-2">
                <ShoppingBag className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-muted-foreground">Produto</span>
                  <strong className="line-clamp-2 break-words">
                    {item.contexto.produto || "Recompra prevista"}
                  </strong>
                </span>
              </p>
              <p className="flex gap-2">
                <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  <span className="block text-muted-foreground">Previsão</span>
                  <strong>
                    {rotuloPrazo(item.contexto.diasRestantes) ||
                      formatarData(item.contexto.dataPrevista)}
                  </strong>
                </span>
              </p>
            </>
          )}
          {item.contexto.pet && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Pet(s):</span>{" "}
              <strong>{item.contexto.pet}</strong>
            </p>
          )}
        </div>
      )}

      <label className="mt-3 flex-1 space-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Mensagem que será enviada
        </span>
        <Textarea
          value={mensagem}
          onChange={(event) => setMensagem(event.target.value)}
          rows={6}
          className="min-h-36 resize-y leading-relaxed"
        />
      </label>

      {item.status === "erro" && item.erro && (
        <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {item.erro}
        </p>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={busy || !mensagem.trim()}
          className="min-w-0 px-2 text-xs bg-success text-success-foreground hover:bg-success/90 sm:text-sm"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{" "}
          <span className="sm:hidden">Autorizar</span>
          <span className="hidden sm:inline">
            {whatsappIa ? "Autorizar agendamento" : "Autorizar e enviar"}
          </span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void onAction(item.id, "cancelar")}
          disabled={busy}
          className="min-w-0 px-2 text-xs sm:text-sm"
        >
          <X className="size-4" /> Não enviar
        </Button>
      </div>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Autorizar esta mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {whatsappIa
                ? `Ela ficará autorizada para envio em ${formatarDataHora(item.agendadoPara)}.`
                : `Ela será enviada agora para ${item.clienteNome || item.telefone}. O CRM ainda fará a verificação final de conversa e nova compra.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary p-3 text-sm">
            {mensagem}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void onAction(item.id, "enviar", mensagem)}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {whatsappIa ? "Confirmar autorização" : "Confirmar envio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function HistoryRow({ item }: { item: Followup }) {
  const meta = statusDoItem(item);
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.clienteNome || item.telefone}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ehFollowupWhatsappIa(item)
            ? `Follow-up para ${formatarDataHora(item.agendadoPara)} · ${item.mensagem}`
            : item.contexto.produto || item.mensagem}
        </p>
        {item.status === "cancelado" && item.erro && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.erro}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", meta.className)}>
          {meta.label}
        </span>
        <time className="text-xs text-muted-foreground">{formatarData(item.atualizadoEm)}</time>
      </div>
    </div>
  );
}
