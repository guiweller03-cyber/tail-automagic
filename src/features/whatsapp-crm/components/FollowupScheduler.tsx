import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Sparkles,
  Pencil,
  Send,
  X,
  Check,
  Bot,
  Clock,
  AlertTriangle,
  Plus,
} from "lucide-react";

type FollowupModo = "manual" | "ia";
type FollowupDisparo = "automatico" | "confirmar";
type FollowupStatus = "pendente" | "aguardando_confirmacao" | "enviado" | "cancelado" | "erro";

type Followup = {
  id: string;
  telefone: string;
  clienteNome: string;
  agendadoPara: string;
  modo: FollowupModo;
  disparo: FollowupDisparo;
  mensagem: string;
  canal: string;
  status: FollowupStatus;
  erro?: string;
  enviadoEm?: string;
};

export type FollowupContextoInput = {
  nome?: string;
  pet?: string;
  ultimaInteracao?: string;
  ultimaMensagem?: string;
  resumo?: string;
};

const ENDPOINT = "/api/crm/followups";

function localParaISO(value: string): string {
  // value vem do input datetime-local ("YYYY-MM-DDTHH:mm"), interpretado no
  // fuso do operador. new Date(...) usa o fuso local -> toISOString() converte
  // para UTC, que e o que guardamos e comparamos no servidor.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function isoParaLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultDateTimeLocal(): string {
  // Amanha as 09:00 como sugestao inicial.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

const STATUS_META: Record<FollowupStatus, { label: string; tone: string; icon: React.ReactNode }> =
  {
    pendente: {
      label: "Agendado",
      tone: "bg-primary/15 text-primary",
      icon: <Clock className="size-3" />,
    },
    aguardando_confirmacao: {
      label: "Pronto p/ enviar",
      tone: "bg-accent/20 text-accent",
      icon: <AlertTriangle className="size-3" />,
    },
    enviado: {
      label: "Enviado",
      tone: "bg-success/20 text-success",
      icon: <Check className="size-3" />,
    },
    cancelado: {
      label: "Cancelado",
      tone: "bg-muted text-muted-foreground",
      icon: <X className="size-3" />,
    },
    erro: {
      label: "Erro",
      tone: "bg-destructive/15 text-destructive",
      icon: <AlertTriangle className="size-3" />,
    },
  };

export function FollowupScheduler({
  telefone,
  nome,
  contexto,
}: {
  telefone: string;
  nome: string;
  contexto?: FollowupContextoInput;
}) {
  const [lista, setLista] = useState<Followup[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);

  const [quando, setQuando] = useState(defaultDateTimeLocal);
  const [modo, setModo] = useState<FollowupModo>("manual");
  const [disparo, setDisparo] = useState<FollowupDisparo>("confirmar");
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [acaoId, setAcaoId] = useState<string | null>(null);

  const telefoneDigits = useMemo(() => telefone.replace(/\D/g, ""), [telefone]);

  const carregar = useCallback(async () => {
    if (!telefoneDigits) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const res = await fetch(`${ENDPOINT}?telefone=${encodeURIComponent(telefoneDigits)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as Followup[] | { erro?: string };
      if (Array.isArray(data)) setLista(data);
      else if (data?.erro) toast.error(data.erro);
    } catch {
      // silencioso: a aba ainda funciona sem a lista
    } finally {
      setCarregando(false);
    }
  }, [telefoneDigits]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function agendar() {
    if (!telefoneDigits) {
      toast.error("Lead sem telefone valido");
      return;
    }
    const iso = localParaISO(quando);
    if (!iso) {
      toast.error("Escolha uma data e hora validas");
      return;
    }
    if (modo === "manual" && !mensagem.trim()) {
      toast.error("Escreva a mensagem ou deixe a IA gerar");
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telefone: telefoneDigits,
          clienteNome: nome,
          agendadoPara: iso,
          modo,
          disparo,
          mensagem: modo === "manual" ? mensagem.trim() : "",
          contexto: { ...contexto, nome: contexto?.nome ?? nome },
        }),
      });
      const data = (await res.json()) as Followup & { erro?: string };
      if (!res.ok) throw new Error(data?.erro || "Falha ao agendar");
      setLista((prev) =>
        [...prev, data].sort((a, b) => a.agendadoPara.localeCompare(b.agendadoPara)),
      );
      setMensagem("");
      setQuando(defaultDateTimeLocal());
      setAberto(false);
      toast.success(
        disparo === "automatico"
          ? "Follow-up agendado — vai disparar sozinho no horario ⏰"
          : "Follow-up agendado — vai ficar pronto pra você confirmar ⏰",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao agendar");
    } finally {
      setSalvando(false);
    }
  }

  async function acao(id: string, acaoTipo: "enviar" | "cancelar") {
    setAcaoId(id);
    try {
      const res = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, acao: acaoTipo }),
      });
      const data = (await res.json()) as Followup & { erro?: string };
      if (!res.ok) throw new Error(data?.erro || "Falha na acao");
      setLista((prev) => prev.map((f) => (f.id === id ? data : f)));
      toast.success(acaoTipo === "enviar" ? "Follow-up enviado ✅" : "Follow-up cancelado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na acao");
    } finally {
      setAcaoId(null);
    }
  }

  const ativos = lista.filter((f) => f.status !== "cancelado");

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="size-3.5" /> Follow-up agendado
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25"
        >
          <Plus className="size-3" /> Agendar
        </button>
      </div>

      {aberto && (
        <div className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2.5">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Quando</label>
            <input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              className="mt-0.5 h-9 w-full rounded-lg bg-card px-2 text-xs outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">Quem escreve</label>
            <div className="mt-0.5 grid grid-cols-2 gap-1.5">
              <ChoiceButton
                active={modo === "manual"}
                onClick={() => setModo("manual")}
                icon={<Pencil className="size-3" />}
              >
                Eu escrevo
              </ChoiceButton>
              <ChoiceButton
                active={modo === "ia"}
                onClick={() => setModo("ia")}
                icon={<Sparkles className="size-3" />}
              >
                IA escreve
              </ChoiceButton>
            </div>
          </div>

          {modo === "manual" ? (
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={3}
              placeholder="Mensagem que será enviada no horário…"
              className="w-full rounded-lg bg-card p-2 text-xs outline-none focus:ring-2 ring-primary/30 resize-none"
            />
          ) : (
            <div className="rounded-lg bg-card p-2 text-[11px] text-muted-foreground inline-flex items-start gap-1.5">
              <Bot className="size-3.5 shrink-0 mt-0.5 text-primary" />
              <span>A IA vai escrever a mensagem na hora, usando o contexto do cliente.</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold text-muted-foreground">No horário</label>
            <div className="mt-0.5 grid grid-cols-2 gap-1.5">
              <ChoiceButton
                active={disparo === "automatico"}
                onClick={() => setDisparo("automatico")}
                icon={<Send className="size-3" />}
              >
                Envia sozinho
              </ChoiceButton>
              <ChoiceButton
                active={disparo === "confirmar"}
                onClick={() => setDisparo("confirmar")}
                icon={<Check className="size-3" />}
              >
                Eu confirmo
              </ChoiceButton>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void agendar()}
            disabled={salvando}
            className="h-9 w-full rounded-lg bg-primary text-xs font-bold text-primary-foreground inline-flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-60"
          >
            <CalendarClock className="size-4" /> {salvando ? "Agendando…" : "Agendar follow-up"}
          </button>
        </div>
      )}

      {carregando ? (
        <div className="text-[11px] text-muted-foreground">Carregando…</div>
      ) : ativos.length === 0 ? (
        !aberto && (
          <div className="text-[11px] text-muted-foreground">
            Nenhum follow-up agendado para este cliente.
          </div>
        )
      ) : (
        <ul className="space-y-1.5">
          {ativos.map((f) => {
            const meta = STATUS_META[f.status];
            const podeAgir = f.status === "aguardando_confirmacao" || f.status === "pendente";
            const ocupado = acaoId === f.id;
            return (
              <li
                key={f.id}
                className="rounded-lg border border-border bg-secondary/20 p-2 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
                    <CalendarClock className="size-3 text-muted-foreground" />
                    {isoParaLabel(f.agendadoPara)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${meta.tone}`}
                  >
                    {meta.icon} {meta.label}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-2">
                  {f.mensagem ? (
                    f.mensagem
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" /> Texto gerado pela IA no envio
                    </span>
                  )}
                </div>
                {f.status === "erro" && f.erro && (
                  <div className="text-[10px] text-destructive">{f.erro}</div>
                )}
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    {f.modo === "ia" ? (
                      <Sparkles className="size-2.5" />
                    ) : (
                      <Pencil className="size-2.5" />
                    )}
                    {f.modo === "ia" ? "IA" : "Manual"}
                  </span>
                  <span>·</span>
                  <span>{f.disparo === "automatico" ? "Auto" : "Confirmar"}</span>
                </div>
                {podeAgir && (
                  <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => void acao(f.id, "enviar")}
                      disabled={ocupado}
                      className="h-7 rounded-md bg-success/90 text-[11px] font-semibold text-success-foreground inline-flex items-center justify-center gap-1 hover:bg-success disabled:opacity-60"
                    >
                      <Send className="size-3" /> Enviar agora
                    </button>
                    <button
                      type="button"
                      onClick={() => void acao(f.id, "cancelar")}
                      disabled={ocupado}
                      className="h-7 rounded-md bg-secondary text-[11px] font-semibold inline-flex items-center justify-center gap-1 hover:bg-secondary/70 disabled:opacity-60"
                    >
                      <X className="size-3" /> Cancelar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 border transition ${
        active
          ? "bg-primary/15 text-primary border-primary/40"
          : "bg-card border-border text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {icon} {children}
    </button>
  );
}
