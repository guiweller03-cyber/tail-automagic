import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Plus,
  Pin,
  PinOff,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import type { NotaGeral } from "@/lib/notas-supabase";

const API_URL = "/api/crm/notas";

type ApiError = { ok?: false; erro?: string };

type NotaForm = {
  titulo: string;
  conteudo: string;
  categoria: string;
  fixada: boolean;
};

function emptyForm(): NotaForm {
  return {
    titulo: "Nova nota",
    conteudo: "",
    categoria: "",
    fixada: false,
  };
}

function formFromNota(nota: NotaGeral | null): NotaForm {
  if (!nota) return emptyForm();
  return {
    titulo: nota.titulo,
    conteudo: nota.conteudo,
    categoria: nota.categoria ?? "",
    fixada: nota.fixada,
  };
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
  if (!response.ok) throw new Error(parseError(body, fallback));
  return body as T;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || "Sem conteudo ainda.";
}

export function NotasGerais({ notasIniciais }: { notasIniciais: NotaGeral[] }) {
  const [notas, setNotas] = useState<NotaGeral[]>(notasIniciais);
  const [activeId, setActiveId] = useState(notasIniciais[0]?.id ?? "");
  const [form, setForm] = useState<NotaForm>(() => formFromNota(notasIniciais[0] ?? null));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const active = notas.find((nota) => nota.id === activeId) ?? null;

  useEffect(() => {
    if (!activeId && notas[0]) {
      setActiveId(notas[0].id);
      setForm(formFromNota(notas[0]));
      setDirty(false);
    }
  }, [activeId, notas]);

  const filteredNotas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notas;

    return notas.filter((nota) => {
      return (
        nota.titulo.toLowerCase().includes(q) ||
        nota.conteudo.toLowerCase().includes(q) ||
        (nota.categoria ?? "").toLowerCase().includes(q)
      );
    });
  }, [notas, query]);

  async function loadNotas() {
    setLoading(true);
    try {
      const response = await fetch(API_URL, { cache: "no-store" });
      const data = await readJson<NotaGeral[]>(response, "Falha ao carregar notas");
      setNotas(data);
      const nextActive = data.find((nota) => nota.id === activeId) ?? data[0] ?? null;
      setActiveId(nextActive?.id ?? "");
      setForm(formFromNota(nextActive));
      setDirty(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar notas");
    } finally {
      setLoading(false);
    }
  }

  function updateForm(patch: Partial<NotaForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  function selectNota(nota: NotaGeral) {
    if (dirty && !window.confirm("Voce tem alteracoes nao salvas. Trocar de nota mesmo assim?")) {
      return;
    }

    setActiveId(nota.id);
    setForm(formFromNota(nota));
    setDirty(false);
  }

  async function novaNota() {
    if (dirty && !window.confirm("Voce tem alteracoes nao salvas. Criar outra nota mesmo assim?")) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyForm()),
      });
      const nota = await readJson<NotaGeral>(response, "Falha ao criar nota");
      setNotas((current) => [nota, ...current]);
      setActiveId(nota.id);
      setForm(formFromNota(nota));
      setDirty(false);
      toast.success("Nota criada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar nota");
    } finally {
      setSaving(false);
    }
  }

  async function salvarNota() {
    if (!active) return;
    setSaving(true);
    try {
      const response = await fetch(API_URL, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: active.id, ...form }),
      });
      const nota = await readJson<NotaGeral>(response, "Falha ao salvar nota");
      setNotas((current) =>
        [nota, ...current.filter((item) => item.id !== nota.id)].sort((a, b) => {
          if (a.fixada !== b.fixada) return a.fixada ? -1 : 1;
          return new Date(b.atualizado_em).getTime() - new Date(a.atualizado_em).getTime();
        }),
      );
      setActiveId(nota.id);
      setForm(formFromNota(nota));
      setDirty(false);
      toast.success("Nota salva");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar nota");
    } finally {
      setSaving(false);
    }
  }

  async function excluirNota() {
    if (!active) return;
    if (!window.confirm(`Excluir a nota "${active.titulo}"?`)) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}?id=${encodeURIComponent(active.id)}`, {
        method: "DELETE",
      });
      await readJson<{ ok: true }>(response, "Falha ao excluir nota");

      const remaining = notas.filter((nota) => nota.id !== active.id);
      const next = remaining[0] ?? null;
      setNotas(remaining);
      setActiveId(next?.id ?? "");
      setForm(formFromNota(next));
      setDirty(false);
      toast.success("Nota excluida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir nota");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <FileText className="size-6 text-primary" /> Observacoes gerais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Um bloco de notas geral do CRM, salvo fora da ficha dos clientes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadNotas()}
            disabled={loading}
            className="h-10 px-3 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => void novaNota()}
            disabled={saving}
            className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Plus className="size-4" /> Nova nota
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[360px_1fr] gap-4">
        <section className="card-soft overflow-hidden min-h-[68vh] flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar nas notas..."
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none focus:bg-card border border-transparent focus:border-primary"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-border">
            {filteredNotas.map((nota) => (
              <button
                type="button"
                key={nota.id}
                onClick={() => selectNota(nota)}
                className={`w-full text-left p-4 hover:bg-secondary/60 transition ${
                  nota.id === activeId ? "bg-primary/10" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {nota.fixada ? <Pin className="size-4 text-primary mt-0.5 shrink-0" /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{nota.titulo}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {previewText(nota.conteudo)}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                      <span>{dateLabel(nota.atualizado_em)}</span>
                      {nota.categoria ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-secondary text-foreground">
                          {nota.categoria}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {!loading && filteredNotas.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma nota encontrada.
              </div>
            ) : null}
          </div>
        </section>

        <section className="card-soft min-h-[68vh] flex flex-col">
          {active ? (
            <>
              <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
                <input
                  value={form.titulo}
                  onChange={(event) => updateForm({ titulo: event.target.value })}
                  className="flex-1 min-w-[220px] h-11 bg-transparent text-xl font-bold outline-none"
                  placeholder="Titulo da nota"
                />
                <input
                  value={form.categoria}
                  onChange={(event) => updateForm({ categoria: event.target.value })}
                  className="h-10 w-40 px-3 rounded-xl bg-secondary text-sm outline-none border border-transparent focus:border-primary"
                  placeholder="Categoria"
                />
                <button
                  type="button"
                  onClick={() => updateForm({ fixada: !form.fixada })}
                  className="h-10 px-3 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70"
                  title={form.fixada ? "Desafixar nota" : "Fixar nota"}
                >
                  {form.fixada ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  {form.fixada ? "Fixada" : "Fixar"}
                </button>
              </div>

              <textarea
                value={form.conteudo}
                onChange={(event) => updateForm({ conteudo: event.target.value })}
                className="flex-1 min-h-[420px] w-full resize-none bg-card px-5 py-4 text-sm leading-7 outline-none"
                placeholder="Escreva livremente aqui..."
              />

              <div className="p-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {dirty ? "Alteracoes nao salvas" : `Salvo em ${dateLabel(active.atualizado_em)}`}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void excluirNota()}
                    disabled={saving}
                    className="h-10 px-3 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold inline-flex items-center gap-2 hover:bg-destructive/15 disabled:opacity-60"
                  >
                    <Trash2 className="size-4" /> Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => void salvarNota()}
                    disabled={saving || !dirty}
                    className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Salvar nota
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center p-8 text-center">
              <div>
                <FileText className="size-10 mx-auto text-muted-foreground mb-3" />
                <div className="font-semibold">Nenhuma nota selecionada</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Crie uma nota para comecar a registrar observacoes gerais.
                </p>
                <button
                  type="button"
                  onClick={() => void novaNota()}
                  className="mt-4 h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Plus className="size-4" /> Nova nota
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
