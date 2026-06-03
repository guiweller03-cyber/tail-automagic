import { Copy, Edit3, Megaphone, Plus, Search, Trash2, TrendingUp, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CampanhaManual as CampanhaLinha,
  CampanhaManualInput,
  CampanhaStatus,
} from "@/lib/campanhas-supabase";

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

type CampanhaForm = {
  nome: string;
  origem: string;
  objetivo: string;
  investimento: string;
  leads: string;
  conversoes: string;
  receita: string;
  status: CampanhaStatus;
  inicio: string;
  fim: string;
  observacoes: string;
};

const emptyForm: CampanhaForm = {
  nome: "",
  origem: "",
  objetivo: "",
  investimento: "",
  leads: "",
  conversoes: "",
  receita: "",
  status: "rascunho",
  inicio: "",
  fim: "",
  observacoes: "",
};

const statusConfig: Record<CampanhaStatus, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-secondary text-muted-foreground" },
  ativa: { label: "Ativa", className: "bg-success/15 text-success" },
  pausada: { label: "Pausada", className: "bg-accent/15 text-accent" },
  encerrada: { label: "Encerrada", className: "bg-muted text-muted-foreground" },
};

function parseNumber(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberToInput(value: number) {
  return value > 0 ? String(value).replace(".", ",") : "";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return dateFormat.format(date);
}

function roi(campanha: Pick<CampanhaLinha, "receita" | "investimento">) {
  if (campanha.investimento <= 0) return campanha.receita > 0 ? "sem custo" : "0x";
  return `${(campanha.receita / campanha.investimento).toFixed(1)}x`;
}

function taxaConversao(campanha: Pick<CampanhaLinha, "leads" | "conversoes">) {
  if (campanha.leads <= 0) return "0%";
  return `${((campanha.conversoes / campanha.leads) * 100).toFixed(1)}%`;
}

function cac(campanha: Pick<CampanhaLinha, "investimento" | "conversoes">) {
  if (campanha.conversoes <= 0) return "-";
  return brl(campanha.investimento / campanha.conversoes);
}

export function Campanhas() {
  const [campanhas, setCampanhas] = useState<CampanhaLinha[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todas" | CampanhaStatus>("todas");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampanhaForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/crm/campanhas", { cache: "no-store" });
        const data = (await response.json()) as CampanhaLinha[] | { erro?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(Array.isArray(data) ? "Erro ao carregar campanhas" : data.erro);
        }
        if (alive) setCampanhas(data);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao carregar campanhas";
        toast.error(message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const filteredCampanhas = useMemo(() => {
    const term = query.trim().toLowerCase();
    return campanhas.filter((campanha) => {
      const matchesStatus = statusFilter === "todas" || campanha.status === statusFilter;
      const matchesQuery =
        !term ||
        campanha.nome.toLowerCase().includes(term) ||
        campanha.origem.toLowerCase().includes(term) ||
        campanha.objetivo.toLowerCase().includes(term);
      return matchesStatus && matchesQuery;
    });
  }, [campanhas, query, statusFilter]);

  const resumo = useMemo(() => {
    const investimento = campanhas.reduce((sum, campanha) => sum + campanha.investimento, 0);
    const leads = campanhas.reduce((sum, campanha) => sum + campanha.leads, 0);
    const conversoes = campanhas.reduce((sum, campanha) => sum + campanha.conversoes, 0);
    const receita = campanhas.reduce((sum, campanha) => sum + campanha.receita, 0);
    return {
      ativas: campanhas.filter((campanha) => campanha.status === "ativa").length,
      investimento,
      leads,
      conversoes,
      receita,
      roi: investimento > 0 ? `${(receita / investimento).toFixed(1)}x` : "0x",
    };
  }, [campanhas]);

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(campanha: CampanhaLinha) {
    setEditingId(campanha.id);
    setForm({
      nome: campanha.nome,
      origem: campanha.origem,
      objetivo: campanha.objetivo,
      investimento: numberToInput(campanha.investimento),
      leads: numberToInput(campanha.leads),
      conversoes: numberToInput(campanha.conversoes),
      receita: numberToInput(campanha.receita),
      status: campanha.status,
      inicio: campanha.inicio,
      fim: campanha.fim,
      observacoes: campanha.observacoes,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function formPayload(): CampanhaManualInput | null {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Informe o nome da campanha");
      return null;
    }

    return {
      nome,
      origem: form.origem.trim(),
      objetivo: form.objetivo.trim(),
      investimento: parseNumber(form.investimento),
      leads: Math.max(0, Math.floor(parseNumber(form.leads))),
      conversoes: Math.max(0, Math.floor(parseNumber(form.conversoes))),
      receita: parseNumber(form.receita),
      status: form.status,
      inicio: form.inicio,
      fim: form.fim,
      observacoes: form.observacoes.trim(),
    };
  }

  async function saveCampanha() {
    const payload = formPayload();
    if (!payload) return;

    setSaving(true);
    try {
      const response = await fetch("/api/crm/campanhas", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = (await response.json()) as CampanhaLinha | { erro?: string };
      if (!response.ok || !("id" in data)) {
        throw new Error("erro" in data ? data.erro : "Erro ao salvar campanha");
      }

      if (editingId) {
        setCampanhas((current) =>
          current.map((campanha) => (campanha.id === editingId ? data : campanha)),
        );
        toast.success("Campanha atualizada");
      } else {
        setCampanhas((current) => [data, ...current]);
        toast.success("Campanha adicionada");
      }
      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar campanha";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function duplicateCampanha(campanha: CampanhaLinha) {
    const payload: CampanhaManualInput = {
      nome: `${campanha.nome} (copia)`,
      origem: campanha.origem,
      objetivo: campanha.objetivo,
      investimento: campanha.investimento,
      leads: campanha.leads,
      conversoes: campanha.conversoes,
      receita: campanha.receita,
      status: "rascunho",
      inicio: campanha.inicio,
      fim: campanha.fim,
      observacoes: campanha.observacoes,
    };

    try {
      const response = await fetch("/api/crm/campanhas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CampanhaLinha | { erro?: string };
      if (!response.ok || !("id" in data)) {
        throw new Error("erro" in data ? data.erro : "Erro ao duplicar campanha");
      }

      setCampanhas((current) => [data, ...current]);
      toast.success("Campanha duplicada como rascunho");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao duplicar campanha";
      toast.error(message);
    }
  }

  async function removeCampanha(id: string) {
    const campanha = campanhas.find((item) => item.id === id);
    if (!campanha) return;
    const confirmed = window.confirm(`Remover a campanha "${campanha.nome}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch("/api/crm/campanhas", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { ok?: boolean; erro?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.erro || "Erro ao remover campanha");
      }

      setCampanhas((current) => current.filter((item) => item.id !== id));
      toast.success("Campanha removida");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao remover campanha";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro manual de campanhas, sem dados automaticos ou mockados.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="size-4" /> Nova campanha
        </button>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Card
          icon={<Megaphone className="size-5" />}
          label="Ativas"
          value={String(resumo.ativas)}
        />
        <Card
          icon={<TrendingUp className="size-5" />}
          label="Investimento"
          value={brl(resumo.investimento)}
        />
        <Card icon={<Users className="size-5" />} label="Leads" value={String(resumo.leads)} />
        <Card
          icon={<Users className="size-5" />}
          label="Conversoes"
          value={String(resumo.conversoes)}
        />
        <Card icon={<TrendingUp className="size-5" />} label="ROI" value={resumo.roi} />
      </div>

      <div className="card-soft p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative lg:max-w-sm w-full">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, origem ou objetivo"
              className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(["todas", "rascunho", "ativa", "pausada", "encerrada"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold border transition ${
                  statusFilter === status
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card border-border hover:bg-secondary"
                }`}
              >
                {status === "todas" ? "Todas" : statusConfig[status].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3 min-w-56">Campanha</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Periodo</th>
                <th className="font-medium px-4 py-3">Invest.</th>
                <th className="font-medium px-4 py-3">Leads</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Conv.</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Taxa</th>
                <th className="font-medium px-4 py-3">ROI</th>
                <th className="font-medium px-4 py-3">Status</th>
                <th className="font-medium px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampanhas.map((campanha) => (
                <tr key={campanha.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{campanha.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {campanha.origem || "Sem origem"}
                      {campanha.objetivo ? ` · ${campanha.objetivo}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {formatDate(campanha.inicio)} ate {formatDate(campanha.fim)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{brl(campanha.investimento)}</td>
                  <td className="px-4 py-3 tabular-nums">{campanha.leads}</td>
                  <td className="px-4 py-3 hidden lg:table-cell tabular-nums">
                    {campanha.conversoes}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell tabular-nums">
                    {taxaConversao(campanha)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-success tabular-nums">{roi(campanha)}</div>
                    <div className="text-[10px] text-muted-foreground">CAC {cac(campanha)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] font-semibold px-2 py-1 rounded-md ${statusConfig[campanha.status].className}`}
                    >
                      {statusConfig[campanha.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton label="Editar campanha" onClick={() => openEditModal(campanha)}>
                        <Edit3 className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Duplicar campanha"
                        onClick={() => duplicateCampanha(campanha)}
                      >
                        <Copy className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Remover campanha"
                        onClick={() => removeCampanha(campanha.id)}
                        destructive
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Carregando campanhas...
                  </td>
                </tr>
              )}
              {!loading && filteredCampanhas.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma campanha cadastrada manualmente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50"
          onClick={closeModal}
        >
          <div
            className="card-soft p-5 w-full max-w-2xl space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <Megaphone className="size-4 text-primary" />
                  {editingId ? "Editar campanha" : "Nova campanha"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Tudo aqui e preenchido manualmente. Nenhum dado sera criado automaticamente.
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg hover:bg-secondary"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome" className="col-span-2">
                <input
                  value={form.nome}
                  onChange={(event) => setForm((state) => ({ ...state, nome: event.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="Origem">
                <input
                  value={form.origem}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, origem: event.target.value }))
                  }
                  placeholder="Ex: Meta Ads"
                  className="input"
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, status: event.target.value as CampanhaStatus }))
                  }
                  className="input"
                >
                  {Object.entries(statusConfig).map(([value, config]) => (
                    <option key={value} value={value}>
                      {config.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Objetivo" className="col-span-2">
                <input
                  value={form.objetivo}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, objetivo: event.target.value }))
                  }
                  placeholder="Ex: vender racao senior para clientes recorrentes"
                  className="input"
                />
              </Field>
              <Field label="Inicio">
                <input
                  type="date"
                  value={form.inicio}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, inicio: event.target.value }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Fim">
                <input
                  type="date"
                  value={form.fim}
                  onChange={(event) => setForm((state) => ({ ...state, fim: event.target.value }))}
                  className="input"
                />
              </Field>
              <Field label="Investimento">
                <input
                  inputMode="decimal"
                  value={form.investimento}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, investimento: event.target.value }))
                  }
                  placeholder="0,00"
                  className="input"
                />
              </Field>
              <Field label="Receita">
                <input
                  inputMode="decimal"
                  value={form.receita}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, receita: event.target.value }))
                  }
                  placeholder="0,00"
                  className="input"
                />
              </Field>
              <Field label="Leads">
                <input
                  inputMode="numeric"
                  value={form.leads}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, leads: event.target.value }))
                  }
                  placeholder="0"
                  className="input"
                />
              </Field>
              <Field label="Conversoes">
                <input
                  inputMode="numeric"
                  value={form.conversoes}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, conversoes: event.target.value }))
                  }
                  placeholder="0"
                  className="input"
                />
              </Field>
              <Field label="Observacoes" className="col-span-2">
                <textarea
                  value={form.observacoes}
                  onChange={(event) =>
                    setForm((state) => ({ ...state, observacoes: event.target.value }))
                  }
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={saveCampanha}
                disabled={saving}
                className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  children,
  label,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function IconButton({
  children,
  destructive = false,
  label,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`size-8 rounded-lg border grid place-items-center transition ${
        destructive
          ? "border-destructive/20 text-destructive hover:bg-destructive/10"
          : "border-border hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-soft p-4 flex items-center gap-4 min-w-0">
      <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
