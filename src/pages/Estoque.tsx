import type { Produto } from "@/lib/mock";
import { onCrmReload } from "@/lib/crm-refresh";
import {
  AlertTriangle,
  TrendingUp,
  Package,
  Plus,
  Boxes,
  Handshake,
  Pencil,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ProdutoForm = {
  skuAtual?: string;
  sku: string;
  nome: string;
  categoria: string;
  estoque: string;
  minimo: string;
  giro: Produto["giro"];
  preco: string;
  precoCompra: string;
  tipo: Produto["tipo"];
  fornecedor: string;
};

function formFromProduto(produto?: Produto): ProdutoForm {
  return {
    skuAtual: produto?.sku,
    sku: produto?.sku ?? "",
    nome: produto?.nome ?? "",
    categoria: produto?.categoria ?? "",
    estoque: produto ? String(produto.estoque) : "0",
    minimo: produto ? String(produto.minimo) : "0",
    giro: produto?.giro ?? "baixo",
    preco: produto ? String(produto.preco) : "",
    precoCompra: produto ? String(produto.precoCompra) : "",
    tipo: produto?.tipo ?? "próprio",
    fornecedor: produto?.fornecedor ?? "",
  };
}

export function Estoque() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [tipo, setTipo] = useState<"todos" | "próprio" | "consignado">("todos");
  const [form, setForm] = useState<ProdutoForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;

    async function carregarProdutos() {
      try {
        const response = await fetch("/api/crm/produtos", { cache: "no-store" });

        if (!response.ok) return;

        const data = (await response.json()) as Produto[];

        if (!ignore && Array.isArray(data)) {
          setProdutos(data);
        }
      } catch (error) {
        console.error("Erro ao carregar produtos do Supabase:", error);
      }
    }

    void carregarProdutos();
    const offCrmReload = onCrmReload(() => void carregarProdutos());

    return () => {
      ignore = true;
      offCrmReload();
    };
  }, []);

  const list = tipo === "todos" ? produtos : produtos.filter((p) => p.tipo === tipo);
  const criticos = list.filter((p) => p.estoque < p.minimo);

  const valorProprio = produtos
    .filter((p) => p.tipo === "próprio")
    .reduce((s, p) => s + p.estoque * p.precoCompra, 0);
  const valorConsig = produtos
    .filter((p) => p.tipo === "consignado")
    .reduce((s, p) => s + p.estoque * p.precoCompra, 0);
  const margemMedia = produtos.length
    ? (produtos.reduce((s, p) => s + (p.preco > 0 ? (p.preco - p.precoCompra) / p.preco : 0), 0) /
        produtos.length) *
      100
    : 0;

  async function salvarProduto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/crm/produtos", {
        method: form.skuAtual ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          estoque: Number(form.estoque),
          minimo: Number(form.minimo),
          preco: Number(form.preco.replace(",", ".")),
          precoCompra: Number(form.precoCompra.replace(",", ".")),
        }),
      });
      const payload = (await response.json()) as Produto & { erro?: string };
      if (!response.ok) throw new Error(payload.erro ?? "Erro ao salvar produto");

      setProdutos((current) =>
        form.skuAtual
          ? current.map((produto) => (produto.sku === form.skuAtual ? payload : produto))
          : [...current, payload].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
      setForm(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque inteligente</h1>
          <p className="text-sm text-muted-foreground">
            Controle financeiro completo · próprio e consignado
          </p>
        </div>
        <button
          onClick={() => setForm(formFromProduto())}
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="size-4" /> Novo produto
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          icon={<Package className="size-4" />}
          label="SKUs ativos"
          value={String(produtos.length)}
          tone="primary"
        />
        <Card
          icon={<Boxes className="size-4" />}
          label="Estoque próprio"
          value={brl(valorProprio)}
          tone="primary"
        />
        <Card
          icon={<Handshake className="size-4" />}
          label="Consignado"
          value={brl(valorConsig)}
          tone="accent"
        />
        <Card
          icon={<TrendingUp className="size-4" />}
          label="Margem média"
          value={`${margemMedia.toFixed(0)}%`}
          tone="success"
        />
      </div>

      {criticos.length > 0 && (
        <div className="card-soft p-5 border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold">
                Atenção · {criticos.length} produtos abaixo do mínimo
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                A IA recomenda repor os itens abaixo nas próximas 48h.
              </p>
            </div>
            <a
              href="/pedidos"
              className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold inline-flex items-center"
            >
              Abrir pedidos
            </a>
          </div>
        </div>
      )}

      <div className="card-soft p-3 flex flex-wrap gap-2">
        {(["todos", "próprio", "consignado"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`h-9 px-4 rounded-lg text-xs font-semibold capitalize ${tipo === t ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/70"}`}
          >
            {t === "todos" ? "Todos" : t === "próprio" ? "Estoque próprio" : "Consignado"}
          </button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Produto</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Tipo</th>
                <th className="font-medium px-4 py-3 text-center">Estoque</th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Custo</th>
                <th className="font-medium px-4 py-3 text-right">Venda</th>
                <th className="font-medium px-4 py-3 text-right">Margem</th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Lucro un.</th>
                <th className="font-medium px-4 py-3 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const critico = p.estoque < p.minimo;
                const lucro = p.preco - p.precoCompra;
                const margem = (lucro / p.preco) * 100;
                const semMargem = margem < 20;
                return (
                  <tr key={p.sku} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.imagem ? (
                          <img
                            src={p.imagem}
                            alt={p.nome}
                            className="size-10 rounded-md object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="size-10 rounded-md bg-secondary border border-border grid place-items-center shrink-0">
                            <Package className="size-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold">{p.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.categoria} · {p.sku}
                            {p.fornecedor ? ` · ${p.fornecedor}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-md capitalize ${p.tipo === "próprio" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"}`}
                      >
                        {p.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${critico ? "text-destructive" : ""}`}>
                        {p.estoque}
                      </span>
                      <span className="text-muted-foreground text-xs">/{p.minimo}</span>
                      {critico && (
                        <div className="text-[9px] font-semibold text-destructive mt-0.5">
                          CRÍTICO
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-muted-foreground">
                      {brl(p.precoCompra)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{brl(p.preco)}</td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${semMargem ? "text-destructive" : "text-success"}`}
                    >
                      {margem.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">{brl(lucro)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setForm(formFromProduto(p))}
                        title="Editar produto"
                        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {form && (
        <div
          className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setForm(null)}
        >
          <form
            onSubmit={(event) => void salvarProduto(event)}
            onClick={(event) => event.stopPropagation()}
            className="w-full md:max-w-2xl bg-card md:rounded-2xl rounded-t-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-5 border-b border-border flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{form.skuAtual ? "Editar produto" : "Novo produto"}</h2>
                <p className="text-xs text-muted-foreground">
                  Catalogo usado pelo estoque e pela IA.
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
            <div className="p-5 grid md:grid-cols-3 gap-3">
              <ProdutoField
                label="SKU"
                value={form.sku}
                onChange={(sku) => setForm({ ...form, sku })}
                required
                disabled={Boolean(form.skuAtual)}
              />
              <ProdutoField
                label="Nome"
                value={form.nome}
                onChange={(nome) => setForm({ ...form, nome })}
                required
                span
              />
              <ProdutoField
                label="Categoria"
                value={form.categoria}
                onChange={(categoria) => setForm({ ...form, categoria })}
                required
              />
              <ProdutoField
                label="Fornecedor"
                value={form.fornecedor}
                onChange={(fornecedor) => setForm({ ...form, fornecedor })}
              />
              <ProdutoField
                label="Estoque"
                value={form.estoque}
                onChange={(estoque) => setForm({ ...form, estoque })}
                required
              />
              <ProdutoField
                label="Minimo"
                value={form.minimo}
                onChange={(minimo) => setForm({ ...form, minimo })}
                required
              />
              <ProdutoField
                label="Preco venda"
                value={form.preco}
                onChange={(preco) => setForm({ ...form, preco })}
                required
              />
              <ProdutoField
                label="Preco compra"
                value={form.precoCompra}
                onChange={(precoCompra) => setForm({ ...form, precoCompra })}
                required
              />
              <ProdutoSelect
                label="Giro"
                value={form.giro}
                options={["alto", "médio", "baixo"]}
                onChange={(giro) => setForm({ ...form, giro: giro as Produto["giro"] })}
              />
              <ProdutoSelect
                label="Tipo"
                value={form.tipo}
                options={["próprio", "consignado"]}
                onChange={(tipoProduto) =>
                  setForm({ ...form, tipo: tipoProduto as Produto["tipo"] })
                }
              />
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
                {saving ? "Salvando" : "Salvar produto"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ProdutoField({
  label,
  value,
  onChange,
  required,
  disabled,
  span,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  span?: boolean;
}) {
  return (
    <label
      className={`grid gap-1 text-xs font-semibold text-muted-foreground ${span ? "md:col-span-2" : ""}`}
    >
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        className="h-10 rounded-lg bg-secondary px-3 text-sm text-foreground outline-none disabled:opacity-60"
      />
    </label>
  );
}

function ProdutoSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg bg-secondary px-3 text-sm text-foreground outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Card({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "destructive" | "success" | "accent";
}) {
  const cls = {
    primary: "bg-primary/15 text-primary",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/15 text-success",
    accent: "bg-accent/15 text-accent",
  }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold truncate">{value}</div>
      </div>
    </div>
  );
}
