import type { Cliente, PetDetalhe } from "@/lib/crm-types";
import {
  Cat,
  Check,
  Dog,
  Loader2,
  MapPin,
  MessageCircle,
  PawPrint,
  Phone,
  Plus,
  Search,
  UserRound,
  Weight,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type PetListItem = {
  id: string;
  pet: PetDetalhe;
  cliente: Cliente;
};

const ESPECIES = ["Todos", "Cachorro", "Gato", "Sem especie"] as const;

type EspecieFiltro = (typeof ESPECIES)[number];
type PetDraft = {
  nome: string;
  nascimento: string;
  especie: "" | "cachorro" | "gato";
  raca: string;
  porte: "" | "pequeno" | "medio" | "grande";
  pesoKg: string;
  observacao: string;
};

type PetForm = {
  tutorId: string;
  tutorNome: string;
  telefone: string;
  telefoneDesconhecido: boolean;
  pets: PetDraft[];
};

function petDraftVazio(): PetDraft {
  return {
    nome: "",
    nascimento: "",
    especie: "",
    raca: "",
    porte: "",
    pesoKg: "",
    observacao: "",
  };
}

const PET_FORM_INICIAL: PetForm = {
  tutorId: "",
  tutorNome: "",
  telefone: "",
  telefoneDesconhecido: false,
  pets: [petDraftVazio()],
};

function petsDoCliente(cliente: Cliente): PetDetalhe[] {
  const detalhes: PetDetalhe[] = cliente.petsDetalhes?.length
    ? cliente.petsDetalhes
    : cliente.pets.map((nome) => ({ nome }));

  return detalhes.filter((pet) =>
    Boolean(
      pet.nome ||
      pet.especie ||
      pet.raca ||
      pet.porte ||
      pet.pesoKg ||
      pet.idade ||
      pet.nascimento ||
      pet.observacao,
    ),
  );
}

function montarPets(clientes: Cliente[]): PetListItem[] {
  return clientes.flatMap((cliente) =>
    petsDoCliente(cliente).map((pet, index) => ({
      id: `${cliente.id}-${pet.nome || pet.especie || "pet"}-${index}`,
      pet,
      cliente,
    })),
  );
}

function petNome(pet: PetDetalhe): string {
  return pet.nome || pet.especie || "Pet sem nome";
}

function detalhesPet(pet: PetDetalhe): string {
  return [
    pet.especie,
    pet.raca,
    pet.porte ? `porte ${pet.porte}` : null,
    pet.pesoKg ? `${pet.pesoKg} kg` : null,
    pet.idade,
    pet.nascimento ? `nasc. ${pet.nascimento}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function especieLabel(pet: PetDetalhe): EspecieFiltro {
  if (pet.especie === "cachorro") return "Cachorro";
  if (pet.especie === "gato") return "Gato";
  return "Sem especie";
}

function especieIcon(pet: PetDetalhe) {
  if (pet.especie === "cachorro") return <Dog className="size-4" />;
  if (pet.especie === "gato") return <Cat className="size-4" />;
  return <PawPrint className="size-4" />;
}

function telefoneLabel(telefone: string): string {
  return telefone?.trim() || "Sem telefone";
}

function nomesPetsTutor(cliente: Cliente): string {
  const nomes = petsDoCliente(cliente)
    .map((pet) => petNome(pet))
    .filter(Boolean);

  return nomes.length ? nomes.slice(0, 3).join(", ") : "Sem pets";
}

export function Pets({ clientes }: { clientes: Cliente[] }) {
  const [clientesAtuais, setClientesAtuais] = useState<Cliente[]>(clientes);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EspecieFiltro>("Todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PetForm>(PET_FORM_INICIAL);
  const [buscaTutor, setBuscaTutor] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregarClientes() {
      const response = await fetch("/api/crm/clientes", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) return;

      const data = (await response.json()) as Cliente[];
      if (ativo) setClientesAtuais(data);
    }

    void carregarClientes();

    return () => {
      ativo = false;
    };
  }, []);

  const todosPets = useMemo(() => montarPets(clientesAtuais), [clientesAtuais]);

  const pets = useMemo(() => {
    const termo = search.trim().toLowerCase();

    return todosPets.filter(({ pet, cliente }) => {
      const especie = especieLabel(pet);
      if (filter !== "Todos" && especie !== filter) return false;
      if (!termo) return true;

      return [
        pet.nome,
        pet.nascimento,
        pet.especie,
        pet.raca,
        pet.porte,
        pet.idade,
        pet.observacao,
        cliente.nome,
        cliente.telefone,
        cliente.bairro,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo));
    });
  }, [filter, search, todosPets]);

  const resumo = useMemo(
    () => ({
      total: todosPets.length,
      cachorros: todosPets.filter(({ pet }) => pet.especie === "cachorro").length,
      gatos: todosPets.filter(({ pet }) => pet.especie === "gato").length,
      tutores: new Set(todosPets.map(({ cliente }) => cliente.id)).size,
    }),
    [todosPets],
  );

  const tutoresFiltrados = useMemo(() => {
    const termo = buscaTutor.trim().toLowerCase();
    if (!termo) return clientesAtuais.slice(0, 8);
    return clientesAtuais
      .filter((cliente) =>
        [cliente.nome, cliente.telefone, cliente.bairro, cliente.pets?.join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(termo),
      )
      .slice(0, 8);
  }, [buscaTutor, clientesAtuais]);

  const tutorSelecionado = useMemo(
    () => clientesAtuais.find((cliente) => cliente.id === form.tutorId) ?? null,
    [clientesAtuais, form.tutorId],
  );

  function updateForm(patch: Partial<PetForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function atualizarPetForm(index: number, patch: Partial<PetDraft>) {
    setForm((current) => ({
      ...current,
      pets: current.pets.map((pet, petIndex) => (petIndex === index ? { ...pet, ...patch } : pet)),
    }));
  }

  function adicionarPetForm() {
    setForm((current) => ({
      ...current,
      pets: [...current.pets, petDraftVazio()],
    }));
  }

  function removerPetForm(index: number) {
    setForm((current) => {
      const pets = current.pets.filter((_, petIndex) => petIndex !== index);
      return { ...current, pets: pets.length ? pets : [petDraftVazio()] };
    });
  }

  function selecionarTutor(cliente: Cliente) {
    updateForm({ tutorId: cliente.id, tutorNome: cliente.nome, telefone: cliente.telefone });
    setBuscaTutor("");
  }

  function alternarFormularioPet() {
    setShowForm((value) => {
      const next = !value;
      if (next) {
        requestAnimationFrame(() => {
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      return next;
    });
  }

  function petsNovos(): PetDetalhe[] {
    return form.pets
      .map((pet) => ({
        nome: pet.nome.trim(),
        nascimento: pet.nascimento.trim() || undefined,
        especie: pet.especie || undefined,
        raca: pet.raca.trim() || undefined,
        porte: pet.porte || undefined,
        pesoKg: pet.pesoKg.trim() ? Number(pet.pesoKg.replace(",", ".")) || undefined : undefined,
        observacao: pet.observacao.trim() || undefined,
      }))
      .filter(
        (pet) =>
          pet.nome ||
          pet.nascimento ||
          pet.raca ||
          pet.especie ||
          pet.porte ||
          pet.pesoKg ||
          pet.observacao,
      );
  }

  async function salvarPetRapido() {
    const tutorNome = form.tutorNome.trim();
    const telefone = form.telefoneDesconhecido
      ? `000${Date.now()}`
      : form.telefone.replace(/\D/g, "");
    const novos = petsNovos();
    if (!tutorNome) {
      toast.error("Informe ou selecione o tutor");
      return;
    }
    if (!form.telefoneDesconhecido && telefone.length < 8) {
      toast.error("Informe um telefone valido ou marque telefone desconhecido");
      return;
    }
    if (
      novos.length === 0 ||
      !novos.some((pet) => pet.nome || pet.nascimento || pet.raca || pet.especie)
    ) {
      toast.error("Informe pelo menos um dado do pet");
      return;
    }

    setSaving(true);
    try {
      const tutor = clientesAtuais.find((cliente) => cliente.id === form.tutorId);
      const payload = {
        id: tutor?.id,
        nome: tutor?.nome || tutorNome,
        telefone: tutor?.telefone || telefone,
        endereco: tutor?.endereco || "",
        bairro: tutor?.bairro || "",
        perfil: tutor?.perfil || "Novo",
        origem: tutor?.origem || "Pets",
        observacoes: tutor?.observacoes || "",
        pets: [...(tutor?.pets ?? []), ...novos.map((pet) => pet.nome).filter(Boolean)],
        petsDetalhes: [...(tutor?.petsDetalhes ?? []), ...novos],
      };
      const response = await fetch("/api/crm/clientes", {
        method: tutor ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as Cliente | { erro?: string };
      if (!response.ok || !("id" in data)) {
        throw new Error("erro" in data ? data.erro : "Falha ao salvar pet");
      }
      setClientesAtuais((current) => {
        const exists = current.some((cliente) => cliente.id === data.id);
        return exists
          ? current.map((cliente) => (cliente.id === data.id ? data : cliente))
          : [...current, data].sort((a, b) => a.nome.localeCompare(b.nome));
      });
      setForm(PET_FORM_INICIAL);
      setBuscaTutor("");
      setShowForm(false);
      toast.success(novos.length > 1 ? "Pets cadastrados" : "Pet cadastrado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar pet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Pets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todos os pets cadastrados, sempre vinculados ao tutor.
          </p>
        </div>
        <a
          href="/clientes"
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <UserRound className="size-4" /> Abrir clientes
        </a>
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return;
            event.preventDefault();
            alternarFormularioPet();
          }}
          onClick={() => alternarFormularioPet()}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <Plus className="size-4" /> Cadastrar pet
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className="card-soft overflow-hidden scroll-mt-4">
          <div className="border-b border-border bg-secondary/40 px-4 py-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-bold">Cadastrar pet</h2>
                <p className="text-xs text-muted-foreground">
                  Primeiro encontre o tutor pelo nome ou telefone, depois complete os dados do pet.
                </p>
              </div>
              {tutorSelecionado && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-xs font-bold text-primary">
                  <Check className="size-4" />
                  Tutor selecionado
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(320px,0.9fr)_1.4fr]">
            <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
              <div className="space-y-3">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Buscar tutor existente
                  </span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={buscaTutor}
                      onChange={(event) => setBuscaTutor(event.target.value)}
                      className="input h-11 pl-9"
                      placeholder="Digite nome, telefone, bairro ou pet"
                    />
                  </div>
                </label>

                <div className="max-h-[276px] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                  {tutoresFiltrados.map((cliente) => (
                    <TutorOption
                      key={cliente.id}
                      cliente={cliente}
                      selected={form.tutorId === cliente.id}
                      onSelect={() => selecionarTutor(cliente)}
                    />
                  ))}
                  {tutoresFiltrados.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                      Nenhum tutor encontrado. Preencha os dados abaixo para criar um novo.
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
                  Se o tutor nao aparecer, o cadastro sera criado com o nome e telefone informados
                  aqui.
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Nome do tutor
                  </span>
                  <input
                    value={form.tutorNome}
                    onChange={(event) => updateForm({ tutorNome: event.target.value, tutorId: "" })}
                    className="input h-11"
                    placeholder="Ex.: Adriana Silva"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Telefone do tutor
                  </span>
                  <input
                    value={form.telefone}
                    onChange={(event) => updateForm({ telefone: event.target.value, tutorId: "" })}
                    disabled={form.telefoneDesconhecido}
                    className="input h-11 disabled:opacity-50"
                    placeholder="47 99999-9999"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={form.telefoneDesconhecido}
                  onChange={(event) =>
                    updateForm({
                      telefoneDesconhecido: event.target.checked,
                      telefone: event.target.checked ? "" : form.telefone,
                      tutorId: event.target.checked ? "" : form.tutorId,
                    })
                  }
                  className="size-4 accent-primary"
                />
                Tutor ainda nao informou telefone
              </label>

              {tutorSelecionado && (
                <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs sm:grid-cols-3">
                  <Mini label="Tutor" value={tutorSelecionado.nome} />
                  <Mini label="Telefone" value={telefoneLabel(tutorSelecionado.telefone)} />
                  <Mini label="Pets atuais" value={nomesPetsTutor(tutorSelecionado)} />
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Pets deste tutor
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Cadastre um ou varios pets na mesma ficha.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={adicionarPetForm}
                    className="h-9 rounded-lg bg-secondary px-3 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-secondary/80"
                  >
                    <Plus className="size-3.5" /> Adicionar pet
                  </button>
                </div>

                {form.pets.map((pet, index) => (
                  <div key={index} className="rounded-xl border border-border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-foreground">Pet {index + 1}</div>
                      {form.pets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerPetForm(index)}
                          className="grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/15"
                          title="Remover pet"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <PetInput
                        label="Nome do pet"
                        value={pet.nome}
                        onChange={(nome) => atualizarPetForm(index, { nome })}
                      />
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          Data de nascimento
                        </span>
                        <input
                          type="date"
                          value={pet.nascimento}
                          onChange={(event) =>
                            atualizarPetForm(index, { nascimento: event.target.value })
                          }
                          className="input h-11"
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          Especie
                        </span>
                        <select
                          value={pet.especie}
                          onChange={(event) =>
                            atualizarPetForm(index, {
                              especie: event.target.value as PetDraft["especie"],
                            })
                          }
                          className="input h-11"
                        >
                          <option value="">Nao sei</option>
                          <option value="cachorro">Cachorro</option>
                          <option value="gato">Gato</option>
                        </select>
                      </label>
                      <PetInput
                        label="Raca"
                        value={pet.raca}
                        onChange={(raca) => atualizarPetForm(index, { raca })}
                      />
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          Porte
                        </span>
                        <select
                          value={pet.porte}
                          onChange={(event) =>
                            atualizarPetForm(index, {
                              porte: event.target.value as PetDraft["porte"],
                            })
                          }
                          className="input h-11"
                        >
                          <option value="">Nao sei</option>
                          <option value="pequeno">Pequeno</option>
                          <option value="medio">Medio</option>
                          <option value="grande">Grande</option>
                        </select>
                      </label>
                      <PetInput
                        label="Peso aprox."
                        value={pet.pesoKg}
                        onChange={(pesoKg) => atualizarPetForm(index, { pesoKg })}
                      />
                    </div>
                    <textarea
                      value={pet.observacao}
                      onChange={(event) =>
                        atualizarPetForm(index, { observacao: event.target.value })
                      }
                      className="input min-h-20"
                      placeholder="Ex.: sensivel a frango, porte grande, peso aproximado..."
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void salvarPetRapido()}
                disabled={saving}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:opacity-50 sm:w-auto"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {form.pets.length > 1 ? "Salvar pets" : "Salvar pet"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ResumoCard icon={<PawPrint />} label="Pets cadastrados" value={String(resumo.total)} />
        <ResumoCard icon={<Dog />} label="Cachorros" value={String(resumo.cachorros)} />
        <ResumoCard icon={<Cat />} label="Gatos" value={String(resumo.gatos)} />
        <ResumoCard icon={<UserRound />} label="Tutores com pets" value={String(resumo.tutores)} />
      </div>

      <div className="card-soft p-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:min-w-[220px] sm:flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none"
            placeholder="Buscar pet, tutor, telefone, raca ou bairro..."
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {ESPECIES.map((especie) => (
            <button
              key={especie}
              onClick={() => setFilter(especie)}
              className={`h-10 shrink-0 px-3.5 rounded-lg text-sm font-medium ${
                filter === especie
                  ? "bg-foreground text-background"
                  : "bg-secondary hover:bg-secondary/70"
              }`}
            >
              {especie}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground px-1">
        {pets.length} de {todosPets.length} pets exibidos
      </div>

      <div className="grid gap-3 md:hidden">
        {pets.length === 0 ? (
          <EmptyState />
        ) : (
          pets.map((item) => <PetMobileCard key={item.id} item={item} />)
        )}
      </div>

      <div className="card-soft hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Pet</th>
                <th className="font-medium px-4 py-3">Tutor</th>
                <th className="font-medium px-4 py-3">Detalhes</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Observacao</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pets.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                pets.map((item) => <PetRow key={item.id} item={item} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResumoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card-soft p-4">
      <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center [&_svg]:size-4">
        {icon}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-0.5 tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

function PetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input h-10"
      />
    </label>
  );
}

function TutorOption({
  cliente,
  selected,
  onSelect,
}: {
  cliente: Cliente;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 ${
        selected ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{cliente.nome || "Tutor sem nome"}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Phone className="size-3.5 text-primary" />
              {telefoneLabel(cliente.telefone)}
            </span>
            {cliente.bairro && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {cliente.bairro}
              </span>
            )}
          </div>
          <div className="mt-2 truncate text-[11px] text-muted-foreground">
            Pets: {nomesPetsTutor(cliente)}
          </div>
        </div>
        <div
          className={`grid size-6 shrink-0 place-items-center rounded-full border ${
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}
        >
          {selected && <Check className="size-3.5" />}
        </div>
      </div>
    </button>
  );
}

function PetAvatar({ pet }: { pet: PetDetalhe }) {
  return (
    <div className="size-9 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0">
      {especieIcon(pet)}
    </div>
  );
}

function PetRow({ item }: { item: PetListItem }) {
  const detalhes = detalhesPet(item.pet);

  return (
    <tr className="border-t border-border hover:bg-secondary/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <PetAvatar pet={item.pet} />
          <div className="min-w-0">
            <div className="font-semibold truncate max-w-[220px]">{petNome(item.pet)}</div>
            <div className="text-xs text-muted-foreground">{especieLabel(item.pet)}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium">{item.cliente.nome}</div>
        <div className="text-xs text-muted-foreground">{item.cliente.telefone}</div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{detalhes || "Sem detalhes"}</td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[260px]">
        <div className="truncate">
          {item.pet.observacao || item.cliente.bairro || "Sem registro"}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex gap-1">
          <a
            href={`tel:${item.cliente.telefone.replace(/\D/g, "")}`}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
            title="Ligar"
          >
            <Phone className="size-4" />
          </a>
          <a
            href={`https://wa.me/55${item.cliente.telefone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        </div>
      </td>
    </tr>
  );
}

function PetMobileCard({ item }: { item: PetListItem }) {
  const detalhes = detalhesPet(item.pet);

  return (
    <div className="card-soft p-4">
      <div className="flex items-start gap-3">
        <PetAvatar pet={item.pet} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{petNome(item.pet)}</div>
              <div className="text-xs text-muted-foreground">{especieLabel(item.pet)}</div>
            </div>
            {item.pet.pesoKg && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                <Weight className="size-3" /> {item.pet.pesoKg} kg
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Mini label="Tutor" value={item.cliente.nome} />
            <Mini label="Telefone" value={item.cliente.telefone} />
            <Mini label="Detalhes" value={detalhes || "Sem detalhes"} />
            <Mini label="Bairro" value={item.cliente.bairro || "Sem bairro"} />
          </div>
          {item.pet.observacao && (
            <div className="mt-3 rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
              {item.pet.observacao}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-2 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-semibold">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
      Nenhum pet encontrado.
    </div>
  );
}
