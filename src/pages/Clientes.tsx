import type { Cliente, Cupom, CupomTipo } from "@/lib/crm-types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Search,
  Plus,
  MessageCircle,
  Phone,
  X,
  Pencil,
  History,
  ShoppingBag,
  MapPin,
  Tag,
  Ticket,
  StickyNote,
  Save,
  Trash2,
  Link,
  Clock,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { dispatchCrmReload, onCrmReload } from "@/lib/crm-refresh";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const WHATSAPP_SYNC_KEY = "crm_clientes_whatsapp_sync_at";

const STATUS_TONE: Record<Cupom["status"], string> = {
  gerado: "bg-primary/15 text-primary",
  enviado: "bg-accent/15 text-accent",
  usado: "bg-success/15 text-success",
  expirado: "bg-secondary text-muted-foreground",
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `PET-${s}`;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type ClienteFormState = {
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  pets: string;
  perfil: Cliente["perfil"];
  origem: string;
};

type ManualToolsState = {
  observacoes: string;
  followUpMensagem: string;
  followUpData: string;
  followUpHora: string;
  followUpCanal: NonNullable<Cliente["followUpManual"]>["canal"];
  followUpStatus: NonNullable<Cliente["followUpManual"]>["status"];
  followUpMidiaUrl: string;
  followUpMidiaNome: string;
  followUpMidiaTipo: string;
};

function clienteFormVazio(): ClienteFormState {
  return {
    nome: "",
    telefone: "",
    endereco: "",
    bairro: "",
    pets: "",
    perfil: "Novo",
    origem: "CRM manual",
  };
}

function manualToolsFromCliente(cliente: Cliente | null): ManualToolsState {
  return {
    observacoes: cliente?.observacoes ?? "",
    followUpMensagem: cliente?.followUpManual?.mensagem ?? "",
    followUpData: cliente?.followUpManual?.data ?? "",
    followUpHora: cliente?.followUpManual?.hora ?? "",
    followUpCanal: cliente?.followUpManual?.canal ?? "WhatsApp",
    followUpStatus: cliente?.followUpManual?.status ?? "pendente",
    followUpMidiaUrl: cliente?.followUpManual?.midiaUrl ?? "",
    followUpMidiaNome: cliente?.followUpManual?.midiaNome ?? "",
    followUpMidiaTipo: cliente?.followUpManual?.midiaTipo ?? "",
  };
}

export function Clientes({ clientes }: { clientes: Cliente[] }) {
  const navigate = useNavigate();
  const [clientesAtuais, setClientesAtuais] = useState<Cliente[]>(clientes);
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Cliente | null>(null);
  const [tab, setTab] = useState<"perfil" | "manual" | "historico" | "cupons">("perfil");
  const [cupons, setCupons] = useState<Cupom[]>([]);

  const [showCupomModal, setShowCupomModal] = useState(false);
  const [cupomTipo, setCupomTipo] = useState<CupomTipo>("percentual");
  const [cupomValor, setCupomValor] = useState(10);
  const [cupomDias, setCupomDias] = useState(30);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [clienteForm, setClienteForm] = useState<ClienteFormState>(clienteFormVazio);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [sincronizandoWhatsapp, setSincronizandoWhatsapp] = useState(false);
  const [manualTools, setManualTools] = useState<ManualToolsState>(() =>
    manualToolsFromCliente(null),
  );
  const [salvandoManualTools, setSalvandoManualTools] = useState(false);
  const [excluindoCliente, setExcluindoCliente] = useState(false);

  useEffect(() => {
    setClientesAtuais(clientes);
  }, [clientes]);

  const recarregarClientes = useCallback(async () => {
    const response = await fetch("/api/crm/clientes", { cache: "no-store" });
    if (!response.ok) throw new Error("Falha ao carregar clientes");
    setClientesAtuais((await response.json()) as Cliente[]);
  }, []);

  useEffect(() => {
    return onCrmReload(() => {
      void recarregarClientes().catch(() => toast.error("Nao foi possivel atualizar os clientes"));
    });
  }, [recarregarClientes]);

  const sincronizarWhatsApp = useCallback(async () => {
    if (sincronizandoWhatsapp) return;

    setSincronizandoWhatsapp(true);
    try {
      const response = await fetch("/api/crm/clientes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "sync_whatsapp" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { erro?: string }).erro || "Falha ao sincronizar");

      await recarregarClientes();
      localStorage.setItem(WHATSAPP_SYNC_KEY, String(Date.now()));
      toast.success(
        `WhatsApp sincronizado: ${(data as { importados?: number }).importados ?? 0} conversas`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel sincronizar WhatsApp");
    } finally {
      setSincronizandoWhatsapp(false);
    }
  }, [recarregarClientes, sincronizandoWhatsapp]);

  useEffect(() => {
    const lastSyncRaw = localStorage.getItem(WHATSAPP_SYNC_KEY);
    const lastSync = lastSyncRaw ? Number(lastSyncRaw) : 0;
    const dayMs = 24 * 60 * 60 * 1000;

    if (!lastSync || Date.now() - lastSync > dayMs) {
      void sincronizarWhatsApp();
    }
  }, [sincronizarWhatsApp]);

  const list = clientesAtuais.filter((c) => {
    const ok = filter === "Todos" || c.perfil === filter;
    const s = search.toLowerCase();
    return (
      ok &&
      (!s ||
        c.nome.toLowerCase().includes(s) ||
        c.telefone.includes(s) ||
        c.pets.some((p) => p.toLowerCase().includes(s)))
    );
  });

  const cuponsAtivosPorCliente = useMemo(() => {
    const m = new Map<string, number>();
    cupons.forEach((cp) => {
      if (cp.status === "gerado" || cp.status === "enviado") {
        m.set(cp.clienteId, (m.get(cp.clienteId) || 0) + 1);
      }
    });
    return m;
  }, [cupons]);

  const cuponsCliente = active ? cupons.filter((cp) => cp.clienteId === active.id) : [];

  useEffect(() => {
    setManualTools(manualToolsFromCliente(active));
  }, [active]);

  function gerarCupom() {
    if (!active) return;
    const novo: Cupom = {
      id: `cp${Date.now()}`,
      clienteId: active.id,
      codigo: randomCode(),
      desconto: cupomValor,
      tipo: cupomTipo,
      status: "gerado",
      criadoEm: todayStr(),
    };
    setCupons((cs) => [novo, ...cs]);
    setShowCupomModal(false);
    setTab("cupons");
  }

  function abrirNovoCliente() {
    setClienteEditando(null);
    setClienteForm(clienteFormVazio());
    setShowClienteModal(true);
  }

  function abrirEdicaoCliente(clienteAtual: Cliente) {
    setClienteEditando(clienteAtual);
    setClienteForm({
      nome: clienteAtual.nome,
      telefone: clienteAtual.telefone,
      endereco: clienteAtual.endereco,
      bairro: clienteAtual.bairro,
      pets: clienteAtual.pets.join(", "),
      perfil: clienteAtual.perfil,
      origem: clienteAtual.origem,
    });
    setShowClienteModal(true);
  }

  function fecharClienteModal() {
    setShowClienteModal(false);
    setClienteEditando(null);
  }

  function abrirPedidoNoPdv(clienteAtual: Cliente) {
    navigate({
      to: "/pdv",
      search: {
        cliente: clienteAtual.nome,
        telefone: clienteAtual.telefone,
      },
    });
  }

  async function salvarCliente() {
    const estavaEditando = Boolean(clienteEditando);
    const nome = clienteForm.nome.trim();
    const telefone = clienteForm.telefone.replace(/\D/g, "");
    if (!nome || telefone.length < 8) {
      toast.error("Informe nome e telefone validos");
      return;
    }

    setSalvandoCliente(true);
    try {
      const response = await fetch("/api/crm/clientes", {
        method: clienteEditando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(clienteEditando ? { id: clienteEditando.id } : {}),
          nome,
          telefone,
          endereco: clienteForm.endereco,
          bairro: clienteForm.bairro,
          pets: clienteForm.pets,
          perfil: clienteForm.perfil,
          origem: clienteForm.origem,
        }),
      });
      const data = (await response.json()) as Cliente | { erro?: string };
      if (!response.ok) throw new Error("erro" in data ? data.erro : "Nao foi possivel salvar");

      const clienteSalvo = data as Cliente;
      setClientesAtuais((current) => {
        const index = current.findIndex(
          (item) => item.id === clienteSalvo.id || item.telefone === clienteSalvo.telefone,
        );
        if (index < 0) return [clienteSalvo, ...current];

        return current.map((item, itemIndex) => (itemIndex === index ? clienteSalvo : item));
      });
      setShowClienteModal(false);
      setActive(clienteSalvo);
      setTab("perfil");
      setClienteEditando(null);
      dispatchCrmReload();
      toast.success(estavaEditando ? "Cliente atualizado" : "Cliente salvo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar cliente");
    } finally {
      setSalvandoCliente(false);
    }
  }

  async function salvarFerramentasManuais() {
    if (!active) return;

    setSalvandoManualTools(true);
    try {
      const response = await fetch("/api/crm/clientes", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: active.id,
          nome: active.nome,
          telefone: active.telefone,
          endereco: active.endereco,
          bairro: active.bairro,
          pets: active.pets,
          perfil: active.perfil,
          origem: active.origem,
          observacoes: manualTools.observacoes,
          followUpManual: {
            mensagem: manualTools.followUpMensagem,
            data: manualTools.followUpData,
            hora: manualTools.followUpHora,
            canal: manualTools.followUpCanal,
            status: manualTools.followUpStatus,
            midiaUrl: manualTools.followUpMidiaUrl,
            midiaNome: manualTools.followUpMidiaNome,
            midiaTipo: manualTools.followUpMidiaTipo,
            atualizadoEm: new Date().toISOString(),
          },
        }),
      });
      const data = (await response.json()) as Cliente | { erro?: string };
      if (!response.ok) throw new Error("erro" in data ? data.erro : "Nao foi possivel salvar");

      const clienteSalvo = data as Cliente;
      setClientesAtuais((current) =>
        current.map((item) => (item.id === clienteSalvo.id ? clienteSalvo : item)),
      );
      setActive(clienteSalvo);
      dispatchCrmReload();
      toast.success("Ferramentas manuais salvas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar ferramentas manuais");
    } finally {
      setSalvandoManualTools(false);
    }
  }

  async function excluirCliente(clienteAtual: Cliente) {
    if (excluindoCliente) return;

    const confirmado = window.confirm(`Remover ${clienteAtual.nome} do CRM?`);
    if (!confirmado) return;

    setExcluindoCliente(true);
    try {
      const response = await fetch("/api/crm/clientes", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: clienteAtual.id }),
      });
      const data = (await response.json().catch(() => ({}))) as { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Nao foi possivel remover");

      setClientesAtuais((current) => current.filter((item) => item.id !== clienteAtual.id));
      setActive(null);
      dispatchCrmReload();
      toast.success("Cliente removido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover cliente");
    } finally {
      setExcluindoCliente(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clientesAtuais.length} tutores ·{" "}
            {clientesAtuais.reduce((s, c) => s + c.pets.length, 0)} pets cadastrados
          </p>
        </div>
        <button
          onClick={abrirNovoCliente}
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="size-4" /> Novo cliente
        </button>
        <button
          onClick={sincronizarWhatsApp}
          disabled={sincronizandoWhatsapp}
          className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/80 disabled:opacity-60"
        >
          <MessageCircle className="size-4" />
          {sincronizandoWhatsapp ? "Sincronizando..." : "Sincronizar WhatsApp"}
        </button>
      </div>

      <div className="card-soft p-3 flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none"
            placeholder="Buscar por nome, pet ou telefone..."
          />
        </div>
        {["Todos", "VIP", "Premium", "Econômico", "Risco"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-10 px-3.5 rounded-lg text-sm font-medium ${filter === f ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/70"}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Cliente</th>
                <th className="font-medium px-4 py-3">Pets</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Origem</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Bairro</th>
                <th className="font-medium px-4 py-3">Ticket</th>
                <th className="font-medium px-4 py-3">Cupons</th>
                <th className="font-medium px-4 py-3">Perfil</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const ativos = cuponsAtivosPorCliente.get(c.id) || 0;
                return (
                  <tr
                    key={c.id}
                    className="border-t border-border hover:bg-secondary/30 cursor-pointer"
                    onClick={() => {
                      setActive(c);
                      setTab("perfil");
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-primary/15 text-primary font-semibold text-xs grid place-items-center">
                          {c.nome
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <div className="font-semibold">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">{c.telefone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{c.pets.map((p) => "🐾 " + p).join(", ")}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary">
                        {c.origem}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {c.bairro}
                    </td>
                    <td className="px-4 py-3 font-semibold">{brl(c.ticket)}</td>
                    <td className="px-4 py-3">
                      {ativos > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-md bg-accent/15 text-accent">
                          <Ticket className="size-3" /> {ativos}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={c.perfil} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <a
                          href={`https://wa.me/55${c.telefone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg hover:bg-success/10 text-success"
                          title="WhatsApp"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                        <a
                          href={`tel:${c.telefone.replace(/\D/g, "")}`}
                          className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                          title="Ligar"
                        >
                          <Phone className="size-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showClienteModal && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center p-4 bg-foreground/50"
          onClick={() => !salvandoCliente && fecharClienteModal()}
        >
          <div
            className="card-soft p-5 w-full max-w-lg space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <Plus className="size-4 text-primary" />{" "}
                  {clienteEditando ? "Editar cliente" : "Novo cliente"}
                </h3>
                <p className="text-xs text-muted-foreground">Cadastro salvo na base real do CRM.</p>
              </div>
              <button
                onClick={fecharClienteModal}
                disabled={salvandoCliente}
                className="p-1 rounded-lg hover:bg-secondary disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nome" full>
                <input
                  value={clienteForm.nome}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, nome: event.target.value }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
              <FormField label="Telefone">
                <input
                  value={clienteForm.telefone}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, telefone: event.target.value }))
                  }
                  placeholder="19992227919"
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
              <FormField label="Perfil">
                <select
                  value={clienteForm.perfil}
                  onChange={(event) =>
                    setClienteForm((state) => ({
                      ...state,
                      perfil: event.target.value as Cliente["perfil"],
                    }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  {(["Novo", "VIP", "Premium", "Risco"] as Cliente["perfil"][]).map((perfil) => (
                    <option key={perfil} value={perfil}>
                      {perfil}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Pets" full>
                <input
                  value={clienteForm.pets}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, pets: event.target.value }))
                  }
                  placeholder="Nomes separados por virgula"
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
              <FormField label="Endereco" full>
                <input
                  value={clienteForm.endereco}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, endereco: event.target.value }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
              <FormField label="Bairro">
                <input
                  value={clienteForm.bairro}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, bairro: event.target.value }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
              <FormField label="Origem">
                <input
                  value={clienteForm.origem}
                  onChange={(event) =>
                    setClienteForm((state) => ({ ...state, origem: event.target.value }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </FormField>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fecharClienteModal}
                disabled={salvandoCliente}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={salvarCliente}
                disabled={salvandoCliente}
                className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-60"
              >
                {salvandoCliente ? "Salvando..." : clienteEditando ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-foreground/40 backdrop-blur-sm"
          onClick={() => setActive(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col"
          >
            <div className="p-5 border-b border-border flex items-start gap-4">
              <div className="size-12 rounded-2xl bg-primary/15 grid place-items-center text-primary font-bold">
                {active.nome
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg">{active.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <MapPin className="size-3" /> {active.endereco} · {active.bairro}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{active.telefone}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge value={active.perfil} />
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary inline-flex items-center gap-1">
                    <Tag className="size-3" />
                    {active.origem}
                  </span>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="size-5" />
              </button>
            </div>

            <div className="px-5 pt-3 flex gap-2 border-b border-border">
              {(["perfil", "manual", "historico", "cupons"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-semibold capitalize border-b-2 ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                >
                  {t === "cupons"
                    ? `Cupons (${cuponsCliente.length})`
                    : t === "manual"
                      ? "Manual"
                      : t}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {tab === "perfil" && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Mini label="Total gasto" value={brl(active.totalGasto)} />
                    <Mini label="Lucro líquido" value={brl(active.lucroLiquido)} accent />
                    <Mini label="Descontos" value={brl(active.totalDescontos)} />
                    <Mini label="Ticket médio" value={brl(active.ticket)} />
                    <Mini label="Pedidos" value={String(active.pedidos)} />
                    <Mini label="Próx. recompra" value={active.proxRecompra} />
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                      Aquisição
                    </div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                      <span className="text-muted-foreground">Origem</span>
                      <span className="font-medium">{active.origem}</span>
                      {active.campanha && (
                        <>
                          <span className="text-muted-foreground">Campanha</span>
                          <span className="font-medium">{active.campanha}</span>
                        </>
                      )}
                      {active.influenciador && (
                        <>
                          <span className="text-muted-foreground">Influenciador</span>
                          <span className="font-medium">{active.influenciador}</span>
                        </>
                      )}
                      <span className="text-muted-foreground">CAC estimado</span>
                      <span className="font-medium">{brl(active.cac)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                      Pets
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {active.pets.map((p) => (
                        <div key={p} className="rounded-xl bg-secondary p-3">
                          <div className="font-semibold text-sm">🐾 {p}</div>
                          <div className="text-xs text-muted-foreground">
                            Frequência: {active.frequencia}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {tab === "historico" && (
                <div className="space-y-2">
                  <div className="text-center text-xs text-muted-foreground py-6">
                    Historico real de pedidos ainda nao carregado para este cliente.
                  </div>
                </div>
              )}

              {tab === "manual" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          Observacoes
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Bloco de notas salvo na ficha deste cliente.
                        </div>
                      </div>
                      <StickyNote className="size-5 text-primary" />
                    </div>
                    <textarea
                      value={manualTools.observacoes}
                      onChange={(event) =>
                        setManualTools((state) => ({ ...state, observacoes: event.target.value }))
                      }
                      rows={7}
                      placeholder="Ex.: prefere entrega depois das 18h, pet sensivel a frango, negociou desconto..."
                      className="w-full resize-y min-h-[160px] rounded-xl bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                  </div>

                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        Follow-up manual
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Mensagem personalizada para voce acompanhar fora da IA.
                      </div>
                    </div>
                    {(manualTools.followUpData || manualTools.followUpHora) && (
                      <div className="rounded-xl bg-primary/10 p-3 text-xs font-semibold text-primary inline-flex items-center gap-2">
                        <Clock className="size-4" />
                        Agendado para{" "}
                        {[manualTools.followUpData, manualTools.followUpHora]
                          .filter(Boolean)
                          .join(" as ")}
                      </div>
                    )}
                    <textarea
                      value={manualTools.followUpMensagem}
                      onChange={(event) =>
                        setManualTools((state) => ({
                          ...state,
                          followUpMensagem: event.target.value,
                        }))
                      }
                      rows={4}
                      placeholder="Ex.: chamar para confirmar se ainda precisa da racao Golden adulto 15kg."
                      className="w-full resize-y min-h-[100px] rounded-xl bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                    <div className="grid sm:grid-cols-4 gap-3">
                      <FormField label="Data">
                        <input
                          type="date"
                          value={manualTools.followUpData}
                          onChange={(event) =>
                            setManualTools((state) => ({
                              ...state,
                              followUpData: event.target.value,
                            }))
                          }
                          className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                        />
                      </FormField>
                      <FormField label="Horario">
                        <input
                          type="time"
                          value={manualTools.followUpHora}
                          onChange={(event) =>
                            setManualTools((state) => ({
                              ...state,
                              followUpHora: event.target.value,
                            }))
                          }
                          className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                        />
                      </FormField>
                      <FormField label="Canal">
                        <select
                          value={manualTools.followUpCanal}
                          onChange={(event) =>
                            setManualTools((state) => ({
                              ...state,
                              followUpCanal: event.target
                                .value as ManualToolsState["followUpCanal"],
                            }))
                          }
                          className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                        >
                          {(["WhatsApp", "Ligacao", "Presencial", "Outro"] as const).map(
                            (canal) => (
                              <option key={canal} value={canal}>
                                {canal}
                              </option>
                            ),
                          )}
                        </select>
                      </FormField>
                      <FormField label="Status">
                        <select
                          value={manualTools.followUpStatus}
                          onChange={(event) =>
                            setManualTools((state) => ({
                              ...state,
                              followUpStatus: event.target
                                .value as ManualToolsState["followUpStatus"],
                            }))
                          }
                          className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                        >
                          <option value="pendente">Pendente</option>
                          <option value="feito">Feito</option>
                        </select>
                      </FormField>
                    </div>
                    <div className="rounded-xl border border-border p-3 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        <Link className="size-4 text-primary" />
                        Midia do follow-up
                      </div>
                      <FormField label="URL da midia" full>
                        <input
                          value={manualTools.followUpMidiaUrl}
                          onChange={(event) =>
                            setManualTools((state) => ({
                              ...state,
                              followUpMidiaUrl: event.target.value,
                            }))
                          }
                          placeholder="https://..."
                          className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                        />
                      </FormField>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <FormField label="Nome do arquivo">
                          <input
                            value={manualTools.followUpMidiaNome}
                            onChange={(event) =>
                              setManualTools((state) => ({
                                ...state,
                                followUpMidiaNome: event.target.value,
                              }))
                            }
                            placeholder="Ex: foto-produto.jpg"
                            className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                          />
                        </FormField>
                        <FormField label="Tipo">
                          <select
                            value={manualTools.followUpMidiaTipo}
                            onChange={(event) =>
                              setManualTools((state) => ({
                                ...state,
                                followUpMidiaTipo: event.target.value,
                              }))
                            }
                            className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                          >
                            <option value="">Sem tipo</option>
                            <option value="image">Imagem</option>
                            <option value="video">Video</option>
                            <option value="audio">Audio</option>
                            <option value="document">Documento</option>
                          </select>
                        </FormField>
                      </div>
                      {manualTools.followUpMidiaUrl && (
                        <a
                          href={manualTools.followUpMidiaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <Link className="size-3.5" />
                          Abrir midia cadastrada
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={salvarFerramentasManuais}
                    disabled={salvandoManualTools}
                    className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Save className="size-4" />
                    {salvandoManualTools ? "Salvando..." : "Salvar ferramentas manuais"}
                  </button>
                </div>
              )}

              {tab === "cupons" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {cuponsCliente.length} cupons no histórico
                    </div>
                    <button
                      onClick={() => setShowCupomModal(true)}
                      className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Plus className="size-3.5" /> Gerar cupom
                    </button>
                  </div>
                  {cuponsCliente.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      Nenhum cupom ainda
                    </div>
                  )}
                  {cuponsCliente.map((cp) => (
                    <div
                      key={cp.id}
                      className="p-3 rounded-xl border border-border flex items-center gap-3"
                    >
                      <div className="size-10 rounded-xl bg-accent/15 text-accent grid place-items-center">
                        <Ticket className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm">{cp.codigo}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${STATUS_TONE[cp.status]}`}
                          >
                            {cp.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {cp.tipo === "percentual"
                            ? `${cp.desconto}% OFF`
                            : `${brl(cp.desconto)} OFF`}
                          {" · criado "}
                          {cp.criadoEm}
                          {cp.usadoEm && ` · usado ${cp.usadoEm}`}
                          {cp.expiradoEm && ` · expirou ${cp.expiradoEm}`}
                        </div>
                        {cp.motivoEnvio && (
                          <div className="text-[11px] text-muted-foreground/80 italic mt-0.5">
                            ↳ {cp.motivoEnvio}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex flex-wrap gap-2">
              <a
                href={`https://wa.me/55${active.telefone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-[140px] h-10 px-4 rounded-xl bg-success text-success-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <button
                onClick={() => abrirPedidoNoPdv(active)}
                className="flex-1 min-w-[140px] h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <ShoppingBag className="size-4" /> Adicionar pedido
              </button>
              <button
                onClick={() => setShowCupomModal(true)}
                className="h-10 px-4 rounded-xl bg-accent/15 text-accent text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Ticket className="size-4" /> Gerar cupom
              </button>
              <button
                onClick={() => abrirEdicaoCliente(active)}
                className="h-10 px-4 rounded-xl bg-secondary text-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Pencil className="size-4" /> Editar
              </button>
              <button
                onClick={() => excluirCliente(active)}
                disabled={excluindoCliente}
                className="h-10 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Trash2 className="size-4" /> {excluindoCliente ? "Removendo..." : "Remover"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCupomModal && active && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center p-4 bg-foreground/50"
          onClick={() => setShowCupomModal(false)}
        >
          <div
            className="card-soft p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <Ticket className="size-4 text-accent" /> Novo cupom
                </h3>
                <p className="text-xs text-muted-foreground">para {active.nome}</p>
              </div>
              <button
                onClick={() => setShowCupomModal(false)}
                className="p-1 rounded-lg hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">
                Tipo
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["percentual", "fixo"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCupomTipo(t)}
                    className={`h-10 rounded-xl text-sm font-semibold capitalize ${cupomTipo === t ? "bg-foreground text-background" : "bg-secondary"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">
                  Desconto {cupomTipo === "percentual" ? "(%)" : "(R$)"}
                </div>
                <input
                  type="number"
                  value={cupomValor}
                  onChange={(e) => setCupomValor(Number(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none"
                />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">
                  Validade (dias)
                </div>
                <input
                  type="number"
                  value={cupomDias}
                  onChange={(e) => setCupomDias(Number(e.target.value) || 0)}
                  className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCupomModal(false)}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={gerarCupom}
                className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold"
              >
                Gerar cupom
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-success/10" : "bg-secondary"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${accent ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}

function FormField({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}
