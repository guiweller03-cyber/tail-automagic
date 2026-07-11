import type { Produto, ProdutoDetalhesTecnicos } from "@/lib/crm-types";
import { useGlobalSearch } from "@/lib/global-search";
import {
  AlertTriangle,
  TrendingUp,
  Package,
  Plus,
  Boxes,
  Handshake,
  Pencil,
  X,
  ImageIcon,
  Upload,
  Trash2,
  Loader2,
  Wand2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { onCrmReload } from "@/lib/crm-refresh";

type ExcelLinha = {
  sku: string;
  estoqueNovo: number;
  produto?: Produto;
};

function normalizarHeader(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const HEADERS_SKU = new Set(["sku", "codigo", "cod", "ref", "referencia", "reference", "code"]);
const HEADERS_ESTOQUE = new Set([
  "estoque",
  "quantidade",
  "qtd",
  "qty",
  "stock",
  "quantity",
  "saldo",
  "qnt",
]);

async function parsearExcelLinhas(file: File, produtos: Produto[]): Promise<ExcelLinha[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia ou inválida.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2)
    throw new Error("A planilha precisa ter pelo menos um cabeçalho e uma linha de dados.");

  const headers = (rows[0] as unknown[]).map(normalizarHeader);
  const colSku = headers.findIndex((h) => HEADERS_SKU.has(h));
  const colEstoque = headers.findIndex((h) => HEADERS_ESTOQUE.has(h));

  if (colSku < 0)
    throw new Error(
      `Coluna de SKU não encontrada. Use um desses nomes: ${[...HEADERS_SKU].join(", ")}`,
    );
  if (colEstoque < 0)
    throw new Error(
      `Coluna de estoque não encontrada. Use um desses nomes: ${[...HEADERS_ESTOQUE].join(", ")}`,
    );

  const produtoPorSku = new Map(produtos.map((p) => [p.sku.toUpperCase(), p]));

  const linhas: ExcelLinha[] = [];
  for (const row of rows.slice(1)) {
    const rowArr = row as unknown[];
    const sku = String(rowArr[colSku] ?? "")
      .trim()
      .toUpperCase();
    const raw = String(rowArr[colEstoque] ?? "")
      .replace(",", ".")
      .trim();
    const estoqueNovo = Math.max(0, Math.floor(Number(raw)));
    if (!sku || !Number.isFinite(estoqueNovo)) continue;
    linhas.push({ sku, estoqueNovo, produto: produtoPorSku.get(sku) });
  }
  return linhas;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type EditCell = { sku: string; field: "preco" | "precoCompra" } | null;
type ImportStatus = "pronto" | "pendente" | "enviando" | "ok" | "erro";
type FotoImportItem = {
  id: string;
  file: File;
  previewUrl: string;
  sku: string;
  status: ImportStatus;
  mensagem?: string;
};
type ProdutoFormState = {
  sku: string;
  nome: string;
  categoria: string;
  tipo: Produto["tipo"];
  giro: Produto["giro"];
  estoque: string;
  minimo: string;
  precoCompra: string;
  preco: string;
  fornecedor: string;
  detalhesTecnicos: Record<keyof ProdutoDetalhesTecnicos, string>;
};

function normalizarBusca(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function chaveArquivoProduto(valor: string) {
  return normalizarBusca(valor).replace(/[^a-z0-9]+/g, "");
}

function nomeArquivoSemExtensao(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

function encontrarProdutoPorArquivo(file: File, produtos: Produto[]) {
  const chaveArquivo = chaveArquivoProduto(nomeArquivoSemExtensao(file));
  if (!chaveArquivo) return null;

  const porSku = produtos.find((produto) => {
    const sku = chaveArquivoProduto(produto.sku);
    return sku.length >= 3 && (chaveArquivo === sku || chaveArquivo.includes(sku));
  });
  if (porSku) return porSku;

  return (
    produtos.find((produto) => {
      const nome = chaveArquivoProduto(produto.nome);
      return nome.length >= 8 && (chaveArquivo.includes(nome) || nome.includes(chaveArquivo));
    }) ?? null
  );
}

function fotoImportId(file: File) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${file.name}-${file.size}-${file.lastModified}-${random}`;
}

function textoProduto(produto: Produto) {
  return normalizarBusca(
    [
      produto.nome,
      produto.sku,
      produto.categoria,
      produto.tipo,
      produto.fornecedor,
      produto.giro,
      produto.estoque,
      produto.minimo,
      produto.preco,
      produto.precoCompra,
      ...Object.values(produto.detalhesTecnicos ?? {}),
    ]
      .filter((item) => item !== undefined && item !== null)
      .join(" "),
  );
}

function calcMargem(p: Produto) {
  const venda = p.preco;
  if (venda <= 0) return { pct: 0, lucro: 0, tipoLabel: "—" };
  const lucro = venda - p.precoCompra;
  return {
    pct: (lucro / venda) * 100,
    lucro,
    tipoLabel: p.tipo === "consignado" ? "Consig." : "Bruta",
  };
}

function comportamentoCompra(produto: Produto) {
  const count = produto.giro === "alto" ? 3 : produto.giro === "médio" ? 1 : 0;
  if (count >= 3) return { label: "Alta demanda", tone: "bg-success/15 text-success", count };
  if (count >= 1) return { label: "Média", tone: "bg-accent/15 text-accent", count };
  return { label: "Baixa", tone: "bg-secondary text-muted-foreground", count };
}

const CATEGORIAS = ["Ração", "Higiene", "Petiscos", "Saúde", "Brinquedos", "Acessórios"];
const GIROS: Produto["giro"][] = ["alto", "médio", "baixo"];
const FOTO_MAX_BYTES = 5 * 1024 * 1024;
const FOTO_IMPORT_IA_BATCH_SIZE = 12;
const ESTOQUE_CONJUNTOS_STORAGE_KEY = "crm-estoque-conjuntos-v1";
const DETALHE_FIELDS: Array<{ key: keyof ProdutoDetalhesTecnicos; label: string; full?: boolean }> =
  [
    { key: "marca", label: "Marca" },
    { key: "linha", label: "Linha" },
    { key: "peso", label: "Peso / embalagem" },
    { key: "especie", label: "Espécie" },
    { key: "idade", label: "Idade" },
    { key: "porte", label: "Porte" },
    { key: "racaEspecifica", label: "Raça específica" },
    { key: "tipoProduto", label: "Tipo do produto" },
    { key: "proteinaBruta", label: "Proteína bruta" },
    { key: "gordura", label: "Gordura" },
    { key: "fibra", label: "Fibra" },
    { key: "umidade", label: "Umidade" },
    { key: "materiaMineral", label: "Matéria mineral" },
    { key: "calcio", label: "Cálcio" },
    { key: "fosforo", label: "Fósforo" },
    { key: "omega3", label: "Omega 3" },
    { key: "omega6", label: "Omega 6" },
    { key: "taurina", label: "Taurina" },
    { key: "condroitina", label: "Condroitina" },
    { key: "glicosamina", label: "Glicosamina" },
    { key: "prebioticos", label: "Prebióticos" },
    { key: "yucca", label: "Yucca" },
    { key: "miniBits", label: "Mini bits" },
    { key: "semCorantes", label: "Sem corantes" },
    { key: "semTransgenicos", label: "Sem transgênicos" },
    { key: "fonteProteinaAnimal", label: "Fonte proteína animal", full: true },
    { key: "principaisIngredientes", label: "Principais ingredientes", full: true },
    { key: "beneficios", label: "Benefícios", full: true },
    { key: "indicacao", label: "Indicação", full: true },
  ];

function detalhesVazios(): Record<keyof ProdutoDetalhesTecnicos, string> {
  return Object.fromEntries(DETALHE_FIELDS.map(({ key }) => [key, ""])) as Record<
    keyof ProdutoDetalhesTecnicos,
    string
  >;
}

function normalizarDetalhes(
  detalhes?: ProdutoDetalhesTecnicos,
): Record<keyof ProdutoDetalhesTecnicos, string> {
  const base = detalhesVazios();
  for (const { key } of DETALHE_FIELDS) {
    base[key] = detalhes?.[key] ?? "";
  }
  return base;
}

function limparDetalhes(
  detalhes: Record<keyof ProdutoDetalhesTecnicos, string>,
): ProdutoDetalhesTecnicos {
  return Object.fromEntries(
    Object.entries(detalhes)
      .map(([key, value]) => [key, String(value).trim()])
      .filter(([, value]) => value),
  ) as ProdutoDetalhesTecnicos;
}

function produtoToForm(produto: Produto): ProdutoFormState {
  return {
    sku: produto.sku,
    nome: produto.nome,
    categoria: produto.categoria,
    tipo: produto.tipo,
    giro: produto.giro,
    estoque: String(produto.estoque),
    minimo: String(produto.minimo),
    precoCompra: String(produto.precoCompra),
    preco: String(produto.preco),
    fornecedor: produto.fornecedor ?? "",
    detalhesTecnicos: normalizarDetalhes(produto.detalhesTecnicos),
  };
}

function formToProduto(form: ProdutoFormState): Produto | null {
  const estoque = Number(form.estoque);
  const minimo = Number(form.minimo);
  const preco = Number(form.preco);
  const precoCompra = Number(form.precoCompra);

  if (
    !form.sku.trim() ||
    !form.nome.trim() ||
    !form.categoria.trim() ||
    !Number.isInteger(estoque) ||
    !Number.isInteger(minimo) ||
    estoque < 0 ||
    minimo < 0 ||
    !Number.isFinite(preco) ||
    !Number.isFinite(precoCompra) ||
    preco < 0 ||
    precoCompra < 0
  ) {
    return null;
  }

  return {
    sku: form.sku.trim().toUpperCase(),
    nome: form.nome.trim(),
    categoria: form.categoria.trim(),
    estoque,
    minimo,
    giro: form.giro,
    preco,
    precoCompra,
    tipo: form.tipo,
    fornecedor: form.fornecedor.trim() || undefined,
    detalhesTecnicos: limparDetalhes(form.detalhesTecnicos),
  };
}

function atualizarSkuConjuntosEstoqueStorage(skuAtual: string, skuNovo?: string) {
  if (typeof window === "undefined") return;

  const alvo = skuAtual.trim().toUpperCase();
  const novo = skuNovo?.trim().toUpperCase();
  if (!alvo) return;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ESTOQUE_CONJUNTOS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return;

    const conjuntos = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const skus = Array.isArray(row.skus)
          ? row.skus
              .map((sku) => (typeof sku === "string" ? sku.trim().toUpperCase() : ""))
              .filter(Boolean)
          : [];
        const atualizados = skus.map((sku) => (sku === alvo ? (novo ?? "") : sku)).filter(Boolean);
        const unicos = Array.from(new Set(atualizados));
        if (unicos.length === 0) return null;

        return { ...row, skus: unicos };
      })
      .filter(Boolean);

    window.localStorage.setItem(ESTOQUE_CONJUNTOS_STORAGE_KEY, JSON.stringify(conjuntos));
  } catch {
    // Se o localStorage estiver indisponivel, a exclusao principal ja foi aplicada.
  }
}

export function Estoque({ produtosIniciais }: { produtosIniciais: Produto[] }) {
  const [produtos, setProdutos] = useState<Produto[]>(produtosIniciais);
  const [tipo, setTipo] = useState<"todos" | "próprio" | "consignado">("todos");
  const [edit, setEdit] = useState<EditCell>(null);
  const [draft, setDraft] = useState("");
  const [showNovo, setShowNovo] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [editForm, setEditForm] = useState<ProdutoFormState | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindoSku, setExcluindoSku] = useState<string | null>(null);
  const [fotoSalvandoSku, setFotoSalvandoSku] = useState<string | null>(null);
  const [fotosImport, setFotosImport] = useState<FotoImportItem[]>([]);
  const [importandoFotos, setImportandoFotos] = useState(false);
  const fotosImportRef = useRef<FotoImportItem[]>([]);
  const [excelLinhas, setExcelLinhas] = useState<ExcelLinha[]>([]);
  const [excelProcessando, setExcelProcessando] = useState(false);
  const [excelEnviando, setExcelEnviando] = useState(false);
  const { query: buscaGlobal, setQuery: setBuscaGlobal } = useGlobalSearch();

  useEffect(() => {
    setProdutos(produtosIniciais);
  }, [produtosIniciais]);

  useEffect(() => {
    fotosImportRef.current = fotosImport;
  }, [fotosImport]);

  useEffect(() => {
    return () => {
      fotosImportRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  useEffect(() => {
    return onCrmReload(() => {
      void fetch("/api/crm/produtos", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Falha ao carregar produtos");
          return response.json() as Promise<Produto[]>;
        })
        .then(setProdutos)
        .catch(() => toast.error("Nao foi possivel atualizar o estoque"));
    });
  }, []);

  // novo produto
  const [novo, setNovo] = useState({
    sku: "",
    nome: "",
    categoria: "Ração",
    tipo: "próprio" as Produto["tipo"],
    estoque: "",
    minimo: "",
    precoCompra: "",
    preco: "",
    fornecedor: "",
    detalhesTecnicos: detalhesVazios(),
  });

  useEffect(() => {
    if (!showNovo) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowNovo(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showNovo]);

  const termoBusca = normalizarBusca(buscaGlobal);
  const list = (tipo === "todos" ? produtos : produtos.filter((p) => p.tipo === tipo)).filter(
    (produto) => !termoBusca || textoProduto(produto).includes(termoBusca),
  );
  const criticos = list.filter((p) => p.estoque < p.minimo);

  const valorProprio = produtos
    .filter((p) => p.tipo === "próprio")
    .reduce((s, p) => s + p.estoque * p.precoCompra, 0);
  const valorConsig = produtos
    .filter((p) => p.tipo === "consignado")
    .reduce((s, p) => s + p.estoque * p.precoCompra, 0);
  const margemMedia =
    produtos.length > 0 ? produtos.reduce((s, p) => s + calcMargem(p).pct, 0) / produtos.length : 0;
  const fotosImportProntas = fotosImport.filter((item) => item.sku && item.status !== "ok").length;
  const fotosImportPendentes = fotosImport.filter(
    (item) => !item.sku && item.status !== "ok",
  ).length;
  const fotosImportSalvas = fotosImport.filter((item) => item.status === "ok").length;

  function startEdit(sku: string, field: "preco" | "precoCompra", val: number) {
    setEdit({ sku, field });
    setDraft(String(val));
  }
  async function commitEdit() {
    if (!edit) return;
    const n = Number(draft);
    if (isNaN(n) || n < 0) {
      setEdit(null);
      return;
    }
    const produto = produtos.find((p) => p.sku === edit.sku);
    if (!produto) {
      setEdit(null);
      return;
    }
    const atualizado = { ...produto, [edit.field]: n };
    const anterior = produtos;
    setProdutos((prev) => prev.map((p) => (p.sku === edit.sku ? atualizado : p)));
    setEdit(null);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skuAtual: edit.sku, ...atualizado }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro ?? "Erro ao salvar produto");
      setProdutos((prev) => prev.map((p) => (p.sku === edit.sku ? data : p)));
      toast.success("Produto atualizado");
    } catch (error) {
      setProdutos(anterior);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar produto");
    }
  }

  async function uploadFotoProduto(sku: string, file: File): Promise<Produto> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Envie uma imagem valida");
    }

    if (file.size > FOTO_MAX_BYTES) {
      throw new Error("A foto deve ter no maximo 5MB");
    }

    const formData = new FormData();
    formData.append("sku", sku);
    formData.append("foto", file);

    const response = await fetch("/api/crm/produtos/foto", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.erro ?? "Erro ao salvar foto");

    return data as Produto;
  }

  async function salvarFotoProduto(produto: Produto, file: File) {
    setFotoSalvandoSku(produto.sku);
    try {
      const data = await uploadFotoProduto(produto.sku, file);

      setProdutos((prev) => prev.map((p) => (p.sku === produto.sku ? data : p)));
      toast.success("Foto salva");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar foto");
    } finally {
      setFotoSalvandoSku(null);
    }
  }

  async function removerFotoProduto(produto: Produto) {
    if (!produto.fotoUrl && !produto.fotoPath) return;

    setFotoSalvandoSku(produto.sku);
    try {
      const response = await fetch("/api/crm/produtos/foto", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: produto.sku }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro ?? "Erro ao remover foto");

      setProdutos((prev) => prev.map((p) => (p.sku === produto.sku ? data : p)));
      toast.success("Foto removida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover foto");
    } finally {
      setFotoSalvandoSku(null);
    }
  }

  function adicionarFotosImport(files: FileList | null) {
    if (!files || importandoFotos) return;

    const aceitas: FotoImportItem[] = [];
    let rejeitadas = 0;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || file.size <= 0 || file.size > FOTO_MAX_BYTES) {
        rejeitadas += 1;
        continue;
      }

      const produto = encontrarProdutoPorArquivo(file, produtos);
      aceitas.push({
        id: fotoImportId(file),
        file,
        previewUrl: URL.createObjectURL(file),
        sku: produto?.sku ?? "",
        status: produto ? "pronto" : "pendente",
        mensagem: produto ? `Match: ${produto.nome}` : "Sem match pelo nome do arquivo",
      });
    }

    if (aceitas.length > 0) {
      setFotosImport((current) => [...current, ...aceitas]);
    }
    if (rejeitadas > 0) {
      toast.error(`${rejeitadas} foto(s) ignoradas. Use imagens de ate 5MB.`);
    }
  }

  function alterarSkuImport(id: string, sku: string) {
    const produto = produtos.find((item) => item.sku === sku);
    setFotosImport((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              sku,
              status: sku ? "pronto" : "pendente",
              mensagem: produto ? `Match manual: ${produto.nome}` : undefined,
            }
          : item,
      ),
    );
  }

  function removerFotoImport(id: string) {
    setFotosImport((current) => {
      const item = current.find((foto) => foto.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((foto) => foto.id !== id);
    });
  }

  function limparFotosImport() {
    fotosImportRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setFotosImport([]);
  }

  async function enviarFotosComSku() {
    const itens = fotosImport.filter((item) => item.sku && item.status !== "ok");
    if (itens.length === 0 || importandoFotos) {
      toast.error("Selecione fotos com SKU antes de enviar");
      return;
    }

    setImportandoFotos(true);
    let salvas = 0;

    for (const item of itens) {
      setFotosImport((current) =>
        current.map((foto) =>
          foto.id === item.id ? { ...foto, status: "enviando", mensagem: "Enviando..." } : foto,
        ),
      );

      try {
        const atualizado = await uploadFotoProduto(item.sku, item.file);
        salvas += 1;
        setProdutos((prev) =>
          prev.map((produto) => (produto.sku === item.sku ? atualizado : produto)),
        );
        setFotosImport((current) =>
          current.map((foto) =>
            foto.id === item.id
              ? { ...foto, status: "ok", mensagem: `Salva em ${atualizado.nome}` }
              : foto,
          ),
        );
      } catch (error) {
        setFotosImport((current) =>
          current.map((foto) =>
            foto.id === item.id
              ? {
                  ...foto,
                  status: "erro",
                  mensagem: error instanceof Error ? error.message : "Erro ao salvar foto",
                }
              : foto,
          ),
        );
      }
    }

    setImportandoFotos(false);
    toast.success(`${salvas} foto(s) salvas por SKU`);
  }

  async function identificarFotosComIa() {
    const pendentes = fotosImport.filter((item) => item.status !== "ok" && !item.sku);
    if (pendentes.length === 0 || importandoFotos) {
      toast.error("Nao ha fotos pendentes para identificar com IA");
      return;
    }

    setImportandoFotos(true);
    let salvas = 0;

    for (let index = 0; index < pendentes.length; index += FOTO_IMPORT_IA_BATCH_SIZE) {
      const lote = pendentes.slice(index, index + FOTO_IMPORT_IA_BATCH_SIZE);
      setFotosImport((current) =>
        current.map((foto) =>
          lote.some((item) => item.id === foto.id)
            ? { ...foto, status: "enviando", mensagem: "IA analisando..." }
            : foto,
        ),
      );

      try {
        const formData = new FormData();
        formData.append(
          "message",
          "Analise estas fotos de racoes e vincule cada foto ao produto correspondente no estoque.",
        );
        lote.forEach((item) => formData.append("fotos", item.file, item.file.name));

        const response = await fetch("/api/crm/assistente", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.erro ?? "Erro ao processar fotos com IA");

        const resultado = data?.fotosRacoes as
          | {
              salvos?: Array<{ fotoIndex: number; sku: string; nome: string }>;
              pendentes?: Array<{ fotoIndex: number; motivo?: string }>;
              falhas?: Array<{ fotoIndex: number; motivo?: string }>;
            }
          | undefined;
        const salvosLote = resultado?.salvos ?? [];
        const pendentesLote = [...(resultado?.pendentes ?? []), ...(resultado?.falhas ?? [])];
        salvas += salvosLote.length;

        setFotosImport((current) =>
          current.map((foto) => {
            const loteIndex = lote.findIndex((item) => item.id === foto.id);
            if (loteIndex < 0) return foto;

            const fotoIndex = loteIndex + 1;
            const salvo = salvosLote.find((item) => item.fotoIndex === fotoIndex);
            if (salvo) {
              return {
                ...foto,
                sku: salvo.sku,
                status: "ok",
                mensagem: `IA salvou em ${salvo.nome}`,
              };
            }

            const pendente = pendentesLote.find((item) => item.fotoIndex === fotoIndex);
            return {
              ...foto,
              status: "erro",
              mensagem: pendente?.motivo ?? "IA nao encontrou match claro",
            };
          }),
        );
      } catch (error) {
        setFotosImport((current) =>
          current.map((foto) =>
            lote.some((item) => item.id === foto.id)
              ? {
                  ...foto,
                  status: "erro",
                  mensagem: error instanceof Error ? error.message : "Erro ao processar com IA",
                }
              : foto,
          ),
        );
      }
    }

    if (salvas > 0) {
      try {
        const response = await fetch("/api/crm/produtos", { cache: "no-store" });
        if (response.ok) setProdutos((await response.json()) as Produto[]);
      } catch {
        // A lista sera atualizada pelo proximo reload do CRM.
      }
    }

    setImportandoFotos(false);
    toast.success(`${salvas} foto(s) vinculadas pela IA`);
  }

  function abrirEdicao(produto: Produto) {
    setProdutoEditando(produto);
    setEditForm(produtoToForm(produto));
  }

  function fecharEdicao() {
    if (salvando) return;
    setProdutoEditando(null);
    setEditForm(null);
  }

  async function salvarEdicao() {
    if (!produtoEditando || !editForm) return;
    const produto = formToProduto(editForm);
    if (!produto) {
      toast.error("Preencha os dados do produto corretamente");
      return;
    }
    if (produtos.some((p) => p.sku !== produtoEditando.sku && p.sku === produto.sku)) {
      toast.error("SKU já existe");
      return;
    }

    setSalvando(true);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skuAtual: produtoEditando.sku, ...produto }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro ?? "Erro ao salvar produto");

      const atualizado = data as Produto;
      setProdutos((prev) => prev.map((p) => (p.sku === produtoEditando.sku ? atualizado : p)));
      if (produtoEditando.sku !== atualizado.sku) {
        atualizarSkuConjuntosEstoqueStorage(produtoEditando.sku, atualizado.sku);
      }
      toast.success("Produto atualizado");
      setProdutoEditando(null);
      setEditForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar produto");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirProduto(produto: Produto) {
    if (excluindoSku) return;
    const confirmado = window.confirm(
      `Excluir "${produto.nome}" do estoque? Esta acao nao pode ser desfeita.`,
    );
    if (!confirmado) return;

    setExcluindoSku(produto.sku);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: produto.sku }),
      });
      const data = (await response.json().catch(() => ({}))) as { erro?: string };
      if (!response.ok) throw new Error(data.erro ?? "Erro ao excluir produto");

      setProdutos((prev) => prev.filter((p) => p.sku !== produto.sku));
      atualizarSkuConjuntosEstoqueStorage(produto.sku);
      if (produtoEditando?.sku === produto.sku) {
        setProdutoEditando(null);
        setEditForm(null);
      }
      toast.success("Produto excluido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir produto");
    } finally {
      setExcluindoSku(null);
    }
  }

  async function carregarExcel(file: File) {
    setExcelProcessando(true);
    setExcelLinhas([]);
    try {
      const linhas = await parsearExcelLinhas(file, produtos);
      if (linhas.length === 0) {
        toast.error("Nenhuma linha válida encontrada na planilha.");
        return;
      }
      setExcelLinhas(linhas);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao ler planilha");
    } finally {
      setExcelProcessando(false);
    }
  }

  async function confirmarImportacaoExcel() {
    const validas = excelLinhas.filter((l) => l.produto);
    if (validas.length === 0 || excelEnviando) return;

    setExcelEnviando(true);
    try {
      const response = await fetch("/api/crm/produtos/estoque-lote", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          atualizacoes: validas.map((l) => ({ sku: l.sku, estoque: l.estoqueNovo })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro ?? "Erro ao atualizar estoque");

      setProdutos((prev) =>
        prev.map((p) => {
          const linha = validas.find((l) => l.sku === p.sku.toUpperCase());
          return linha ? { ...p, estoque: linha.estoqueNovo } : p;
        }),
      );

      toast.success(`${data.atualizados} produto(s) atualizados com sucesso!`);
      if (data.naoEncontrados?.length > 0) {
        toast.warning(
          `${data.naoEncontrados.length} SKU(s) não encontrados: ${data.naoEncontrados.slice(0, 3).join(", ")}${data.naoEncontrados.length > 3 ? "..." : ""}`,
        );
      }
      setExcelLinhas([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao importar estoque");
    } finally {
      setExcelEnviando(false);
    }
  }

  const novaMargem = useMemo(() => {
    const venda = Number(novo.preco) || 0;
    const compra = Number(novo.precoCompra) || 0;
    if (venda <= 0) return null;
    const lucro = venda - compra;
    return { pct: (lucro / venda) * 100, lucro };
  }, [novo.preco, novo.precoCompra]);

  async function salvarNovo() {
    if (!novo.sku || !novo.nome || !novo.preco || !novo.precoCompra) {
      toast.error("Preencha SKU, nome e preços");
      return;
    }
    if (produtos.some((p) => p.sku === novo.sku)) {
      toast.error("SKU já existe");
      return;
    }
    const produto: Produto = {
      sku: novo.sku,
      nome: novo.nome,
      categoria: novo.categoria,
      tipo: novo.tipo,
      estoque: Number(novo.estoque) || 0,
      minimo: Number(novo.minimo) || 0,
      preco: Number(novo.preco),
      precoCompra: Number(novo.precoCompra),
      giro: "médio",
      fornecedor: novo.fornecedor || undefined,
      detalhesTecnicos: limparDetalhes(novo.detalhesTecnicos),
    };

    setSalvando(true);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(produto),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro ?? "Erro ao adicionar produto");

      setProdutos((prev) => [...prev, data]);
      toast.success("Produto adicionado ✓");
      setNovo({
        sku: "",
        nome: "",
        categoria: "Ração",
        tipo: "próprio",
        estoque: "",
        minimo: "",
        precoCompra: "",
        preco: "",
        fornecedor: "",
        detalhesTecnicos: detalhesVazios(),
      });
      setShowNovo(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar produto");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estoque inteligente</h1>
          <p className="text-sm text-muted-foreground">
            Controle financeiro completo · próprio e consignado · edição inline
          </p>
        </div>
        <button
          onClick={() => setShowNovo(true)}
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2"
        >
          <Plus className="size-4" /> Novo produto
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KCard
          icon={<Package className="size-4" />}
          label="SKUs ativos"
          value={String(produtos.length)}
          tone="primary"
        />
        <KCard
          icon={<Boxes className="size-4" />}
          label="Estoque próprio"
          value={brl(valorProprio)}
          tone="primary"
        />
        <KCard
          icon={<Handshake className="size-4" />}
          label="Consignado"
          value={brl(valorConsig)}
          tone="accent"
        />
        <KCard
          icon={<TrendingUp className="size-4" />}
          label="Margem média"
          value={`${margemMedia.toFixed(0)}%`}
          tone={margemMedia < 0 ? "destructive" : "success"}
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
            <button className="h-9 px-4 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold">
              Gerar pedido
            </button>
          </div>
        </div>
      )}

      <div className="card-soft p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold inline-flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" /> Importar fotos em lote
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Renomeie fotos com o SKU para salvar direto, ou deixe a IA identificar embalagens em
              lotes de {FOTO_IMPORT_IA_BATCH_SIZE}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label
              className={`h-9 cursor-pointer rounded-lg bg-secondary px-3 text-xs font-bold inline-flex items-center gap-2 hover:bg-secondary/70 ${
                importandoFotos ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <Upload className="size-3.5" />
              Escolher fotos
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={importandoFotos}
                className="sr-only"
                onChange={(event) => {
                  adicionarFotosImport(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void enviarFotosComSku()}
              disabled={importandoFotos || fotosImportProntas === 0}
              className="h-9 rounded-lg bg-foreground px-3 text-xs font-bold text-background inline-flex items-center gap-2 disabled:opacity-50"
            >
              {importandoFotos ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Salvar {fotosImportProntas || ""} com SKU
            </button>
            <button
              type="button"
              onClick={() => void identificarFotosComIa()}
              disabled={importandoFotos || fotosImportPendentes === 0}
              className="h-9 rounded-lg bg-primary/15 px-3 text-xs font-bold text-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              {importandoFotos ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              IA nos pendentes {fotosImportPendentes || ""}
            </button>
            {fotosImport.length > 0 && (
              <button
                type="button"
                onClick={limparFotosImport}
                disabled={importandoFotos}
                className="h-9 rounded-lg bg-secondary px-3 text-xs font-bold hover:bg-secondary/70 disabled:opacity-50"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {fotosImport.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-md bg-secondary px-2 py-1">
                {fotosImport.length} selecionadas
              </span>
              <span className="rounded-md bg-success/15 px-2 py-1 text-success">
                {fotosImportSalvas} salvas
              </span>
              <span className="rounded-md bg-primary/15 px-2 py-1 text-primary">
                {fotosImportProntas} com SKU
              </span>
              <span className="rounded-md bg-accent/15 px-2 py-1 text-accent">
                {fotosImportPendentes} para IA
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {fotosImport.map((item) => {
                const produto = produtos.find((p) => p.sku === item.sku);
                const statusClass =
                  item.status === "ok"
                    ? "bg-success/15 text-success"
                    : item.status === "erro"
                      ? "bg-destructive/10 text-destructive"
                      : item.status === "enviando"
                        ? "bg-primary/15 text-primary"
                        : item.status === "pronto"
                          ? "bg-primary/15 text-primary"
                          : "bg-accent/15 text-accent";

                return (
                  <div key={item.id} className="rounded-lg border border-border bg-card p-2">
                    <div className="flex gap-2">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="size-full object-cover"
                        />
                        {item.status === "enviando" && (
                          <div className="absolute inset-0 grid place-items-center bg-background/80">
                            <Loader2 className="size-4 animate-spin text-primary" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold" title={item.file.name}>
                          {item.file.name}
                        </div>
                        <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                          <select
                            value={item.sku}
                            disabled={importandoFotos || item.status === "ok"}
                            onChange={(event) => alterarSkuImport(item.id, event.target.value)}
                            className="h-8 min-w-0 rounded-md bg-secondary px-2 text-xs outline-none disabled:opacity-60"
                          >
                            <option value="">IA identifica</option>
                            {produtos.map((produtoOption) => (
                              <option key={produtoOption.sku} value={produtoOption.sku}>
                                {produtoOption.sku} - {produtoOption.nome}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removerFotoImport(item.id)}
                            disabled={importandoFotos}
                            className="grid size-8 place-items-center rounded-md bg-secondary text-muted-foreground hover:text-destructive disabled:opacity-50"
                            aria-label="Remover foto do lote"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${statusClass}`}
                          >
                            {item.status === "ok"
                              ? "salva"
                              : item.status === "erro"
                                ? "revisar"
                                : item.status === "enviando"
                                  ? "processando"
                                  : item.sku
                                    ? "com SKU"
                                    : "pendente"}
                          </span>
                          <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                            {produto?.nome ?? item.mensagem}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card-soft p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold inline-flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-success" /> Importar estoque por Excel
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Planilha com colunas <b>SKU</b> e <b>Estoque</b> (ou Quantidade). Suporta .xlsx, .xls
              e .csv.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label
              className={`h-9 cursor-pointer rounded-lg bg-secondary px-3 text-xs font-bold inline-flex items-center gap-2 hover:bg-secondary/70 ${excelProcessando ? "pointer-events-none opacity-60" : ""}`}
            >
              {excelProcessando ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Escolher planilha
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={excelProcessando}
                className="sr-only"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void carregarExcel(file);
                }}
              />
            </label>
            {excelLinhas.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void confirmarImportacaoExcel()}
                  disabled={excelEnviando || excelLinhas.filter((l) => l.produto).length === 0}
                  className="h-9 rounded-lg bg-success px-3 text-xs font-bold text-success-foreground inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {excelEnviando ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  Confirmar {excelLinhas.filter((l) => l.produto).length} atualizações
                </button>
                <button
                  type="button"
                  onClick={() => setExcelLinhas([])}
                  disabled={excelEnviando}
                  className="h-9 rounded-lg bg-secondary px-3 text-xs font-bold hover:bg-secondary/70 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {excelLinhas.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-md bg-secondary px-2 py-1">
                {excelLinhas.length} linhas lidas
              </span>
              <span className="rounded-md bg-success/15 px-2 py-1 text-success">
                {excelLinhas.filter((l) => l.produto).length} encontrados
              </span>
              {excelLinhas.filter((l) => !l.produto).length > 0 && (
                <span className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
                  {excelLinhas.filter((l) => !l.produto).length} não encontrados
                </span>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 font-medium text-center">Estoque atual</th>
                    <th className="px-3 py-2 font-medium text-center">Novo estoque</th>
                    <th className="px-3 py-2 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {excelLinhas.map((linha) => (
                    <tr key={linha.sku} className="border-t border-border">
                      <td className="px-3 py-2 font-mono font-bold">{linha.sku}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {linha.produto?.nome ?? (
                          <span className="text-destructive italic">não encontrado</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {linha.produto ? linha.produto.estoque : "—"}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{linha.estoqueNovo}</td>
                      <td className="px-3 py-2 text-center">
                        {linha.produto ? (
                          <CheckCircle2 className="size-4 text-success inline" />
                        ) : (
                          <AlertCircle className="size-4 text-destructive inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card-soft p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={buscaGlobal}
            onChange={(event) => setBuscaGlobal(event.target.value)}
            aria-label="Buscar rações no estoque"
            placeholder="Buscar ração por nome, SKU, marca ou peso"
            className="h-10 w-full rounded-xl border border-transparent bg-secondary pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-card"
          />
        </div>
        <div className="flex flex-wrap gap-2">
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
                <th className="font-medium px-4 py-3 hidden xl:table-cell">Tipo margem</th>
                <th className="font-medium px-4 py-3 text-right hidden md:table-cell">Lucro un.</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Demanda</th>
                <th className="font-medium px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const critico = p.estoque < p.minimo;
                const m = calcMargem(p);
                const semMargem = m.pct < 20;
                const negativa = m.pct < 0;
                const comp = comportamentoCompra(p);
                return (
                  <tr key={p.sku} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 min-w-[320px]">
                      <div className="flex items-center gap-3">
                        <ProdutoFotoControl
                          produto={p}
                          salvando={fotoSalvandoSku === p.sku}
                          onUpload={salvarFotoProduto}
                          onRemove={removerFotoProduto}
                        />
                        <div className="min-w-0">
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
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      {edit?.sku === p.sku && edit.field === "precoCompra" ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEdit(null);
                          }}
                          className="w-24 h-8 px-2 text-right rounded bg-secondary outline-none focus:ring-2 ring-primary/30"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(p.sku, "precoCompra", p.precoCompra)}
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {brl(p.precoCompra)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {edit?.sku === p.sku && edit.field === "preco" ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") setEdit(null);
                          }}
                          className="w-24 h-8 px-2 text-right rounded bg-secondary outline-none focus:ring-2 ring-primary/30"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(p.sku, "preco", p.preco)}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {brl(p.preco)}
                        </button>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${negativa ? "text-destructive" : semMargem ? "text-destructive" : "text-success"}`}
                    >
                      {m.pct.toFixed(0)}%
                      {negativa && (
                        <div className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-block ml-1">
                          ATENÇÃO
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {m.tipoLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">{brl(m.lucro)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span
                        title={`${comp.count} clientes compram regularmente`}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md ${comp.tone}`}
                      >
                        {comp.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(p)}
                          className="h-8 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-2 hover:bg-secondary/70"
                        >
                          <Pencil className="size-3.5" /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void excluirProduto(p)}
                          disabled={excluindoSku === p.sku}
                          className="h-8 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-2 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                          {excluindoSku === p.sku ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <div className="mx-auto max-w-sm">
                      <div className="text-sm font-semibold">Nenhum produto encontrado</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ajuste a busca ou limpe o termo para ver todos os itens do estoque.
                      </p>
                      {buscaGlobal && (
                        <button
                          type="button"
                          onClick={() => setBuscaGlobal("")}
                          className="mt-4 h-9 px-4 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70"
                        >
                          Limpar busca
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNovo && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50"
          onClick={() => setShowNovo(false)}
        >
          <div
            className="card-soft p-5 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold inline-flex items-center gap-2">
                <Plus className="size-4 text-primary" /> Novo produto
              </h3>
              <button
                onClick={() => setShowNovo(false)}
                className="p-1 rounded-lg hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU">
                <input
                  value={novo.sku}
                  onChange={(e) => setNovo((s) => ({ ...s, sku: e.target.value.toUpperCase() }))}
                  placeholder="RAC-XXX-00"
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={novo.categoria}
                  onChange={(e) => setNovo((s) => ({ ...s, categoria: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nome" full>
                <input
                  value={novo.nome}
                  onChange={(e) => setNovo((s) => ({ ...s, nome: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={novo.tipo}
                  onChange={(e) =>
                    setNovo((s) => ({ ...s, tipo: e.target.value as Produto["tipo"] }))
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value="próprio">Próprio</option>
                  <option value="consignado">Consignado</option>
                </select>
              </Field>
              <Field label="Fornecedor (opcional)">
                <input
                  value={novo.fornecedor}
                  onChange={(e) => setNovo((s) => ({ ...s, fornecedor: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Estoque atual">
                <input
                  type="number"
                  value={novo.estoque}
                  onChange={(e) => setNovo((s) => ({ ...s, estoque: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Estoque mínimo">
                <input
                  type="number"
                  value={novo.minimo}
                  onChange={(e) => setNovo((s) => ({ ...s, minimo: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Preço de compra">
                <input
                  type="number"
                  step="0.01"
                  value={novo.precoCompra}
                  onChange={(e) => setNovo((s) => ({ ...s, precoCompra: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Preço de venda">
                <input
                  type="number"
                  step="0.01"
                  value={novo.preco}
                  onChange={(e) => setNovo((s) => ({ ...s, preco: e.target.value }))}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
            </div>
            <ProdutoDetalhesFields
              detalhes={novo.detalhesTecnicos}
              onChange={(key, value) =>
                setNovo((s) => ({
                  ...s,
                  detalhesTecnicos: { ...s.detalhesTecnicos, [key]: value },
                }))
              }
            />
            {novaMargem && (
              <div
                className={`rounded-xl p-3 ${novaMargem.pct < 0 ? "bg-destructive/10" : novaMargem.pct < 20 ? "bg-accent/10" : "bg-success/10"}`}
              >
                <div className="text-xs text-muted-foreground">
                  Margem prevista ({novo.tipo === "consignado" ? "líquida consignado" : "bruta"})
                </div>
                <div
                  className={`text-2xl font-bold tabular-nums ${novaMargem.pct < 0 ? "text-destructive" : novaMargem.pct < 20 ? "text-accent" : "text-success"}`}
                >
                  {novaMargem.pct.toFixed(1)}% · {brl(novaMargem.lucro)}/un.
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowNovo(false)}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={salvarNovo}
                className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {produtoEditando && editForm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50"
          onClick={fecharEdicao}
        >
          <div
            className="card-soft p-5 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h3 className="font-semibold inline-flex items-center gap-2">
                <Pencil className="size-4 text-primary" /> Editar produto
              </h3>
              <button onClick={fecharEdicao} className="p-1 rounded-lg hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU">
                <input
                  value={editForm.sku}
                  onChange={(e) =>
                    setEditForm((s) => s && { ...s, sku: e.target.value.toUpperCase() })
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={editForm.categoria}
                  onChange={(e) => setEditForm((s) => s && { ...s, categoria: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  {!CATEGORIAS.includes(editForm.categoria) && (
                    <option value={editForm.categoria}>{editForm.categoria}</option>
                  )}
                </select>
              </Field>
              <Field label="Nome" full>
                <input
                  value={editForm.nome}
                  onChange={(e) => setEditForm((s) => s && { ...s, nome: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Tipo">
                <select
                  value={editForm.tipo}
                  onChange={(e) =>
                    setEditForm((s) => s && { ...s, tipo: e.target.value as Produto["tipo"] })
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value="próprio">Próprio</option>
                  <option value="consignado">Consignado</option>
                </select>
              </Field>
              <Field label="Giro">
                <select
                  value={editForm.giro}
                  onChange={(e) =>
                    setEditForm((s) => s && { ...s, giro: e.target.value as Produto["giro"] })
                  }
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  {GIROS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fornecedor">
                <input
                  value={editForm.fornecedor}
                  onChange={(e) => setEditForm((s) => s && { ...s, fornecedor: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Estoque atual">
                <input
                  type="number"
                  value={editForm.estoque}
                  onChange={(e) => setEditForm((s) => s && { ...s, estoque: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Estoque mínimo">
                <input
                  type="number"
                  value={editForm.minimo}
                  onChange={(e) => setEditForm((s) => s && { ...s, minimo: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Preço de compra">
                <input
                  type="number"
                  step="0.01"
                  value={editForm.precoCompra}
                  onChange={(e) => setEditForm((s) => s && { ...s, precoCompra: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
              <Field label="Preço de venda">
                <input
                  type="number"
                  step="0.01"
                  value={editForm.preco}
                  onChange={(e) => setEditForm((s) => s && { ...s, preco: e.target.value })}
                  className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </Field>
            </div>
            <ProdutoDetalhesFields
              detalhes={editForm.detalhesTecnicos}
              onChange={(key, value) =>
                setEditForm(
                  (s) => s && { ...s, detalhesTecnicos: { ...s.detalhesTecnicos, [key]: value } },
                )
              }
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => void excluirProduto(produtoEditando)}
                disabled={salvando || excluindoSku === produtoEditando.sku}
                className="h-10 rounded-xl bg-destructive/10 px-4 text-sm font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-60 sm:w-auto inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="size-4" />
                {excluindoSku === produtoEditando.sku ? "Excluindo..." : "Excluir produto"}
              </button>
              <button
                onClick={fecharEdicao}
                disabled={salvando || excluindoSku === produtoEditando.sku}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicao}
                disabled={salvando || excluindoSku === produtoEditando.sku}
                className="flex-1 h-10 rounded-xl bg-foreground text-background text-sm font-semibold disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProdutoFotoControl({
  produto,
  salvando,
  onUpload,
  onRemove,
}: {
  produto: Produto;
  salvando: boolean;
  onUpload: (produto: Produto, file: File) => Promise<void>;
  onRemove: (produto: Produto) => Promise<void>;
}) {
  const label = produto.fotoUrl ? "Trocar foto" : "Adicionar foto";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="relative size-14 overflow-hidden rounded-lg border border-border bg-secondary">
        {produto.fotoUrl ? (
          <img src={produto.fotoUrl} alt={produto.nome} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
        {salvando && (
          <div className="absolute inset-0 grid place-items-center bg-background/80">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="flex w-28 flex-col gap-1">
        <label
          className={`inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-secondary px-2 text-[10px] font-bold hover:bg-secondary/70 ${salvando ? "pointer-events-none opacity-60" : ""}`}
        >
          <Upload className="size-3" />
          <span className="truncate">{label}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={salvando}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void onUpload(produto, file);
            }}
          />
        </label>
        {produto.fotoUrl && (
          <button
            type="button"
            disabled={salvando}
            onClick={() => void onRemove(produto)}
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-destructive/10 px-2 text-[10px] font-bold text-destructive hover:bg-destructive/15 disabled:opacity-60"
          >
            <Trash2 className="size-3" />
            Remover
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
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

function ProdutoDetalhesFields({
  detalhes,
  onChange,
}: {
  detalhes: Record<keyof ProdutoDetalhesTecnicos, string>;
  onChange: (key: keyof ProdutoDetalhesTecnicos, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="pt-2 border-t border-border">
        <div className="text-xs font-bold text-foreground">Informações da planilha técnica</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {DETALHE_FIELDS.map(({ key, label, full }) => (
          <Field key={key} label={label} full={full}>
            {full ? (
              <textarea
                value={detalhes[key]}
                onChange={(e) => onChange(key, e.target.value)}
                rows={2}
                className="min-h-16 w-full px-3 py-2 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30 resize-y"
              />
            ) : (
              <input
                value={detalhes[key]}
                onChange={(e) => onChange(key, e.target.value)}
                className="h-10 w-full px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            )}
          </Field>
        ))}
      </div>
    </div>
  );
}

function KCard({
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
