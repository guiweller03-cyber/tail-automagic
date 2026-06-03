import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { Cupom as ApiCupom, IndicacoesResumo, Influenciador } from "@/lib/indicacoes-supabase";

type ApiError = { ok?: false; erro?: string };

const API_URL = "/api/crm/indicacoes";

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusClass(status: string) {
  switch (status) {
    case "ativo":
      return "bg-success/15 text-success";
    case "pausado":
      return "bg-warning/15 text-warning";
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

export function Cupons() {
  const [summary, setSummary] = useState<IndicacoesResumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"cupons" | "indicacoes">("cupons");

  const [form, setForm] = useState({
    influenciador_id: "",
    influencer_name: "",
    influencer_email: "",
    codigo: "",
    tipo_desconto: "percentual" as "percentual" | "valor_fixo",
    valor_desconto: 10,
    comissao_tipo: "percentual_faturamento" as "percentual_faturamento" | "percentual_lucro" | "valor_fixo",
    comissao_valor: 5,
    limite_usos: 100,
    validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  async function loadSummary() {
    setError(null);
    setRefreshing(true);
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      const data = await readJson<IndicacoesResumo>(response, "Falha ao carregar cupons");
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Falha ao carregar cupons");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cupons.filter((item) => {
      const influencer = item.influenciadores?.nome ?? "";
      const matchesQuery =
        !q ||
        item.codigo.toLowerCase().includes(q) ||
        influencer.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [cupons, query, statusFilter]);

  const totals = useMemo(
    () => ({
      ativos: cupons.filter((item) => item.status === "ativo").length,
      usos: cupons.reduce((sum, item) => sum + item.usos, 0),
      faturamento: summary?.kpis.faturamento ?? 0,
      influenciadores: influenciadores.length,
    }),
    [cupons, influenciadores.length, summary?.kpis.faturamento],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          acao: "criar_cupom",
          influenciador_id: form.influenciador_id,
          influencer_name: form.influencer_name,
          influencer_email: form.influencer_email,
          codigo: form.codigo,
          tipo_desconto: form.tipo_desconto,
          valor_desconto: form.valor_desconto,
          comissao_tipo: form.comissao_tipo,
          comissao_valor: form.comissao_valor,
          limite_usos: form.limite_usos,
          validade: form.validade,
        }),
      });
      await readJson<ApiCupom>(response, "Falha ao criar cupom");
      toast.success("Cupom criado");
      setModal(false);
      setForm({
        influenciador_id: "",
        influencer_name: "",
        influencer_email: "",
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

  async function toggleCupom(item: ApiCupom) {
    setSaving(true);
    try {
      const ativo = item.status !== "ativo" || item.is_active === false;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao: "definir_cupom_ativo", id: item.id, ativo }),
      });
      await readJson<ApiCupom>(response, "Falha ao alterar cupom");
      toast.success(ativo ? "Cupom ativado" : "Cupom pausado");
      await loadSummary();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar cupom");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Ticket className="size-6 text-primary" /> Cupons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dados reais vindos do Supabase.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModal(true)}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90"
          >
            <Plus className="size-4" /> Novo cupom
          </button>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70"
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive inline-flex items-start gap-2">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" />
          <span>
            {error.includes("20260528020000_referral_system.sql")
              ? "As tabelas de cupons ainda nao existem no Supabase. Aplique a migration 20260528020000_referral_system.sql."
              : error}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Ativos" value={String(totals.ativos)} icon={<Ticket className="size-4" />} />
        <Kpi label="Usos" value={String(totals.usos)} icon={<Users className="size-4" />} />
        <Kpi label="Faturamento" value={money(totals.faturamento)} icon={<Ticket className="size-4" />} />
        <Kpi label="Influenciadores" value={String(totals.influenciadores)} icon={<Users className="size-4" />} />
      </div>

      <section className="card-soft p-4">
        <div className="mb-3 inline-flex rounded-lg bg-secondary p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("cupons")}
            className={`h-8 rounded-md px-3 ${tab === "cupons" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            Cupons
          </button>
          <button
            type="button"
            onClick={() => setTab("indicacoes")}
            className={`h-8 rounded-md px-3 ${tab === "indicacoes" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            Indicacoes
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cupom ou influenciador..."
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
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="expirado">Expirado</option>
            </select>
          </div>
        </div>
      </section>

      {tab === "indicacoes" ? (
        <section className="card-soft overflow-hidden">
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <Kpi label="Indicacoes" value={String(summary?.kpis.totalIndicacoes ?? 0)} icon={<Users className="size-4" />} />
            <Kpi label="Creditos distribuidos" value={money(summary?.kpis.creditosDistribuidos ?? 0)} icon={<Ticket className="size-4" />} />
            <Kpi label="Ranking" value={String(summary?.kpis.rankingIndicacoes.length ?? 0)} icon={<Users className="size-4" />} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <Th>Indicador</Th>
                  <Th>Indicacoes</Th>
                  <Th>Creditos</Th>
                </tr>
              </thead>
              <tbody>
                {(summary?.kpis.rankingIndicacoes ?? []).map((item) => (
                  <tr key={item.user_id} className="border-t border-border hover:bg-secondary/30">
                    <Td className="font-semibold">{item.nome}</Td>
                    <Td>{item.total}</Td>
                    <Td>{money(item.creditos)}</Td>
                  </tr>
                ))}
                {!loading && (summary?.kpis.rankingIndicacoes.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma indicacao P2P concluida.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
      <section className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <Th>Codigo</Th>
                <Th>Influenciador</Th>
                <Th>Desconto</Th>
                <Th>Comissao</Th>
                <Th>Uso</Th>
                <Th>Validade</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
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
                    {item.usos}
                    {item.limite_usos !== null ? ` / ${item.limite_usos}` : ""}
                  </Td>
                  <Td>{item.validade ? dateLabel(item.validade) : " - "}</Td>
                  <Td>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => void toggleCupom(item)}
                      disabled={saving}
                      className="mr-1 h-8 rounded-lg bg-secondary px-3 text-xs font-semibold hover:bg-secondary/70 disabled:opacity-50"
                      title="Ativar ou pausar cupom"
                    >
                      {item.status === "ativo" && item.is_active !== false ? "Pausar" : "Ativar"}
                    </button>
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
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum cupom encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {modal ? (
        <Modal title="Novo cupom" onClose={() => setModal(false)}>
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <Field label="Influenciador">
              <input
                value={form.influencer_name}
                onChange={(event) => setForm((current) => ({ ...current, influencer_name: event.target.value }))}
                className="input"
                required
              />
            </Field>
            <Field label="Email do influenciador">
              <input
                type="email"
                value={form.influencer_email}
                onChange={(event) => setForm((current) => ({ ...current, influencer_email: event.target.value }))}
                className="input"
              />
            </Field>
            <Field label="Codigo">
              <input
                value={form.codigo}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))}
                className="input"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo desconto">
                <select
                  value={form.tipo_desconto}
                  onChange={(event) => setForm((current) => ({ ...current, tipo_desconto: event.target.value as "percentual" | "valor_fixo" }))}
                  className="input"
                >
                  <option value="percentual">Percentual</option>
                  <option value="valor_fixo">Valor fixo</option>
                </select>
              </Field>
              <Field label="Valor desconto">
                <input
                  type="number"
                  value={form.valor_desconto}
                  onChange={(event) => setForm((current) => ({ ...current, valor_desconto: Number(event.target.value) || 0 }))}
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo comissao">
                <select
                  value={form.comissao_tipo}
                  onChange={(event) => setForm((current) => ({ ...current, comissao_tipo: event.target.value as "percentual_faturamento" | "percentual_lucro" | "valor_fixo" }))}
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
                  value={form.comissao_valor}
                  onChange={(event) => setForm((current) => ({ ...current, comissao_valor: Number(event.target.value) || 0 }))}
                  className="input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Limite de uso">
                <input
                  type="number"
                  value={form.limite_usos}
                  onChange={(event) => setForm((current) => ({ ...current, limite_usos: Number(event.target.value) || 0 }))}
                  className="input"
                />
              </Field>
              <Field label="Validade">
                <input
                  type="date"
                  value={form.validade}
                  onChange={(event) => setForm((current) => ({ ...current, validade: event.target.value }))}
                  className="input"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModal(false)} className="h-9 px-4 rounded-lg bg-secondary text-sm font-semibold">
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
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-2xl border border-border shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
