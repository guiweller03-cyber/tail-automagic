import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  TrendingUp,
  Trash2,
  Pencil,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type {
  ComissaoInfluenciador,
  Cupom as ApiCupom,
  Influenciador,
  IndicacoesResumo,
} from "@/lib/indicacoes-supabase";

type ApiError = { ok?: false; erro?: string };

const API_URL = "/api/crm/indicacoes";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return " - ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function phoneLabel(value: string | null | undefined) {
  if (!value) return " - ";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return value;
}

function statusClass(status: string) {
  switch (status) {
    case "ativo":
    case "paga":
      return "bg-success/15 text-success";
    case "pausado":
    case "aprovada":
      return "bg-warning/15 text-warning";
    case "encerrado":
    case "cancelada":
    case "expirado":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function parseError(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "erro" in body) {
    const erro = (body as ApiError).erro;
    if (typeof erro === "string" && erro.trim()) return erro;
  }
  return fallback;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseError(body, fallback));
  }
  return body as T;
}

export function Indicacoes() {
  const [summary, setSummary] = useState<IndicacoesResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modal, setModal] = useState<"influenciador" | "cupom" | null>(null);
  const [editingInfluenciadorId, setEditingInfluenciadorId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [influenciadorForm, setInfluenciadorForm] = useState({
    nome: "",
    telefone: "",
    documento: "",
    chave_pix: "",
    canal: "",
    observacao: "",
  });

  const [cupomForm, setCupomForm] = useState({
    influenciador_id: "",
    codigo: "",
    tipo_desconto: "percentual" as "percentual" | "valor_fixo",
    valor_desconto: 10,
    comissao_tipo: "percentual_faturamento" as
      | "percentual_faturamento"
      | "percentual_lucro"
      | "valor_fixo",
    comissao_valor: 5,
    limite_usos: 100,
    validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  async function loadSummary() {
    setError(null);
    setRefreshing(true);
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      const data = await readJson<IndicacoesResumo>(response, "Falha ao carregar indicacoes");
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Falha ao carregar indicacoes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  const influenciadores = summary?.influenciadores ?? [];
  const cupons = summary?.cupons ?? [];
  const comissoes = useMemo(() => summary?.comissoes ?? [], [summary?.comissoes]);

  const filteredComissoes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comissoes.filter((item) => {
      const influencer = item.influenciadores?.nome ?? "";
      const code = item.cupons?.codigo ?? "";
      const venda = item.vendas?.cliente_nome ?? "";
      const matchesQuery =
        !q ||
        influencer.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q) ||
        venda.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [comissoes, query, statusFilter]);

  const kpis = summary?.kpis ?? {
    influenciadoresAtivos: 0,
    cuponsAtivos: 0,
    vendasComCupom: 0,
    faturamento: 0,
    comissaoPendente: 0,
    comissaoPaga: 0,
  };

  async function submitInfluenciador(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acao: editingInfluenciadorId ? "editar_influenciador" : "criar_influenciador",
          id: editingInfluenciadorId,
          nome: influenciadorForm.nome,
          telefone: influenciadorForm.telefone,
          documento: influenciadorForm.documento,
          chave_pix: influenciadorForm.chave_pix,
          canal: influenciadorForm.canal,
          observacao: influenciadorForm.observacao,
        }),
      });
      await readJson<Influenciador>(
        response,
        editingInfluenciadorId ? "Falha ao editar influenciador" : "Falha ao criar influenciador",
      );
      toast.success(editingInfluenciadorId ? "Influenciador atualizado" : "Influenciador criado");
      closeModal();
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar influenciador");
    } finally {
      setSaving(false);
    }
  }

  function resetInfluenciadorForm() {
    setEditingInfluenciadorId(null);
    setInfluenciadorForm({
      nome: "",
      telefone: "",
      documento: "",
      chave_pix: "",
      canal: "",
      observacao: "",
    });
  }

  function closeModal() {
    setModal(null);
    resetInfluenciadorForm();
  }

  function openNovoInfluenciador() {
    resetInfluenciadorForm();
    setModal("influenciador");
  }

  function openEditarInfluenciador(item: Influenciador) {
    setEditingInfluenciadorId(item.id);
    setInfluenciadorForm({
      nome: item.nome,
      telefone: item.telefone ?? "",
      documento: item.documento ?? "",
      chave_pix: item.chave_pix ?? "",
      canal: item.canal ?? "",
      observacao: item.observacao ?? "",
    });
    setModal("influenciador");
  }

  async function submitCupom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acao: "criar_cupom",
          influenciador_id: cupomForm.influenciador_id,
          codigo: cupomForm.codigo,
          tipo_desconto: cupomForm.tipo_desconto,
          valor_desconto: cupomForm.valor_desconto,
          comissao_tipo: cupomForm.comissao_tipo,
          comissao_valor: cupomForm.comissao_valor,
          limite_usos: cupomForm.limite_usos,
          validade: cupomForm.validade,
        }),
      });
      await readJson<ApiCupom>(response, "Falha ao criar cupom");
      toast.success("Cupom criado");
      setModal(null);
      setCupomForm({
        influenciador_id: "",
        codigo: "",
        tipo_desconto: "percentual",
        valor_desconto: 10,
        comissao_tipo: "percentual_faturamento",
        comissao_valor: 5,
        limite_usos: 100,
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar cupom");
    } finally {
      setSaving(false);
    }
  }

  async function marcarPago(id: string) {
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "marcar_comissao_paga", id }),
      });
      await readJson<ComissaoInfluenciador>(response, "Falha ao marcar comissao");
      toast.success("Comissao marcada como paga");
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao marcar comissao");
    } finally {
      setSaving(false);
    }
  }

  async function removerCupom(id: string, codigo: string) {
    if (!window.confirm(`Remover o cupom ${codigo}?`)) return;
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "remover_cupom", id }),
      });
      await readJson<{ ok: true }>(response, "Falha ao remover cupom");
      toast.success("Cupom removido");
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover cupom");
    } finally {
      setSaving(false);
    }
  }

  async function removerInfluenciador(id: string, nome: string) {
    if (!window.confirm(`Remover o influenciador ${nome}? Os cupons dele ficarao sem vinculo.`))
      return;
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "remover_influenciador", id }),
      });
      await readJson<{ ok: true }>(response, "Falha ao remover influenciador");
      toast.success("Influenciador removido");
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover influenciador");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Users className="size-6 text-primary" /> Indicacoes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base real de influenciadores, cupons e comissoes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openNovoInfluenciador}
            className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70"
          >
            <UserPlus className="size-4" /> Novo influenciador
          </button>
          <button
            type="button"
            onClick={() => setModal("cupom")}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90"
          >
            <Ticket className="size-4" /> Novo cupom
          </button>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70"
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive inline-flex items-start gap-2">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" />
          <span>
            {error.includes("20260528020000_referral_system.sql")
              ? "As tabelas de indicacoes ainda nao existem no Supabase. Aplique a migration 20260528020000_referral_system.sql."
              : error}
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi
          icon={<Users className="size-4" />}
          label="Ativos"
          value={String(kpis.influenciadoresAtivos)}
          sub="influenciadores"
        />
        <Kpi
          icon={<Ticket className="size-4" />}
          label="Cupons ativos"
          value={String(kpis.cuponsAtivos)}
          sub="em uso"
        />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Vendas com cupom"
          value={String(kpis.vendasComCupom)}
          sub="pedidos"
        />
        <Kpi
          icon={<Banknote className="size-4" />}
          label="Faturamento"
          value={money(kpis.faturamento)}
          sub="cupom aplicado"
        />
        <Kpi
          icon={<Wallet className="size-4" />}
          label="Comissao pendente"
          value={money(kpis.comissaoPendente)}
          sub="a pagar"
        />
        <Kpi
          icon={<BadgeCheck className="size-4" />}
          label="Comissao paga"
          value={money(kpis.comissaoPaga)}
          sub="quitada"
        />
      </div>

      <section className="card-soft p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por influenciador, cupom ou cliente..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none focus:bg-card border border-transparent focus:border-primary"
            />
          </div>
          <div className="inline-flex items-center gap-2 text-xs">
            <Filter className="size-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 px-3 rounded-xl bg-secondary outline-none border border-transparent focus:border-primary"
            >
              <option value="all">Todos</option>
              <option value="pendente">Pendente</option>
              <option value="aprovada">Aprovada</option>
              <option value="paga">Paga</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>
      </section>

      <div className="grid xl:grid-cols-[1.05fr_0.95fr] gap-4">
        <section className="card-soft overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Influenciadores</h2>
              <p className="text-xs text-muted-foreground">Cadastro real vindo do Supabase.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <Th>Nome</Th>
                  <Th>Telefone</Th>
                  <Th>Canal</Th>
                  <Th>Status</Th>
                  <Th>Cupons</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {influenciadores.map((item) => {
                  const totalCupons = cupons.filter(
                    (cupom) => cupom.influenciador_id === item.id,
                  ).length;
                  return (
                    <tr key={item.id} className="border-t border-border hover:bg-secondary/30">
                      <Td className="font-semibold">{item.nome}</Td>
                      <Td>{phoneLabel(item.telefone)}</Td>
                      <Td>{item.canal ?? " - "}</Td>
                      <Td>
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </Td>
                      <Td>{totalCupons}</Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditarInfluenciador(item)}
                            disabled={saving}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50"
                            title="Editar influenciador"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removerInfluenciador(item.id, item.nome)}
                            disabled={saving}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            title="Remover influenciador"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
                {!loading && influenciadores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum influenciador cadastrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card-soft overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Cupons</h2>
              <p className="text-xs text-muted-foreground">Codigos reais e regras do backend.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <Th>Codigo</Th>
                  <Th>Influenciador</Th>
                  <Th>Desconto</Th>
                  <Th>Comissao</Th>
                  <Th>Uso</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {cupons.map((item) => (
                  <tr key={item.id} className="border-t border-border hover:bg-secondary/30">
                    <Td className="font-semibold">{item.codigo}</Td>
                    <Td>{item.influenciadores?.nome ?? " - "}</Td>
                    <Td>
                      {item.tipo_desconto === "percentual"
                        ? `${item.valor_desconto}%`
                        : money(item.valor_desconto)}
                    </Td>
                    <Td>
                      {item.comissao_tipo === "valor_fixo"
                        ? money(item.comissao_valor)
                        : `${item.comissao_valor}%`}
                    </Td>
                    <Td>
                      <span className="text-xs text-muted-foreground">
                        {item.usos}
                        {item.limite_usos !== null ? ` / ${item.limite_usos}` : ""}
                      </span>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => void removerCupom(item.id, item.codigo)}
                        disabled={saving}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        title="Remover cupom"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
                {!loading && cupons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum cupom cadastrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Comissoes</h2>
            <p className="text-xs text-muted-foreground">
              Marcar como paga altera a base real no Supabase.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <Th>Influenciador</Th>
                <Th>Cupom</Th>
                <Th>Venda</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filteredComissoes.map((item) => (
                <tr key={item.id} className="border-t border-border hover:bg-secondary/30">
                  <Td className="font-semibold">{item.influenciadores?.nome ?? " - "}</Td>
                  <Td>{item.cupons?.codigo ?? " - "}</Td>
                  <Td>{item.vendas?.cliente_nome ?? item.venda_id}</Td>
                  <Td>{money(item.valor)}</Td>
                  <Td>
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </Td>
                  <Td className="text-right">
                    {item.status !== "paga" ? (
                      <button
                        type="button"
                        onClick={() => void marcarPago(item.id)}
                        disabled={saving}
                        className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60"
                      >
                        Marcar paga
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-success font-semibold">
                        <CheckCircle2 className="size-3.5" /> Pago
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
              {!loading && filteredComissoes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhuma comissao encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal === "influenciador" ? (
        <Modal
          title={editingInfluenciadorId ? "Editar influenciador" : "Novo influenciador"}
          onClose={closeModal}
        >
          <form onSubmit={(event) => void submitInfluenciador(event)} className="space-y-3">
            <Field label="Nome">
              <input
                value={influenciadorForm.nome}
                onChange={(event) =>
                  setInfluenciadorForm((current) => ({ ...current, nome: event.target.value }))
                }
                className="input"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone">
                <input
                  value={influenciadorForm.telefone}
                  onChange={(event) =>
                    setInfluenciadorForm((current) => ({
                      ...current,
                      telefone: event.target.value,
                    }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Documento">
                <input
                  value={influenciadorForm.documento}
                  onChange={(event) =>
                    setInfluenciadorForm((current) => ({
                      ...current,
                      documento: event.target.value,
                    }))
                  }
                  className="input"
                />
              </Field>
            </div>
            <Field label="Chave PIX">
              <input
                value={influenciadorForm.chave_pix}
                onChange={(event) =>
                  setInfluenciadorForm((current) => ({ ...current, chave_pix: event.target.value }))
                }
                className="input"
              />
            </Field>
            <Field label="Canal">
              <input
                value={influenciadorForm.canal}
                onChange={(event) =>
                  setInfluenciadorForm((current) => ({ ...current, canal: event.target.value }))
                }
                className="input"
              />
            </Field>
            <Field label="Observacao">
              <textarea
                value={influenciadorForm.observacao}
                onChange={(event) =>
                  setInfluenciadorForm((current) => ({
                    ...current,
                    observacao: event.target.value,
                  }))
                }
                className="input min-h-24 py-2"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="h-9 px-4 rounded-lg bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                {editingInfluenciadorId ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal === "cupom" ? (
        <Modal title="Novo cupom" onClose={closeModal}>
          <form onSubmit={(event) => void submitCupom(event)} className="space-y-3">
            <Field label="Influenciador">
              <select
                value={cupomForm.influenciador_id}
                onChange={(event) =>
                  setCupomForm((current) => ({ ...current, influenciador_id: event.target.value }))
                }
                className="input"
                required
              >
                <option value="">Selecione</option>
                {influenciadores.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Codigo">
              <input
                value={cupomForm.codigo}
                onChange={(event) =>
                  setCupomForm((current) => ({
                    ...current,
                    codigo: event.target.value.toUpperCase(),
                  }))
                }
                className="input"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo desconto">
                <select
                  value={cupomForm.tipo_desconto}
                  onChange={(event) =>
                    setCupomForm((current) => ({
                      ...current,
                      tipo_desconto: event.target.value as "percentual" | "valor_fixo",
                    }))
                  }
                  className="input"
                >
                  <option value="percentual">Percentual</option>
                  <option value="valor_fixo">Valor fixo</option>
                </select>
              </Field>
              <Field label="Valor desconto">
                <input
                  type="number"
                  value={cupomForm.valor_desconto}
                  onChange={(event) =>
                    setCupomForm((current) => ({
                      ...current,
                      valor_desconto: Number(event.target.value) || 0,
                    }))
                  }
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo comissao">
                <select
                  value={cupomForm.comissao_tipo}
                  onChange={(event) =>
                    setCupomForm((current) => ({
                      ...current,
                      comissao_tipo: event.target.value as
                        | "percentual_faturamento"
                        | "percentual_lucro"
                        | "valor_fixo",
                    }))
                  }
                  className="input"
                >
                  <option value="percentual_faturamento">Percentual do faturamento</option>
                  <option value="percentual_lucro">Percentual do lucro</option>
                  <option value="valor_fixo">Valor fixo</option>
                </select>
              </Field>
              <Field label="Valor comissao">
                <input
                  type="number"
                  value={cupomForm.comissao_valor}
                  onChange={(event) =>
                    setCupomForm((current) => ({
                      ...current,
                      comissao_valor: Number(event.target.value) || 0,
                    }))
                  }
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Limite de uso">
                <input
                  type="number"
                  value={cupomForm.limite_usos}
                  onChange={(event) =>
                    setCupomForm((current) => ({
                      ...current,
                      limite_usos: Number(event.target.value) || 0,
                    }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Validade">
                <input
                  type="date"
                  value={cupomForm.validade}
                  onChange={(event) =>
                    setCupomForm((current) => ({ ...current, validade: event.target.value }))
                  }
                  className="input"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="h-9 px-4 rounded-lg bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
              >
                Criar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {loading ? (
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Carregando dados reais...
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
      <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="text-left font-semibold px-3 py-2.5">{children}</th>;
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-3 ${className}`}>{children}</td>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-bold">{title}</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}
