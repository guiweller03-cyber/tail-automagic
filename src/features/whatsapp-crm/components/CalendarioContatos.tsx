import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  StickyNote,
} from "lucide-react";
import { conversaCorrespondeBusca } from "@/lib/conversa-search";
import type { ContatoDoDia } from "@/lib/calendario-contatos";
import { hojeLembretes } from "@/lib/lembretes";
import { useLembretes } from "../hooks/useLembretes";
import { LembretesDoDia } from "./Lembretes";
import { SelecionarContato } from "./SelecionarContato";

type FollowupStatus = "pendente" | "aguardando_confirmacao" | "enviado" | "cancelado" | "erro";

type Agendamento = {
  id: string;
  telefone: string;
  clienteNome: string;
  agendadoPara: string;
  disparo: "automatico" | "confirmar";
  mensagem: string;
  status: FollowupStatus;
  erro?: string;
  contexto?: { origem?: string };
};

export type ContatoCalendario = { id: string; cliente: string; telefone: string };

const FOLLOWUPS = "/api/crm/followups";
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const STATUS_LABEL: Record<FollowupStatus, { label: string; tone: string }> = {
  pendente: { label: "Agendado", tone: "bg-accent/15 text-accent" },
  aguardando_confirmacao: { label: "Aguardando você", tone: "bg-accent text-accent-foreground" },
  enviado: { label: "Enviado", tone: "bg-success/15 text-success" },
  cancelado: { label: "Cancelado", tone: "bg-muted text-muted-foreground" },
  erro: { label: "Falhou", tone: "bg-destructive/15 text-destructive" },
};

// Intensidade do mapa de calor: quanto mais leads no dia, mais forte o verde-agua.
const NIVEIS_CALOR = [
  "bg-secondary/60 text-muted-foreground",
  "bg-primary/15 text-foreground",
  "bg-primary/30 text-foreground",
  "bg-primary/55 text-foreground",
  "bg-primary text-primary-foreground",
];

const pad = (n: number) => String(n).padStart(2, "0");

function chaveDia(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function chaveMes(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function hora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarTelefone(telefone: string): string {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0 || /^\(?\d/.test(nome)) return "#";
  return (
    (partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")
  ).toUpperCase();
}

function nivelCalor(leads: number, maximo: number): number {
  if (leads <= 0 || maximo <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((leads / maximo) * 4)));
}

/** Semanas (domingo a sabado) que cobrem o mes, com dias do mes vizinho como null. */
function gradeDoMes(mes: Date): Array<Date | null> {
  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celulas: Array<Date | null> = Array.from({ length: primeiro.getDay() }, () => null);
  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    celulas.push(new Date(mes.getFullYear(), mes.getMonth(), dia));
  }
  while (celulas.length % 7 !== 0) celulas.push(null);
  return celulas;
}

export function CalendarioContatos({
  conversas,
  contatosLembretes = conversas,
  onOpenConversation,
}: {
  conversas: ContatoCalendario[];
  contatosLembretes?: ContatoCalendario[];
  onOpenConversation: (conversaId: string, telefone: string) => void;
}) {
  const [mes, setMes] = useState(() => {
    const [ano, numeroMes] = hojeLembretes().split("-").map(Number);
    return new Date(ano, numeroMes - 1, 1);
  });
  const agenda = useLembretes(chaveMes(mes));
  const hoje = agenda.hoje;
  const [diaSelecionado, setDiaSelecionado] = useState(hoje);
  const [contatos, setContatos] = useState<ContatoDoDia[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"lembretes" | "mensagens" | "agendados">("lembretes");
  const [formAberto, setFormAberto] = useState(false);
  const [acaoId, setAcaoId] = useState<string | null>(null);

  const carregar = useCallback(async (alvo: Date, signal?: AbortSignal) => {
    setCarregando(true);
    const inicio = new Date(alvo.getFullYear(), alvo.getMonth(), 1);
    const fim = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 1);
    try {
      const [resContatos, resAgendados] = await Promise.all([
        fetch(`/api/crm/conversas?calendario=${chaveMes(alvo)}`, { cache: "no-store", signal }),
        fetch(
          `${FOLLOWUPS}?de=${encodeURIComponent(inicio.toISOString())}&ate=${encodeURIComponent(
            fim.toISOString(),
          )}`,
          { cache: "no-store", signal },
        ),
      ]);
      const dadosContatos = (await resContatos.json()) as ContatoDoDia[] | { erro?: string };
      const dadosAgendados = (await resAgendados.json()) as Agendamento[] | { erro?: string };
      if (!Array.isArray(dadosContatos)) {
        throw new Error(dadosContatos?.erro || "Não foi possível carregar o calendário");
      }
      setContatos(dadosContatos);
      setAgendamentos(
        Array.isArray(dadosAgendados) ? dadosAgendados.filter((a) => a.status !== "cancelado") : [],
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(
        error instanceof Error ? error.message : "Não foi possível carregar o calendário",
      );
    } finally {
      if (!signal?.aborted) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void carregar(mes, controller.signal);
    return () => controller.abort();
  }, [carregar, mes]);

  const contatosPorDia = useMemo(() => {
    const mapa = new Map<string, ContatoDoDia[]>();
    for (const contato of contatos) {
      const lista = mapa.get(contato.dia) ?? [];
      lista.push(contato);
      mapa.set(contato.dia, lista);
    }
    return mapa;
  }, [contatos]);

  const agendamentosPorDia = useMemo(() => {
    const mapa = new Map<string, Agendamento[]>();
    for (const agendamento of agendamentos) {
      const dia = chaveDia(new Date(agendamento.agendadoPara));
      const lista = mapa.get(dia) ?? [];
      lista.push(agendamento);
      mapa.set(dia, lista);
    }
    return mapa;
  }, [agendamentos]);

  const nomePorTelefone = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const conversa of conversas) {
      if (conversa.cliente) mapa.set(conversa.telefone.replace(/\D/g, ""), conversa.cliente);
    }
    return mapa;
  }, [conversas]);

  const maximoLeads = useMemo(
    () => Math.max(0, ...[...contatosPorDia.values()].map((lista) => lista.length)),
    [contatosPorDia],
  );
  const leadsNoMes = useMemo(() => new Set(contatos.map((c) => c.telefone)).size, [contatos]);

  const nomeDoContato = (contato: { nome?: string; telefone: string }) =>
    contato.nome ||
    nomePorTelefone.get(contato.telefone.replace(/\D/g, "")) ||
    formatarTelefone(contato.telefone);

  const contatosDoDia = contatosPorDia.get(diaSelecionado) ?? [];
  const contatosFiltrados = contatosDoDia.filter((contato) =>
    conversaCorrespondeBusca(
      {
        cliente: contato.nome || nomePorTelefone.get(contato.telefone.replace(/\D/g, "")) || "",
        telefone: contato.telefone,
      },
      busca,
    ),
  );
  const agendamentosDoDia = [...(agendamentosPorDia.get(diaSelecionado) ?? [])].sort((a, b) =>
    a.agendadoPara.localeCompare(b.agendadoPara),
  );
  const lembretesPorDia = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const item of agenda.lembretes) {
      if (!item.concluido) mapa.set(item.dia, (mapa.get(item.dia) ?? 0) + 1);
    }
    return mapa;
  }, [agenda.lembretes]);

  function selecionarDia(chave: string) {
    setDiaSelecionado(chave);
    setBusca("");
    setFormAberto(false);
  }

  function mudarMes(delta: number) {
    const novo = new Date(mes.getFullYear(), mes.getMonth() + delta, 1);
    setMes(novo);
    selecionarDia(chaveMes(novo) === hoje.slice(0, 7) ? hoje : chaveDia(novo));
  }

  function irParaHoje() {
    const [ano, numeroMes] = hoje.split("-").map(Number);
    setMes(new Date(ano, numeroMes - 1, 1));
    selecionarDia(hoje);
  }

  function abrirConversa(telefone: string, conversaId?: string) {
    const digitos = telefone.replace(/\D/g, "");
    const conversa =
      conversas.find((item) => item.id === conversaId) ??
      conversas.find((item) => item.telefone.replace(/\D/g, "") === digitos);
    onOpenConversation(conversa?.id ?? conversaId ?? "", digitos);
  }

  async function acao(agendamento: Agendamento, tipo: "enviar" | "cancelar") {
    setAcaoId(agendamento.id);
    try {
      const res = await fetch(FOLLOWUPS, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: agendamento.id, acao: tipo }),
      });
      const data = (await res.json()) as Agendamento & { erro?: string };
      if (!res.ok) throw new Error(data?.erro || "Não foi possível concluir");
      setAgendamentos((atual) =>
        tipo === "cancelar"
          ? atual.filter((item) => item.id !== agendamento.id)
          : atual.map((item) => (item.id === agendamento.id ? { ...item, ...data } : item)),
      );
      toast.success(tipo === "cancelar" ? "Agendamento cancelado" : "Mensagem enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir");
    } finally {
      setAcaoId(null);
    }
  }

  const nomeMes = mes.toLocaleDateString("pt-BR", { month: "long" });
  const [ano, mesNum, diaNum] = diaSelecionado.split("-").map(Number);
  const dataSelecionada = new Date(ano, mesNum - 1, diaNum);
  const diaSemanaBruto = dataSelecionada.toLocaleDateString("pt-BR", { weekday: "long" });
  const diaSemana = diaSemanaBruto.charAt(0).toUpperCase() + diaSemanaBruto.slice(1);
  const diaPorExtenso = dataSelecionada.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:grid lg:overflow-visible lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)]">
      {/* Mes */}
      <section className="card-soft flex shrink-0 flex-col p-4 sm:p-5 lg:min-h-0 lg:overflow-y-auto">
        <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold capitalize leading-none tracking-tight sm:text-3xl">
              {nomeMes}
              <span className="ml-2 font-semibold text-muted-foreground">{mes.getFullYear()}</span>
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {carregando ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Carregando o mês
                </span>
              ) : (
                <>
                  <strong className="font-semibold text-foreground">{leadsNoMes}</strong>{" "}
                  {leadsNoMes === 1 ? "pessoa mandou" : "pessoas mandaram"} mensagem
                  {agendamentos.length > 0 && (
                    <>
                      {" "}
                      e <strong className="font-semibold text-accent">
                        {agendamentos.length}
                      </strong>{" "}
                      {agendamentos.length === 1 ? "envio agendado" : "envios agendados"}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                void carregar(mes);
                void agenda.carregar();
              }}
              className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Atualizar calendário"
              title="Atualizar"
            >
              <RefreshCw className={`size-4 ${carregando ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={irParaHoje}
              className="h-9 rounded-xl border border-border px-3 text-xs font-semibold hover:bg-secondary"
            >
              Hoje
            </button>
            <div className="flex rounded-xl border border-border">
              <button
                type="button"
                onClick={() => mudarMes(-1)}
                className="grid size-9 place-items-center rounded-l-xl hover:bg-secondary"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => mudarMes(1)}
                className="grid size-9 place-items-center rounded-r-xl border-l border-border hover:bg-secondary"
                aria-label="Próximo mês"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-xs font-medium text-muted-foreground">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia}>{dia}</div>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-[minmax(4rem,1fr)] grid-cols-7 gap-1.5 sm:auto-rows-[minmax(5.25rem,1fr)]">
          {gradeDoMes(mes).map((data, index) => {
            if (!data) return <div key={`vazio-${index}`} />;
            const chave = chaveDia(data);
            const leads = contatosPorDia.get(chave)?.length ?? 0;
            const agendados = agendamentosPorDia.get(chave)?.length ?? 0;
            const lembretes = lembretesPorDia.get(chave) ?? 0;
            const selecionado = chave === diaSelecionado;
            const ehHoje = chave === hoje;
            const futuro = chave > hoje;
            const nivel = nivelCalor(leads, maximoLeads);
            return (
              <button
                key={chave}
                type="button"
                onClick={() => selecionarDia(chave)}
                aria-pressed={selecionado}
                aria-label={`${data.getDate()}: ${leads} leads, ${agendados} agendados, ${lembretes} lembretes pendentes`}
                className={`relative flex flex-col justify-between rounded-xl p-1.5 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring sm:p-2.5 ${
                  futuro && leads === 0
                    ? "bg-secondary/35 text-muted-foreground"
                    : NIVEIS_CALOR[nivel]
                } ${
                  selecionado
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    : "hover:ring-1 hover:ring-foreground/25"
                }`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={`text-xs font-semibold sm:text-sm ${
                      ehHoje
                        ? "grid size-6 place-items-center rounded-full bg-foreground text-background"
                        : ""
                    }`}
                  >
                    {data.getDate()}
                  </span>
                  {agendados > 0 && (
                    <>
                      <span className="absolute right-1 top-1 size-2 rounded-full bg-accent sm:hidden" />
                      <span
                        className="hidden items-center gap-0.5 rounded-full bg-accent px-1.5 py-px text-[10px] font-bold text-accent-foreground sm:inline-flex"
                        title={`${agendados} envio(s) agendado(s)`}
                      >
                        <CalendarClock className="size-2.5" />
                        {agendados}
                      </span>
                    </>
                  )}
                </span>
                {lembretes > 0 && (
                  <span
                    className="mt-1 inline-flex w-fit items-center gap-1 rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-950"
                    title={`${lembretes} lembrete(s) pendente(s)`}
                  >
                    <StickyNote className="size-3" />
                    {lembretes}
                  </span>
                )}
                {leads > 0 && (
                  <span className="leading-none">
                    <span className="block text-base font-extrabold tabular-nums sm:text-2xl">
                      {leads}
                    </span>
                    <span className="hidden text-[10px] font-medium opacity-75 sm:block">
                      {leads === 1 ? "lead" : "leads"}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          menos
          {NIVEIS_CALOR.map((classe, index) => (
            <span key={index} className={`size-3 rounded ${classe.split(" ")[0]}`} />
          ))}
          mais leads
        </div>
      </section>

      {/* Dia */}
      <aside className="card-soft flex min-h-[28rem] shrink-0 flex-col lg:min-h-0 lg:overflow-hidden">
        <div className="border-b border-border px-4 pb-3 pt-4 sm:px-5">
          <p className="text-xs font-medium text-muted-foreground">{diaSemana}</p>
          <h3 className="text-xl font-extrabold tracking-tight">{diaPorExtenso}</h3>

          <div className="mt-3 grid grid-cols-3 rounded-xl bg-secondary p-1" role="tablist">
            {(
              [
                ["lembretes", "Lembretes", lembretesPorDia.get(diaSelecionado) ?? 0],
                ["mensagens", "Mensagens", contatosDoDia.length],
                ["agendados", "Agendados", agendamentosDoDia.length],
              ] as const
            ).map(([id, rotulo, total]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => setAba(id)}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${
                  aba === id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {rotulo}
                <span
                  className={`min-w-5 rounded-full px-1.5 text-[10px] tabular-nums ${
                    id === "agendados"
                      ? "bg-accent/15 text-accent"
                      : "bg-primary/20 text-foreground"
                  }`}
                >
                  {total}
                </span>
              </button>
            ))}
          </div>
        </div>

        {aba === "lembretes" ? (
          <LembretesDoDia
            key={diaSelecionado}
            dia={diaSelecionado}
            contatos={contatosLembretes}
            agenda={agenda}
            onAbrir={abrirConversa}
          />
        ) : aba === "mensagens" ? (
          <div className="flex flex-col lg:min-h-0 lg:flex-1">
            <div className="px-4 pt-3 sm:px-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por nome ou telefone"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="px-2 py-2 sm:px-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {contatosDoDia.length === 0 ? (
                <Vazio
                  titulo={carregando ? "Carregando..." : "Ninguém mandou mensagem neste dia"}
                  texto={
                    carregando ? "" : "Escolha um dia pintado no calendário para ver quem chamou."
                  }
                />
              ) : contatosFiltrados.length === 0 ? (
                <Vazio
                  titulo="Nenhum contato encontrado"
                  texto={`Ninguém com "${busca}" mandou mensagem neste dia.`}
                />
              ) : (
                <ul>
                  {contatosFiltrados.map((contato) => {
                    const nome = nomeDoContato(contato);
                    return (
                      <li key={contato.conversaId}>
                        <button
                          type="button"
                          onClick={() => abrirConversa(contato.telefone, contato.conversaId)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left outline-none hover:bg-secondary focus-visible:bg-secondary"
                          title="Abrir no WhatsApp IA"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-bold text-foreground">
                            {iniciais(nome)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                {nome}
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {hora(contato.ultima)}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {contato.ultimaMensagem || formatarTelefone(contato.telefone)}
                              </span>
                              {contato.mensagens > 1 && (
                                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                                  {contato.mensagens}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col px-4 py-3 sm:px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {formAberto ? (
              <AgendarForm
                dia={diaSelecionado}
                conversas={conversas}
                onCancelar={() => setFormAberto(false)}
                onCriado={(novo) => {
                  setAgendamentos((atual) => [...atual, novo]);
                  setFormAberto(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setFormAberto(true)}
                className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent/90"
              >
                <Plus className="size-4" /> Agendar mensagem
              </button>
            )}

            {agendamentosDoDia.length === 0 && !formAberto ? (
              <Vazio
                titulo="Nada agendado"
                texto="Agende uma mensagem e ela aparece aqui e no calendário."
              />
            ) : (
              <ol className="mt-4 space-y-0">
                {agendamentosDoDia.map((agendamento, index) => {
                  const status = STATUS_LABEL[agendamento.status] ?? STATUS_LABEL.pendente;
                  const daIa = agendamento.contexto?.origem === "whatsapp_ia";
                  const podeEnviar =
                    !daIa &&
                    (agendamento.status === "pendente" ||
                      agendamento.status === "aguardando_confirmacao" ||
                      agendamento.status === "erro");
                  const ocupado = acaoId === agendamento.id;
                  const ultimo = index === agendamentosDoDia.length - 1;
                  return (
                    <li key={agendamento.id} className="grid grid-cols-[3.25rem_1fr] gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-bold tabular-nums">
                          {hora(agendamento.agendadoPara)}
                        </span>
                        <span
                          className={`mt-1 size-2.5 rounded-full ${
                            agendamento.status === "enviado" ? "bg-success" : "bg-accent"
                          }`}
                        />
                        {!ultimo && <span className="w-px flex-1 bg-border" />}
                      </div>
                      <div className="pb-5">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => abrirConversa(agendamento.telefone)}
                            className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline"
                          >
                            {agendamento.clienteNome || formatarTelefone(agendamento.telefone)}
                          </button>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        {agendamento.mensagem && (
                          <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap rounded-xl rounded-tl-sm bg-secondary px-3 py-2 text-xs leading-relaxed">
                            {agendamento.mensagem}
                          </p>
                        )}
                        {agendamento.status === "erro" && agendamento.erro && (
                          <p className="mt-1 text-[11px] text-destructive">{agendamento.erro}</p>
                        )}
                        {daIa && agendamento.status === "aguardando_confirmacao" && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Aprove na aba Aprovar Recompras.
                          </p>
                        )}
                        {agendamento.status !== "enviado" && (
                          <div className="mt-2 flex gap-1.5">
                            {podeEnviar && (
                              <button
                                type="button"
                                disabled={ocupado}
                                onClick={() => void acao(agendamento, "enviar")}
                                className="inline-flex h-7 items-center gap-1 rounded-lg bg-foreground px-2.5 text-[11px] font-semibold text-background hover:bg-foreground/85 disabled:opacity-50"
                              >
                                <Send className="size-3" /> Enviar agora
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => void acao(agendamento, "cancelar")}
                              className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                        {agendamento.status === "enviado" && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-success">
                            <Check className="size-3" /> Entregue ao WhatsApp
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-semibold">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-60 text-xs text-muted-foreground">{texto}</p>}
    </div>
  );
}

function AgendarForm({
  dia,
  conversas,
  onCriado,
  onCancelar,
}: {
  dia: string;
  conversas: ContatoCalendario[];
  onCriado: (agendamento: Agendamento) => void;
  onCancelar: () => void;
}) {
  const [contato, setContato] = useState<ContatoCalendario | null>(null);
  const [horario, setHorario] = useState("09:00");
  const [mensagem, setMensagem] = useState("");
  const [disparo, setDisparo] = useState<"automatico" | "confirmar">("automatico");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!contato) {
      toast.error("Escolha o cliente");
      return;
    }
    if (!mensagem.trim()) {
      toast.error("Escreva a mensagem");
      return;
    }
    const quando = new Date(`${dia}T${horario}`);
    if (Number.isNaN(quando.getTime())) {
      toast.error("Horário inválido");
      return;
    }
    if (disparo === "automatico" && quando.getTime() < Date.now()) {
      toast.error("Esse horário já passou");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(FOLLOWUPS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telefone: contato.telefone,
          clienteNome: contato.cliente,
          agendadoPara: quando.toISOString(),
          modo: "manual",
          disparo,
          mensagem: mensagem.trim(),
          contexto: {
            nome: contato.cliente,
            origem: "geral",
            objetivo: "Mensagem agendada pelo calendário do WhatsApp IA",
            conversaId: contato.id,
          },
        }),
      });
      const data = (await res.json()) as Agendamento & { erro?: string };
      if (!res.ok) throw new Error(data?.erro || "Não foi possível agendar");
      onCriado(data);
      toast.success(
        disparo === "automatico"
          ? "Mensagem agendada. Ela sai sozinha no horário."
          : "Mensagem agendada. No horário ela fica esperando você enviar.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível agendar");
    } finally {
      setSalvando(false);
    }
  }

  const rotulo = "mb-1 block text-xs font-semibold text-muted-foreground";
  const campo =
    "w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <div className="space-y-3 rounded-2xl border border-accent/40 bg-accent/5 p-3">
      <fieldset disabled={salvando}>
        <SelecionarContato
          contatos={conversas}
          value={contato}
          onChange={(selecionado) =>
            setContato(selecionado ? { ...selecionado, id: selecionado.id ?? "" } : null)
          }
        />
      </fieldset>

      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <label>
          <span className={rotulo}>Horário</span>
          <input
            type="time"
            value={horario}
            onChange={(event) => setHorario(event.target.value)}
            className={`${campo} h-10`}
          />
        </label>
        <div>
          <span className={rotulo}>Como enviar</span>
          <div className="grid h-10 grid-cols-2 rounded-xl border border-border bg-background p-1">
            {(
              [
                ["automatico", "Sozinho"],
                ["confirmar", "Eu confirmo"],
              ] as const
            ).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setDisparo(valor)}
                aria-pressed={disparo === valor}
                className={`rounded-lg text-xs font-semibold ${
                  disparo === valor
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block">
        <span className={rotulo}>Mensagem</span>
        <textarea
          value={mensagem}
          onChange={(event) => setMensagem(event.target.value)}
          rows={4}
          placeholder="Oi! Passando para lembrar que..."
          className={`${campo} resize-y py-2.5`}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="h-10 rounded-xl px-4 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Voltar
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => void salvar()}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          {salvando ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CalendarClock className="size-4" />
          )}
          Agendar mensagem
        </button>
      </div>
    </div>
  );
}
