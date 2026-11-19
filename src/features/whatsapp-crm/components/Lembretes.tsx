import { useState } from "react";
import {
  Bell,
  Check,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  lembreteInputSchema,
  resumirLembretes,
  type Lembrete,
  type LembreteInput,
} from "@/lib/lembretes";
import { useLembretes } from "../hooks/useLembretes";
import type { ContatoCalendario } from "./CalendarioContatos";
import { SelecionarContato } from "./SelecionarContato";

type Agenda = ReturnType<typeof useLembretes>;
const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

function LembreteForm({
  dia,
  item,
  contatos,
  agenda,
  onFechar,
}: {
  dia: string;
  item?: Lembrete;
  contatos: ContatoCalendario[];
  agenda: Agenda;
  onFechar: () => void;
}) {
  const [input, setInput] = useState<LembreteInput>(
    item ?? { dia, clienteNome: "", telefone: "", anotacao: "Enviar mensagem pelo WhatsApp" },
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar(event: React.FormEvent) {
    event.preventDefault();
    const parsed = lembreteInputSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSalvando(true);
    try {
      await agenda.salvar(parsed.data, item?.id);
      toast.success(item ? "Lembrete atualizado" : "Lembrete criado");
      onFechar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-slate-900 dark:bg-amber-950/30 dark:text-foreground"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold">
          <StickyNote className="size-4" />
          {item ? "Editar lembrete" : "Novo lembrete"}
        </h4>
        <button type="button" aria-label="Fechar formulário" onClick={onFechar} disabled={salvando}>
          <X className="size-4" />
        </button>
      </div>
      <fieldset disabled={salvando} className="space-y-3 disabled:opacity-60">
        <SelecionarContato
          contatos={contatos}
          value={
            input.clienteNome || input.telefone
              ? { cliente: input.clienteNome, telefone: input.telefone }
              : null
          }
          onChange={(contato) =>
            setInput((atual) => ({
              ...atual,
              clienteNome: contato?.cliente ?? "",
              telefone: contato?.telefone ?? "",
            }))
          }
          permitirManual
        />
        <label className="block text-xs font-medium">
          Dia
          <input
            required
            type="date"
            value={input.dia}
            onChange={(e) => setInput({ ...input, dia: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block text-xs font-medium">
          O que precisa fazer?
          <textarea
            required
            maxLength={2000}
            rows={3}
            value={input.anotacao}
            onChange={(e) => setInput({ ...input, anotacao: e.target.value })}
            className={`${inputClass} resize-y`}
            placeholder="Ex.: Mandar mensagem para confirmar a entrega"
          />
        </label>
        <p className="text-[11px] opacity-70">
          Você verá este lembrete no dashboard no dia escolhido.
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-xs font-semibold text-background"
          >
            {salvando && <Loader2 className="size-3 animate-spin" />}Salvar lembrete
          </button>
          <button type="button" onClick={onFechar} className="px-2 text-xs">
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function PostIt({
  item,
  agenda,
  onEditar,
  onAbrir,
}: {
  item: Lembrete;
  agenda: Agenda;
  onEditar?: () => void;
  onAbrir?: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  async function executar(acao: () => Promise<void>, mensagem: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(mensagem);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar");
    } finally {
      setOcupado(false);
    }
  }
  const atrasado = !item.concluido && item.dia < agenda.hoje;
  return (
    <article
      className={`min-w-0 rounded-xl border p-4 shadow-sm ${item.concluido ? "border-border bg-secondary/50" : "border-amber-300/60 bg-amber-50 text-slate-900 dark:bg-amber-950/30 dark:text-foreground"}`}
    >
      <div className="flex items-start gap-2">
        <StickyNote className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <h4 className="break-words text-sm font-bold">{item.clienteNome}</h4>
          <p className="text-[11px] opacity-65">{item.telefone}</p>
        </div>
        {onEditar && (
          <button
            disabled={ocupado}
            type="button"
            onClick={onEditar}
            aria-label={`Editar lembrete de ${item.clienteNome}`}
            className="rounded p-1 hover:bg-black/5"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      <p
        className={`mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed ${item.concluido ? "line-through opacity-60" : ""}`}
      >
        {item.anotacao}
      </p>
      <p
        className={`mt-3 text-[11px] font-semibold ${atrasado ? "text-destructive" : "opacity-70"}`}
      >
        {item.concluido ? "Concluído" : atrasado ? "Atrasado" : "Pendente"} · {dataBr(item.dia)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() =>
            void executar(
              () => agenda.concluir(item),
              item.concluido ? "Lembrete reaberto" : "Lembrete concluído",
            )
          }
          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs font-semibold text-background disabled:opacity-50"
        >
          {ocupado ? (
            <Loader2 className="size-3 animate-spin" />
          ) : item.concluido ? (
            <RotateCcw className="size-3" />
          ) : (
            <Check className="size-3" />
          )}
          {item.concluido ? "Reabrir" : "Concluir"}
        </button>
        {onAbrir ? (
          <button
            type="button"
            onClick={onAbrir}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold"
          >
            <MessageCircle className="size-3" />
            Conversa
          </button>
        ) : (
          <a
            href={`/conversas?telefone=${encodeURIComponent(item.telefone)}&cliente=${encodeURIComponent(item.clienteNome)}`}
            className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold"
          >
            <MessageCircle className="size-3" />
            Conversa
          </a>
        )}
        {onEditar && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => setExcluindo(true)}
            aria-label={`Excluir lembrete de ${item.clienteNome}`}
            className="ml-auto rounded p-1.5 hover:bg-black/5"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      {excluindo && (
        <div className="mt-3 border-t border-amber-300/50 pt-3 text-xs">
          <p>Excluir este lembrete?</p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void executar(() => agenda.excluir(item.id), "Lembrete excluído")}
              className="font-semibold text-destructive"
            >
              Excluir
            </button>
            <button type="button" disabled={ocupado} onClick={() => setExcluindo(false)}>
              Manter
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function EstadoLembretes({ agenda }: { agenda: Agenda }) {
  if (agenda.erro)
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-xs">
        <p>{agenda.erro}</p>
        <button
          type="button"
          onClick={() => void agenda.carregar()}
          className="mt-2 font-semibold underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  if (agenda.carregando)
    return (
      <p role="status" className="flex items-center gap-2 py-5 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando lembretes...
      </p>
    );
  return null;
}

export function LembretesDoDia({
  dia,
  contatos,
  agenda,
  onAbrir,
}: {
  dia: string;
  contatos: ContatoCalendario[];
  agenda: Agenda;
  onAbrir: (telefone: string) => void;
}) {
  const [form, setForm] = useState<Lembrete | "novo" | null>(null);
  const itens = agenda.lembretes
    .filter((item) => item.dia === dia)
    .sort((a, b) => Number(a.concluido) - Number(b.concluido));
  return (
    <div className="space-y-3 px-4 py-3 sm:px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      {form ? (
        <LembreteForm
          key={form === "novo" ? "novo" : form.id}
          dia={dia}
          item={form === "novo" ? undefined : form}
          contatos={contatos}
          agenda={agenda}
          onFechar={() => setForm(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setForm("novo")}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-200 text-sm font-semibold text-amber-950 hover:bg-amber-300"
        >
          <Plus className="size-4" />
          Novo lembrete
        </button>
      )}
      <EstadoLembretes agenda={agenda} />
      {!agenda.carregando && !agenda.erro && itens.length === 0 && !form && (
        <div className="py-8 text-center text-muted-foreground">
          <StickyNote className="mx-auto mb-2 size-8 opacity-50" />
          <p className="text-sm font-semibold">Nenhum lembrete neste dia</p>
          <p className="mt-1 text-xs">Anote quem você precisa chamar e o que fazer.</p>
        </div>
      )}
      {itens.map((item) => (
        <PostIt
          key={item.id}
          item={item}
          agenda={agenda}
          onEditar={() => setForm(item)}
          onAbrir={() => onAbrir(item.telefone)}
        />
      ))}
    </div>
  );
}

export function LembretesDashboard() {
  const agenda = useLembretes();
  const resumo = resumirLembretes(agenda.lembretes, agenda.hoje);
  return (
    <section
      className="card-soft grid gap-4 p-4 sm:p-5 lg:grid-cols-[220px_minmax(0,1fr)]"
      aria-label="Lembretes do dia"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-col lg:justify-start">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Bell className="size-4 text-amber-600" />
            Lembretes de hoje
            {resumo.doDia.length > 0 && (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-950">
                {resumo.doDia.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {resumo.doDia.length > 0
              ? `${resumo.doDia.length} tarefa${resumo.doDia.length === 1 ? "" : "s"} para ${resumo.clientesHoje} cliente${resumo.clientesHoje === 1 ? "" : "s"} hoje`
              : "Seus compromissos com os clientes"}
          </p>
        </div>
        <a
          href="/conversas?aba=calendario"
          className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"
        >
          Abrir calendário
        </a>
      </div>
      <div className="min-w-0">
        <EstadoLembretes agenda={agenda} />
        {!agenda.carregando && !agenda.erro && resumo.doDia.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Nenhuma tarefa pendente para hoje.</p>
        )}
        {resumo.doDia.length > 0 && (
          <div className="grid max-h-96 gap-3 overflow-y-auto 2xl:grid-cols-2">
            {resumo.doDia.map((item) => (
              <PostIt key={item.id} item={item} agenda={agenda} />
            ))}
          </div>
        )}
        {resumo.atrasados.length > 0 && (
          <details className="mt-3 rounded-xl border border-destructive/20 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-destructive">
              {resumo.atrasados.length} lembrete
              {resumo.atrasados.length === 1 ? " atrasado" : "s atrasados"}
            </summary>
            <div className="mt-3 grid max-h-96 gap-3 overflow-y-auto 2xl:grid-cols-2">
              {resumo.atrasados.map((item) => (
                <PostIt key={item.id} item={item} agenda={agenda} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
