import type { Cliente } from "@/lib/mock";
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { Route } from "@/routes/clientes";
import { onCrmReload } from "@/lib/crm-refresh";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const perfisCliente: Cliente["perfil"][] = ["Novo", "VIP", "Premium", "Econômico", "Risco"];

type ClienteForm = {
  id?: string;
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  pets: string;
  perfil: Cliente["perfil"];
  origem: string;
};

function formFromCliente(cliente?: Cliente | null): ClienteForm {
  return {
    id: cliente?.id,
    nome: cliente?.nome ?? "",
    telefone: cliente?.telefone ?? "",
    endereco: cliente?.endereco ?? "",
    bairro: cliente?.bairro ?? "",
    pets: cliente?.pets.join(", ") ?? "",
    perfil: cliente?.perfil ?? "Novo",
    origem: cliente?.origem ?? "CRM manual",
  };
}

export function Clientes() {
  const loaderData = Route.useLoaderData();
  const [clientes, setClientes] = useState<Cliente[]>(loaderData ?? []);
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Cliente | null>(null);
  const [tab, setTab] = useState<"perfil" | "historico">("perfil");
  const [form, setForm] = useState<ClienteForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (loaderData) setClientes(loaderData);
  }, [loaderData]);

  useEffect(() => {
    async function carregarClientes() {
      try {
        const response = await fetch("/api/crm/clientes", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as Cliente[];
        if (Array.isArray(data)) setClientes(data);
      } catch (error) {
        console.error("Erro ao atualizar clientes:", error);
      }
    }

    void carregarClientes();
    return onCrmReload(() => void carregarClientes());
  }, []);

  const list = clientes.filter((c) => {
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

  async function salvarCliente(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch("/api/crm/clientes", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          pets: form.pets
            .split(",")
            .map((pet) => pet.trim())
            .filter(Boolean),
        }),
      });
      const payload = (await response.json()) as Cliente & { erro?: string };
      if (!response.ok) throw new Error(payload.erro ?? "Erro ao salvar cliente");

      setClientes((current) =>
        form.id
          ? current.map((cliente) => (cliente.id === payload.id ? payload : cliente))
          : [...current, payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
      setActive((current) => (current?.id === payload.id ? payload : current));
      setForm(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clientes.length} tutores · {clientes.reduce((s, c) => s + c.pets.length, 0)} pets
            cadastrados
          </p>
        </div>
        <button
          onClick={() => setForm(formFromCliente())}
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="size-4" /> Novo cliente
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
                <th className="font-medium px-4 py-3">Perfil</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              {(["perfil", "historico"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-semibold capitalize border-b-2 ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {tab === "perfil" ? (
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
                      {active.cupom && (
                        <>
                          <span className="text-muted-foreground">Cupom</span>
                          <span className="font-medium">{active.cupom}</span>
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
              ) : (
                <div className="space-y-2">
                  {([] as { d: string; t: string; v: number }[]).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                      <div className="size-8 rounded-lg bg-primary/15 grid place-items-center text-primary">
                        <History className="size-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{h.t}</div>
                        <div className="text-[11px] text-muted-foreground">{h.d}</div>
                      </div>
                      {h.v > 0 && <span className="font-semibold text-sm">{brl(h.v)}</span>}
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
              <a
                href="/pedidos"
                className="flex-1 min-w-[140px] h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <ShoppingBag className="size-4" /> Adicionar pedido
              </a>
              <button
                onClick={() => setForm(formFromCliente(active))}
                className="h-10 px-4 rounded-xl bg-secondary text-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Pencil className="size-4" /> Editar
              </button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div
          className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setForm(null)}
        >
          <form
            onSubmit={(event) => void salvarCliente(event)}
            onClick={(event) => event.stopPropagation()}
            className="bg-card w-full md:max-w-xl md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-5 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{form.id ? "Editar cliente" : "Novo cliente"}</h2>
                <p className="text-xs text-muted-foreground">
                  Cadastro usado no CRM e nos pedidos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="p-2 rounded-lg hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 grid md:grid-cols-2 gap-3">
              <Field
                label="Nome"
                value={form.nome}
                onChange={(nome) => setForm({ ...form, nome })}
                required
              />
              <Field
                label="Telefone"
                value={form.telefone}
                onChange={(telefone) => setForm({ ...form, telefone })}
                required
              />
              <Field
                label="Endereco"
                value={form.endereco}
                onChange={(endereco) => setForm({ ...form, endereco })}
              />
              <Field
                label="Bairro"
                value={form.bairro}
                onChange={(bairro) => setForm({ ...form, bairro })}
              />
              <Field
                label="Pets"
                value={form.pets}
                onChange={(pets) => setForm({ ...form, pets })}
                placeholder="Luna, Theo"
              />
              <Field
                label="Origem"
                value={form.origem}
                onChange={(origem) => setForm({ ...form, origem })}
              />
              <label className="text-xs font-semibold text-muted-foreground grid gap-1">
                Perfil
                <select
                  value={form.perfil}
                  onChange={(event) =>
                    setForm({ ...form, perfil: event.target.value as Cliente["perfil"] })
                  }
                  className="h-10 rounded-lg bg-secondary px-3 text-sm text-foreground outline-none"
                >
                  {perfisCliente.map((perfil) => (
                    <option key={perfil}>{perfil}</option>
                  ))}
                </select>
              </label>
              {formError && (
                <div className="md:col-span-2 text-sm text-destructive">{formError}</div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={saving}
                className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Salvando" : "Salvar cliente"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-semibold text-muted-foreground grid gap-1">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="h-10 rounded-lg bg-secondary px-3 text-sm text-foreground outline-none"
      />
    </label>
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
