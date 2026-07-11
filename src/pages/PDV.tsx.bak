import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  ChevronDown,
  ChevronUp,
  Zap,
  User,
  Receipt,
  MessageCircle,
  Check,
  X,
  History,
  RotateCcw,
  Phone,
  MapPin,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useVendas } from "@/contexts/useVendas";
import type { Item, Pay, StatusPag, Venda } from "@/contexts/vendas-store";
import type { Cliente, Produto } from "@/lib/crm-types";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataLocalISO = (d: Date) => d.toLocaleDateString("en-CA");

const dataHoraVenda = (dataISO: string) => {
  const agora = new Date();
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  if (!ano || !mes || !dia) return agora;
  return new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds());
};

const normalizarBusca = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const telefoneDigits = (valor: string) => valor.replace(/\D/g, "");

const isRacaoProduto = (produto?: Produto) => {
  const text = normalizarBusca(
    `${produto?.nome ?? ""} ${produto?.categoria ?? ""} ${produto?.detalhesTecnicos?.tipoProduto ?? ""}`,
  );
  return /\bracao\b|\bracoes\b|premier|golden|formula natural|n&d|gran ?(plus|nature)|special dog|special cat|bino|bionatural|bob dog|catsy/.test(
    text,
  );
};

const textoBuscaProduto = (produto: Produto) =>
  normalizarBusca(
    [
      produto.sku,
      produto.nome,
      produto.categoria,
      produto.tipo,
      produto.fornecedor,
      ...Object.values(produto.detalhesTecnicos ?? {}),
    ]
      .filter((item) => item !== undefined && item !== null)
      .join(" "),
  );

const inferirPesoKgProduto = (produto?: Produto, quantidade = 1) => {
  const origem = `${produto?.detalhesTecnicos?.peso ?? ""} ${produto?.nome ?? ""}`;
  const kg = origem.match(/(\d+(?:[,.]\d+)?)\s*kg/i);
  if (kg) return Number(kg[1].replace(",", ".")) * quantidade;

  const g = origem.match(/(\d+(?:[,.]\d+)?)\s*g\b/i);
  if (g) return (Number(g[1].replace(",", ".")) / 1000) * quantidade;

  return 0;
};

const consumoPorPorte = (porte?: string) => {
  if (porte === "pequeno") return 70;
  if (porte === "grande") return 220;
  return 130;
};

const consumoEstimadoCliente = (cliente?: Cliente, petNome?: string | null) => {
  const petBusca = petNome?.trim().toLowerCase();
  if (petBusca && cliente?.petsDetalhes?.length) {
    const pet = cliente.petsDetalhes.find((item) => item.nome.trim().toLowerCase() === petBusca);
    if (pet) return consumoPorPorte(pet.porte);
  }

  if (petBusca) return 130;

  const petsDetalhes = cliente?.petsDetalhes?.length ? cliente.petsDetalhes : null;
  if (petsDetalhes) {
    return petsDetalhes.reduce((sum, pet) => sum + consumoPorPorte(pet.porte), 0);
  }

  const quantidadePets = Math.max(1, cliente?.pets?.length ?? 1);
  return quantidadePets * 130;
};

const observacaoRecompraPdv = ({
  itens,
  produtos,
  cliente,
}: {
  itens: Item[];
  produtos: Produto[];
  cliente?: Cliente;
}) => {
  const linhas = itens.flatMap((item) => {
    const produto = produtos.find((p) => p.sku === item.sku);
    if (!produto || !isRacaoProduto(produto)) return [];

    const pesoKg = inferirPesoKgProduto(produto, item.qtd);
    const consumoDiarioG = consumoEstimadoCliente(cliente, item.petNome);
    if (pesoKg <= 0 || consumoDiarioG <= 0) return [];

    const dias = Math.max(1, Math.round((pesoKg * 1000) / consumoDiarioG));
    const pet = item.petNome ? ` pet="${item.petNome}"` : "";
    return [
      `recompra_auto sku="${item.sku}"${pet} dias=${dias} consumo_diario_g=${consumoDiarioG} peso_kg=${pesoKg.toFixed(2)}`,
    ];
  });

  return linhas.join(" | ");
};

const clienteCombina = (c: Cliente, valorBusca: string, exact = false) => {
  const q = normalizarBusca(valorBusca);
  const digits = telefoneDigits(valorBusca);
  const nome = normalizarBusca(c.nome);
  const telefone = telefoneDigits(c.telefone);

  if (exact) {
    return nome === q || (digits.length > 0 && telefone === digits);
  }

  return (q.length > 0 && nome.includes(q)) || (digits.length > 0 && telefone.includes(digits));
};

const itemCarrinhoKey = (item: Pick<Item, "sku" | "petNome">) =>
  `${item.sku}::${item.petNome?.trim().toLowerCase() ?? ""}`;

const petLinha = (petNome?: string | null) => petNome?.trim() || "";

type MsgLog = {
  id: string;
  cliente: string;
  telefone: string;
  quando: string;
  preview: string;
  vendaId?: string;
};

type PDVProps = {
  initialCliente?: string;
  initialTelefone?: string;
};

type DescontoTipo = "percentual" | "valor";
type CartaoModo = "debito" | "credito";
type CartaoParcela = 1 | 2 | 3 | 4 | 5 | 6;
type CatalogoFiltro = "racoes" | "todos" | "baixo";

const parcelasCredito = [1, 2, 3, 4, 5, 6] as const;
const taxasCartao = {
  debito: 1.37,
  credito: {
    1: 3.15,
    2: 5.39,
    3: 6.12,
    4: 6.85,
    5: 7.27,
    6: 8.28,
  },
} as const;

const formatPct = (value: number) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function PDV({ initialCliente = "", initialTelefone = "" }: PDVProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [cliente, setCliente] = useState(initialCliente || initialTelefone);
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [valor, setValor] = useState("");
  const [dataVenda, setDataVenda] = useState(() => dataLocalISO(new Date()));
  const [pay, setPay] = useState<Pay>("Pix");
  const [statusPag, setStatusPag] = useState<StatusPag>("Pago");
  const [obs, setObs] = useState("");
  const [petSelecionado, setPetSelecionado] = useState("");
  const [produtoBusca, setProdutoBusca] = useState("");

  const [carrinho, setCarrinho] = useState<Item[]>([]);
  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo>("percentual");
  const [desconto, setDesconto] = useState(0);
  const [cartaoModo, setCartaoModo] = useState<CartaoModo>("debito");
  const [cartaoParcelas, setCartaoParcelas] = useState<CartaoParcela>(1);
  const [frete, setFrete] = useState(0);

  const { vendas, addVenda, cancelarVenda } = useVendas();
  const [msgLog, setMsgLog] = useState<MsgLog[]>([]);

  const [cancelTarget, setCancelTarget] = useState<Venda | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [pdvPane, setPdvPane] = useState<"catalogo" | "carrinho">("catalogo");
  const [catalogoFiltro, setCatalogoFiltro] = useState<CatalogoFiltro>("racoes");
  
  const [modoAtribuicao, setModoAtribuicao] = useState(false);
  const [vendaBuscaAtribuicao, setVendaBuscaAtribuicao] = useState("");
  const [vendaSelecionadaAtribuicao, setVendaSelecionadaAtribuicao] = useState<Venda | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [produtosRes, clientesRes] = await Promise.all([
          fetch("/api/crm/produtos", { cache: "no-store" }),
          fetch("/api/crm/clientes", { cache: "no-store" }),
        ]);
        if (!alive) return;
        setProdutos(produtosRes.ok ? await produtosRes.json() : []);
        setClientes(clientesRes.ok ? await clientesRes.json() : []);
        if (!clientesRes.ok) toast.error("Nao foi possivel carregar os clientes");
      } catch {
        if (alive) toast.error("Nao foi possivel carregar os dados do PDV");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const totalRapido = Number(valor.replace(",", ".")) || 0;
  const vendaComItens = carrinho.length > 0;
  const subtotalFull = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const custoFull = carrinho.reduce((s, i) => s + i.precoCompra * i.qtd, 0);
  const descontoBase = expandido || vendaComItens ? subtotalFull : totalRapido;
  const descontoValor =
    descontoTipo === "percentual"
      ? Math.round(descontoBase * Math.min(Math.max(0, desconto), 100)) / 100
      : Math.round(Math.min(Math.max(0, desconto), descontoBase) * 100) / 100;
  const descontoPct =
    descontoBase > 0 ? Math.round((descontoValor / descontoBase) * 10000) / 100 : 0;
  const descontoRotulo =
    descontoTipo === "percentual" ? `${descontoPct.toLocaleString("pt-BR")}%` : brl(descontoValor);
  const descontoObservacao =
    descontoTipo === "percentual"
      ? `${descontoRotulo} (${brl(descontoValor)})`
      : brl(descontoValor);
  const totalFull = Math.max(0, subtotalFull - descontoValor + frete);
  const totalRapidoFinal = Math.max(0, totalRapido - descontoValor);
  const lucro = totalFull - custoFull;
  const total = expandido || vendaComItens ? totalFull : totalRapidoFinal;
  const totalBruto = expandido || vendaComItens ? subtotalFull + frete : totalRapido;
  const taxaMaquininhaBase = total;
  const taxaMaquininhaPct =
    pay === "Cartão"
      ? cartaoModo === "debito"
        ? taxasCartao.debito
        : taxasCartao.credito[cartaoParcelas]
      : 0;
  const taxaMaquininhaValor =
    pay === "Cartão" ? Math.round(taxaMaquininhaBase * taxaMaquininhaPct) / 100 : 0;
  const taxaMaquininhaForma = cartaoModo === "debito" ? "Débito" : `Crédito ${cartaoParcelas}x`;
  const taxaMaquininhaRotulo = `${taxaMaquininhaForma} ${formatPct(taxaMaquininhaPct)}%`;
  const taxaMaquininhaObservacao = `${taxaMaquininhaRotulo} (${brl(taxaMaquininhaValor)})`;
  const lucroLiquido = lucro - taxaMaquininhaValor;
  const valorLiquidoRecebido = Math.max(0, total - taxaMaquininhaValor);
  const margem = totalFull > 0 ? (lucroLiquido / totalFull) * 100 : 0;

  const clienteSel = useMemo(() => {
    return (
      clientes.find((c) => clienteCombina(c, cliente, true)) ??
      clientes.find((c) => clienteCombina(c, cliente))
    );
  }, [cliente, clientes]);
  const buscarCliente = (valorBusca: string) => {
    return (
      clientes.find((c) => clienteCombina(c, valorBusca, true)) ??
      clientes.find((c) => clienteCombina(c, valorBusca))
    );
  };
  const sugestoes = useMemo(() => {
    const q = normalizarBusca(cliente);
    const digits = telefoneDigits(cliente);
    if (!q && !digits) return clientes.slice(0, 12);
    return clientes.filter((c) => clienteCombina(c, cliente)).slice(0, 30);
  }, [cliente, clientes]);
  const petsCliente = useMemo(() => {
    const nomes = new Map<string, string>();

    for (const pet of clienteSel?.petsDetalhes ?? []) {
      if (pet.nome.trim()) nomes.set(pet.nome.trim().toLowerCase(), pet.nome.trim());
    }

    for (const pet of clienteSel?.pets ?? []) {
      if (pet.trim()) nomes.set(pet.trim().toLowerCase(), pet.trim());
    }

    return Array.from(nomes.values());
  }, [clienteSel]);
  const produtosCatalogo = useMemo(() => {
    if (catalogoFiltro === "racoes") return produtos.filter(isRacaoProduto);
    if (catalogoFiltro === "baixo") {
      return produtos.filter((produto) => produto.estoque <= produto.minimo);
    }
    return produtos;
  }, [catalogoFiltro, produtos]);
  const produtosFiltrados = useMemo(() => {
    const termo = normalizarBusca(produtoBusca);
    const base = expandido ? produtosCatalogo : produtos;

    return base.filter((produto) => {
      if (!termo) return true;
      return textoBuscaProduto(produto).includes(termo);
    });
  }, [expandido, produtoBusca, produtos, produtosCatalogo]);
  const catalogoTabs = useMemo(
    () => [
      { key: "racoes" as const, label: "Racoes", count: produtos.filter(isRacaoProduto).length },
      { key: "todos" as const, label: "Todos", count: produtos.length },
      {
        key: "baixo" as const,
        label: "Baixo estoque",
        count: produtos.filter((produto) => produto.estoque <= produto.minimo).length,
      },
    ],
    [produtos],
  );

  useEffect(() => {
    if (petsCliente.length === 0) {
      if (petSelecionado) setPetSelecionado("");
      return;
    }

    if (!petsCliente.includes(petSelecionado)) {
      setPetSelecionado(petsCliente[0]);
    }
  }, [petSelecionado, petsCliente]);

  useEffect(() => {
    if (cliente) return;
    if (initialCliente || initialTelefone) {
      setCliente(initialCliente || initialTelefone);
    }
  }, [cliente, initialCliente, initialTelefone]);

  const construirMensagem = (v?: Partial<Venda>) => {
    const nome = v?.cliente || cliente || "cliente";
    const linhaItem = (item: Item) =>
      `â€¢ ${item.qtd}Ã— ${item.nome}${item.petNome ? ` (${item.petNome})` : ""} â€” ${brl(item.preco * item.qtd)}`;
    const itens =
      expandido && carrinho.length
        ? carrinho.map(linhaItem).join("\n")
        : v?.itens?.map(linhaItem).join("\n") || "Pedido avulso";
    /*
      expandido && carrinho.length
        ? carrinho.map((i) => `• ${i.qtd}× ${i.nome} — ${brl(i.preco * i.qtd)}`).join("\n")
        : v?.itens?.map((i) => `• ${i.qtd}× ${i.nome} — ${brl(i.preco * i.qtd)}`).join("\n") ||
          "• Pedido avulso";
    */
    const t = v?.total ?? total;
    const pagamento = v?.pay ?? pay;
    const sPag = v?.statusPag ?? statusPag;
    const c = buscarCliente(nome);
    const endereco = c?.endereco ? `\n📍 ${c.endereco}${c.bairro ? `, ${c.bairro}` : ""}` : "";
    const obsLinha = (v?.obs ?? obs) ? `\n📝 ${v?.obs ?? obs}` : "";
    return `Olá ${nome.split(" ")[0]} 😊 seu pedido foi separado!\n\n${itens}\n\n💰 Total: ${brl(t)}\n💳 Pagamento: ${pagamento} · ${sPag === "Pago" ? "✅ Pago" : "⏳ Pagamento pendente"}${endereco}${obsLinha}\n\nQualquer dúvida estamos por aqui 🐾`;
  };

  const enviarWhats = (venda?: Venda) => {
    const nome = venda?.cliente || cliente;
    if (!nome) return;
    const c = buscarCliente(nome);
    const fone = (venda?.telefone || c?.telefone || "").replace(/\D/g, "");
    const msg = construirMensagem(venda);
    const url = fone
      ? `https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setMsgLog((m) =>
      [
        {
          id: `m${Date.now()}`,
          cliente: nome,
          telefone: c?.telefone || venda?.telefone || "",
          quando: "agora",
          preview: msg.slice(0, 64) + "…",
          vendaId: venda?.id,
        },
        ...m,
      ].slice(0, 20),
    );
  };

  const finalizar = async (whats = false) => {
    const nome = cliente.trim() || "Avulso";
    const c = buscarCliente(nome);
    const itens = carrinho.length
      ? [...carrinho]
      : expandido
        ? []
        : [
            {
              sku: "avulso",
              nome: obs || "Venda rapida",
              preco: totalRapido,
              precoCompra: 0,
              qtd: 1,
            },
          ];
    const telefone = c?.telefone || "";
    if (expandido && carrinho.length === 0) {
      toast.error("Adicione produtos ao carrinho");
      return;
    }
    if (!expandido && carrinho.length === 0 && !totalRapido) {
      toast.error("Informe um valor ou selecione um produto do estoque");
      return;
    }
    if (total <= 0) {
      toast.error("O total da venda precisa ser maior que zero");
      return;
    }
    const petVenda =
      petSelecionado.trim() || itens.find((item) => item.petNome)?.petNome || c?.pets?.[0] || "";
    const observacaoAuto = carrinho.length
      ? observacaoRecompraPdv({ itens, produtos, cliente: c })
      : "";
    const observacaoDesconto = descontoValor > 0 ? `Desconto PDV ${descontoObservacao}` : "";
    const observacaoTaxa =
      taxaMaquininhaValor > 0 ? `Taxa maquininha ${taxaMaquininhaObservacao}` : "";
    const observacaoPedido = [obs.trim(), observacaoDesconto, observacaoTaxa, observacaoAuto]
      .filter((parte) => parte.length > 0)
      .join(" | ");
    const momentoVenda = dataHoraVenda(dataVenda);
    const v: Venda = {
      id: `V-${1043 + vendas.length}`,
      hora: momentoVenda.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      data: momentoVenda.toLocaleDateString("pt-BR"),
      cliente: nome,
      telefone,
      itens,
      total,
      taxaMaquininha: taxaMaquininhaValor,
      lucroLiquido,
      pay,
      statusPag,
      status: "Concluída",
      obs: observacaoPedido,
      whatsEnviado: whats,
    };
    const response = await fetch("/api/crm/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome,
        telefone,
        total,
        totalBruto,
        descontoPercentual: descontoPct,
        descontoValor,
        taxaMaquininha: taxaMaquininhaValor,
        formaPagamento: pay,
        observacao: observacaoPedido || (expandido ? "Pedido do PDV" : "Venda rapida do PDV"),
        bairro: c?.bairro ?? null,
        pet: petVenda || null,
        pago: statusPag === "Pago",
        dataVenda: momentoVenda.toISOString(),
        itens: carrinho.length
          ? itens.map((item) => ({
              sku: item.sku,
              nome: item.nome,
              quantidade: item.qtd,
              preco: item.preco,
              precoCompra: item.precoCompra,
              petNome: item.petNome || petVenda || null,
            }))
          : [],
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(data?.erro ?? "Nao foi possivel finalizar a venda");
      return;
    }

    const vendaFinalizada = { ...v, id: data?.id ?? v.id };
    addVenda(vendaFinalizada);
    toast.success("Venda finalizada");
    if (whats) enviarWhats(vendaFinalizada);
    if (!c) {
      fetch("/api/crm/clientes", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((rows) => {
          if (Array.isArray(rows)) setClientes(rows);
        })
        .catch(() => undefined);
    }
    setCliente("");
    setValor("");
    setObs("");
    setPetSelecionado("");
    setProdutoBusca("");
    setCarrinho([]);
    setDesconto(0);
    setFrete(0);
    setDataVenda(dataLocalISO(new Date()));
  };

  const finalizarAtribuicao = async () => {
    if (!vendaSelecionadaAtribuicao || !totalRapido || totalRapido <= 0) {
      toast.error("Selecione uma venda e informe um valor válido");
      return;
    }

    const observacaoDesconto = descontoValor > 0 ? `Desconto PDV ${descontoObservacao}` : "";
    const observacaoTaxa = taxaMaquininhaValor > 0 ? `Taxa maquininha ${taxaMaquininhaObservacao}` : "";
    const observacaoAtribuicao = `Atribuição adicional de ${brl(totalRapido)} para venda ${vendaSelecionadaAtribuicao.id}${obs ? ` · ${obs}` : ""}`;
    const observacaoPedido = [observacaoAtribuicao, observacaoDesconto, observacaoTaxa]
      .filter((parte) => parte.length > 0)
      .join(" | ");

    const momentoVenda = dataHoraVenda(dataVenda);
    const v: Venda = {
      id: `V-${1043 + vendas.length}`,
      hora: momentoVenda.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      data: momentoVenda.toLocaleDateString("pt-BR"),
      cliente: vendaSelecionadaAtribuicao.cliente,
      telefone: vendaSelecionadaAtribuicao.telefone,
      itens: [
        {
          sku: "atrib",
          nome: `Atribuição para ${vendaSelecionadaAtribuicao.id}`,
          preco: totalRapido,
          precoCompra: 0,
          qtd: 1,
        },
      ],
      total: total,
      taxaMaquininha: taxaMaquininhaValor,
      lucroLiquido: -taxaMaquininhaValor,
      pay,
      statusPag,
      status: "Concluída",
      obs: observacaoPedido,
      whatsEnviado: false,
      vendaOrigem: vendaSelecionadaAtribuicao.id,
      adicionalDe: totalRapido,
    };

    const response = await fetch("/api/crm/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: vendaSelecionadaAtribuicao.cliente,
        telefone: vendaSelecionadaAtribuicao.telefone,
        total,
        totalBruto: totalRapido,
        descontoPercentual: 0,
        descontoValor: 0,
        taxaMaquininha: taxaMaquininhaValor,
        formaPagamento: pay,
        observacao: observacaoPedido || "Atribuição adicional do PDV",
        bairro: buscarCliente(vendaSelecionadaAtribuicao.cliente)?.bairro ?? null,
        pet: null,
        pago: statusPag === "Pago",
        dataVenda: momentoVenda.toISOString(),
        itens: [],
        vendaOrigem: vendaSelecionadaAtribuicao.id,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(data?.erro ?? "Não foi possível registrar a atribuição");
      return;
    }

    const vendaFinalizada = { ...v, id: data?.id ?? v.id };
    addVenda(vendaFinalizada);
    toast.success(`Atribuição de ${brl(totalRapido)} registrada!`);

    setValor("");
    setObs("");
    setModoAtribuicao(false);
    setVendaBuscaAtribuicao("");
    setVendaSelecionadaAtribuicao(null);
    setDesconto(0);
    setDataVenda(dataLocalISO(new Date()));
  };

  const confirmarCancelamento = () => {
    if (!cancelTarget || !cancelMotivo.trim()) return;
    cancelarVenda(cancelTarget.id, cancelMotivo);
    setCancelTarget(null);
    setCancelMotivo("");
  };

  const add = (p: (typeof produtos)[number]) =>
    setCarrinho((c) => {
      const petNome = petLinha(petSelecionado) || null;
      const totalSku = c
        .filter((item) => item.sku === p.sku)
        .reduce((sum, item) => sum + item.qtd, 0);
      const ex = c.find((i) => i.sku === p.sku && petLinha(i.petNome) === petLinha(petNome));
      if (ex) {
        if (totalSku >= p.estoque) {
          toast.error("Quantidade maior que o estoque disponivel");
          return c;
        }

        return c.map((i) =>
          itemCarrinhoKey(i) === itemCarrinhoKey(ex) ? { ...i, qtd: i.qtd + 1 } : i,
        );
      }

      if (totalSku >= p.estoque) {
        toast.error("Quantidade maior que o estoque disponivel");
        return c;
      }

      return [
        ...c,
        {
          sku: p.sku,
          nome: p.nome,
          preco: p.preco,
          precoCompra: p.precoCompra,
          qtd: 1,
          petNome,
        },
      ];
    });
  const change = (itemAtual: Item, delta: number) =>
    setCarrinho((c) =>
      c.flatMap((i) => {
        if (itemCarrinhoKey(i) !== itemCarrinhoKey(itemAtual)) return [i];

        const produto = produtos.find((p) => p.sku === itemAtual.sku);
        const totalSku = c
          .filter((item) => item.sku === itemAtual.sku)
          .reduce((sum, item) => sum + item.qtd, 0);
        const quantidade = i.qtd + delta;
        if (quantidade <= 0) return [];
        if (produto && delta > 0 && totalSku >= produto.estoque) {
          toast.error("Quantidade maior que o estoque disponivel");
          return [i];
        }

        return [{ ...i, qtd: quantidade }];
      }),
    );

  const alterarPetItem = (itemAtual: Item, petNome: string) =>
    setCarrinho((c) => {
      const origemKey = itemCarrinhoKey(itemAtual);
      const proximoPet = petLinha(petNome) || null;
      let movido: Item | null = null;
      const restantes: Item[] = [];

      for (const item of c) {
        if (!movido && itemCarrinhoKey(item) === origemKey) {
          movido = { ...item, petNome: proximoPet };
        } else {
          restantes.push(item);
        }
      }

      if (!movido) return c;

      const destinoKey = itemCarrinhoKey(movido);
      const destinoIndex = restantes.findIndex((item) => itemCarrinhoKey(item) === destinoKey);
      if (destinoIndex >= 0) {
        return restantes.map((item, index) =>
          index === destinoIndex ? { ...item, qtd: item.qtd + movido!.qtd } : item,
        );
      }

      return [...restantes, movido];
    });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Zap className="size-6 text-primary" /> PDV
          </h1>
          <p className="text-sm text-muted-foreground">
            {expandido
              ? "Modo completo · produtos, estoque e margem"
              : "Modo rápido · venda em segundos"}
          </p>
        </div>
        <button
          onClick={() => setExpandido((v) => !v)}
          className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary"
        >
          {expandido ? (
            <>
              <ChevronUp className="size-4" /> Recolher
            </>
          ) : (
            <>
              <ChevronDown className="size-4" /> Expandir venda
            </>
          )}
        </button>
      </div>

      {!expandido ? (
        <div className="card-soft p-5 max-w-2xl mx-auto space-y-4">
          {/* Modo seleção: Nova venda ou Atribuição */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => {
                setModoAtribuicao(false);
                setVendaBuscaAtribuicao("");
                setVendaSelecionadaAtribuicao(null);
              }}
              className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${
                !modoAtribuicao
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
            >
              + Nova venda
            </button>
            <button
              onClick={() => setModoAtribuicao(true)}
              className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${
                modoAtribuicao
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
            >
              🔗 Atribuir valor
            </button>
          </div>

          {!modoAtribuicao ? (
            <>
          {/* Cliente combobox */}
          <div className="relative">
            <Label icon={<User className="size-3.5" />}>Cliente</Label>
            <div className="relative">
              <input
                value={cliente}
                onChange={(e) => {
                  setCliente(e.target.value);
                  setShowClienteDD(true);
                }}
                onFocus={() => setShowClienteDD(true)}
                onBlur={() => setTimeout(() => setShowClienteDD(false), 150)}
                placeholder="Nome ou telefone…"
                className="w-full h-12 pl-4 pr-10 rounded-xl bg-secondary text-base outline-none focus:ring-2 ring-primary/30"
              />
              <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
            {showClienteDD && (
              <div className="absolute z-30 left-0 right-0 mt-1 card-soft p-1 max-h-72 overflow-y-auto">
                {sugestoes.length > 0 ? (
                  sugestoes.map((c) => (
                    <button
                      key={c.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setCliente(c.nome);
                        setShowClienteDD(false);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left"
                    >
                      <div className="size-9 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-sm shrink-0">
                        {c.nome
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{c.nome}</div>
                        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                          <Phone className="size-3" /> {c.telefone}
                          {c.bairro && (
                            <>
                              <span>·</span>
                              <MapPin className="size-3" /> {c.bairro}
                            </>
                          )}
                        </div>
                      </div>
                      {c.perfil === "VIP" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                          VIP
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    {clientes.length === 0
                      ? "Nenhum cliente cadastrado."
                      : "Nenhum cliente encontrado."}
                  </div>
                )}
              </div>
            )}
            {clienteSel && (
              <div className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-2">
                <Check className="size-3 text-success" /> {clienteSel.telefone} ·{" "}
                {clienteSel.bairro}
              </div>
            )}
          </div>

          {petsCliente.length > 0 && (
            <div>
              <Label>Pet da venda</Label>
              <select
                value={petSelecionado}
                onChange={(e) => setPetSelecionado(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              >
                {petsCliente.map((pet) => (
                  <option key={pet} value={pet}>
                    {pet}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label icon={<Search className="size-3.5" />}>Produto do estoque</Label>
            <input
              value={produtoBusca}
              onChange={(e) => setProdutoBusca(e.target.value)}
              placeholder="Buscar racao/produto para dar baixa..."
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
            {produtoBusca && produtosFiltrados.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2">
                {produtosFiltrados.slice(0, 6).map((p) => (
                  <button
                    key={p.sku}
                    type="button"
                    onClick={() => add(p)}
                    className="text-left rounded-xl border border-border p-3 hover:bg-secondary"
                  >
                    <div className="font-semibold text-sm truncate">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {brl(p.preco)} · estoque {p.estoque}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {carrinho.length > 0 && (
              <div className="space-y-2">
                {carrinho.map((item) => (
                  <div
                    key={itemCarrinhoKey(item)}
                    className="flex items-center gap-2 rounded-xl bg-secondary p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{item.nome}</div>
                      <div className="text-xs text-muted-foreground">{brl(item.preco)} cada</div>
                      {petsCliente.length > 0 && (
                        <select
                          value={item.petNome ?? ""}
                          onChange={(event) => alterarPetItem(item, event.target.value)}
                          className="mt-1 h-8 w-full rounded-lg bg-card px-2 text-xs outline-none"
                        >
                          <option value="">Sem pet especifico</option>
                          {petsCliente.map((pet) => (
                            <option key={pet} value={pet}>
                              {pet}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => change(item, -1)}
                      className="size-8 rounded-lg bg-card grid place-items-center"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{item.qtd}</span>
                    <button
                      type="button"
                      onClick={() => change(item, 1)}
                      className="size-8 rounded-lg bg-card grid place-items-center"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => change(item, -item.qtd)}
                      className="size-8 rounded-lg text-destructive hover:bg-destructive/10 grid place-items-center"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label icon={<Receipt className="size-3.5" />}>Valor total</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                R$
              </span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0,00"
                disabled={vendaComItens}
                className="w-full h-16 pl-12 pr-4 rounded-xl bg-secondary text-3xl font-bold outline-none focus:ring-2 ring-primary/30 tabular-nums disabled:opacity-60"
              />
            </div>
            {vendaComItens && (
              <div className="mt-1 text-xs text-muted-foreground">
                Total calculado pelos produtos selecionados: {brl(total)}
              </div>
            )}
          </div>

          <div>
            <DiscountField
              tipo={descontoTipo}
              value={desconto}
              base={descontoBase}
              onTipoChange={setDescontoTipo}
              onChange={setDesconto}
            />
            {descontoValor > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Desconto de {brl(descontoValor)} aplicado. Total final: {brl(total)}
              </div>
            )}
          </div>

          <div>
            <Label icon={<History className="size-3.5" />}>Data da venda</Label>
            <input
              type="date"
              value={dataVenda}
              max={dataLocalISO(new Date())}
              onChange={(e) => setDataVenda(e.target.value || dataLocalISO(new Date()))}
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          <div>
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              <PayBtn
                icon={<QrCode className="size-5" />}
                label="Pix"
                active={pay === "Pix"}
                onClick={() => setPay("Pix")}
              />
              <PayBtn
                icon={<CreditCard className="size-5" />}
                label="Cartão"
                active={pay === "Cartão"}
                onClick={() => setPay("Cartão")}
              />
              <PayBtn
                icon={<Banknote className="size-5" />}
                label="Dinheiro"
                active={pay === "Dinheiro"}
                onClick={() => setPay("Dinheiro")}
              />
            </div>
          </div>

          {pay === "Cartão" && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
              <CardFeeSelector
                modo={cartaoModo}
                parcelas={cartaoParcelas}
                taxaPercentual={taxaMaquininhaPct}
                taxaValor={taxaMaquininhaValor}
                liquido={valorLiquidoRecebido}
                onModoChange={setCartaoModo}
                onParcelasChange={setCartaoParcelas}
              />
            </div>
          )}

          <div>
            <Label>Status do pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStatusPag("Pago")}
                className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pago" ? "bg-success text-success-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}
              >
                ✅ Pago
              </button>
              <button
                onClick={() => setStatusPag("Pendente")}
                className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pendente" ? "bg-warning text-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}
              >
                ⏳ Pendente
              </button>
            </div>
          </div>

          <div>
            <Label>Observação (opcional)</Label>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: entregar até 18h"
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => finalizar(false)}
              disabled={total <= 0}
              className="h-14 rounded-xl bg-success text-success-foreground font-bold text-lg shadow hover:opacity-90 disabled:opacity-40 transition"
            >
              Finalizar · {brl(total)}
            </button>
            <button
              onClick={() => (total ? finalizar(true) : enviarWhats())}
              title="Enviar resumo no WhatsApp"
              className="h-14 px-5 rounded-xl bg-[#25D366] text-white font-semibold shadow hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-2"
            >
              <MessageCircle className="size-5" />
              <span className="hidden sm:inline">Enviar no WhatsApp</span>
            </button>
          </div>
            </>
          ) : (
            <>
            {/* Modo Atribuição */}
            <div className="relative">
              <Label icon={<History className="size-3.5" />}>Buscar venda para atribuir</Label>
              <input
                value={vendaBuscaAtribuicao}
                onChange={(e) => {
                  setVendaBuscaAtribuicao(e.target.value);
                  setVendaSelecionadaAtribuicao(null);
                }}
                placeholder="ID da venda (ex: V-1043) ou cliente…"
                className="w-full h-12 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>

            {vendaBuscaAtribuicao && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Vendas encontradas:</div>
                {vendas
                  .filter((v) => {
                    const termo = vendaBuscaAtribuicao.toLowerCase();
                    return (
                      v.id.toLowerCase().includes(termo) ||
                      v.cliente.toLowerCase().includes(termo)
                    );
                  })
                  .slice(0, 10)
                  .map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setVendaSelecionadaAtribuicao(v);
                        setVendaBuscaAtribuicao("");
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition ${
                        vendaSelecionadaAtribuicao?.id === v.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm">{v.id}</div>
                          <div className="text-xs text-muted-foreground">{v.cliente}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{brl(v.total)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {v.data} · {v.hora}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {vendaSelecionadaAtribuicao && (
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-4 space-y-3">
                <div>
                  <div className="text-xs font-bold text-muted-foreground mb-1">Venda selecionada:</div>
                  <div className="font-semibold">{vendaSelecionadaAtribuicao.id}</div>
                  <div className="text-sm text-muted-foreground">{vendaSelecionadaAtribuicao.cliente}</div>
                  <div className="text-sm font-bold mt-1">Total original: {brl(vendaSelecionadaAtribuicao.total)}</div>
                </div>
              </div>
            )}

            {vendaSelecionadaAtribuicao && (
              <>
                <div>
                  <Label icon={<Receipt className="size-3.5" />}>Valor adicional</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                      R$
                    </span>
                    <input
                      inputMode="decimal"
                      value={valor}
                      onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                      placeholder="0,00"
                      className="w-full h-16 pl-12 pr-4 rounded-xl bg-secondary text-3xl font-bold outline-none focus:ring-2 ring-primary/30 tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <Label>Forma de pagamento</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <PayBtn
                      icon={<QrCode className="size-5" />}
                      label="Pix"
                      active={pay === "Pix"}
                      onClick={() => setPay("Pix")}
                    />
                    <PayBtn
                      icon={<CreditCard className="size-5" />}
                      label="Cartão"
                      active={pay === "Cartão"}
                      onClick={() => setPay("Cartão")}
                    />
                    <PayBtn
                      icon={<Banknote className="size-5" />}
                      label="Dinheiro"
                      active={pay === "Dinheiro"}
                      onClick={() => setPay("Dinheiro")}
                    />
                  </div>
                </div>

                {pay === "Cartão" && (
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 space-y-2">
                    <CardFeeSelector
                      modo={cartaoModo}
                      parcelas={cartaoParcelas}
                      taxaPercentual={taxaMaquininhaPct}
                      taxaValor={taxaMaquininhaValor}
                      liquido={valorLiquidoRecebido}
                      onModoChange={setCartaoModo}
                      onParcelasChange={setCartaoParcelas}
                    />
                  </div>
                )}

                <div>
                  <Label>Status do pagamento</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setStatusPag("Pago")}
                      className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pago" ? "bg-success text-success-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}
                    >
                      ✅ Pago
                    </button>
                    <button
                      onClick={() => setStatusPag("Pendente")}
                      className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pendente" ? "bg-warning text-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}
                    >
                      ⏳ Pendente
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Observação (opcional)</Label>
                  <input
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Ex: ajuste de preço"
                    className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>

                <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5">
                  <Row label="Valor adicional" value={brl(totalRapido)} />
                  {taxaMaquininhaValor > 0 && (
                    <Row
                      label={`Taxa maquininha (${taxaMaquininhaRotulo})`}
                      value={`-${brl(taxaMaquininhaValor)}`}
                      muted
                    />
                  )}
                  <Row label="Total a receber" value={brl(total)} accent="success" />
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    onClick={() => finalizarAtribuicao()}
                    disabled={!vendaSelecionadaAtribuicao || totalRapido <= 0}
                    className="h-14 rounded-xl bg-success text-success-foreground font-bold text-lg shadow hover:opacity-90 disabled:opacity-40 transition"
                  >
                    Atribuir · {brl(total)}
                  </button>
                  <button
                    onClick={() => enviarWhats(vendaSelecionadaAtribuicao)}
                    title="Enviar resumo no WhatsApp"
                    className="h-14 px-5 rounded-xl bg-[#25D366] text-white font-semibold shadow hover:opacity-90 transition inline-flex items-center gap-2"
                  >
                    <MessageCircle className="size-5" />
                  </button>
                </div>
              </>
            )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="lg:hidden flex rounded-xl bg-secondary p-1 gap-1">
            <button
              onClick={() => setPdvPane("catalogo")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${pdvPane === "catalogo" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
            >
              Catálogo
            </button>
            <button
              onClick={() => setPdvPane("carrinho")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${pdvPane === "carrinho" ? "bg-card shadow text-foreground" : "text-muted-foreground"}`}
            >
              Carrinho ({carrinho.length})
            </button>
          </div>
          <div className="grid lg:grid-cols-[1fr_400px] gap-4">
            <div
              className={`card-soft flex flex-col overflow-hidden h-[calc(100dvh-14rem)] lg:h-[calc(100vh-12rem)] ${pdvPane !== "catalogo" ? "max-lg:hidden" : ""}`}
            >
              <div className="p-4 border-b border-border space-y-3">
                <div className="relative">
                  <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={produtoBusca}
                    onChange={(e) => setProdutoBusca(e.target.value)}
                    placeholder="Buscar produto ou ler código..."
                    className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {catalogoTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setCatalogoFiltro(tab.key)}
                      className={`h-8 shrink-0 rounded-lg px-3 text-xs font-bold transition ${
                        catalogoFiltro === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4">
                {produtosFiltrados.length === 0 ? (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <div className="font-semibold text-sm">Nenhum produto encontrado</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ajuste a busca ou troque o filtro do catalogo.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {produtosFiltrados.map((p) => {
                      const semEstoque = p.estoque <= 0;

                      return (
                        <button
                          key={p.sku}
                          type="button"
                          onClick={() => add(p)}
                          disabled={semEstoque}
                          className="group rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary hover:shadow-md disabled:opacity-50 disabled:hover:border-border disabled:hover:shadow-none"
                        >
                          <div className="flex gap-3">
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                              {p.fotoUrl ? (
                                <img
                                  src={p.fotoUrl}
                                  alt={p.nome}
                                  className="size-full object-cover"
                                />
                              ) : (
                                <div className="grid size-full place-items-center text-lg font-bold text-muted-foreground">
                                  {p.categoria.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                                {p.categoria} · {p.sku}
                              </div>
                              <div className="mt-0.5 min-h-9 font-semibold text-xs leading-tight line-clamp-2">
                                {p.nome}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="font-bold text-sm text-primary">
                                  {brl(p.preco)}
                                </span>
                                <span
                                  className={`text-[10px] font-bold ${
                                    p.estoque <= p.minimo
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {semEstoque ? "sem estoque" : `${p.estoque} un`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex h-8 items-center justify-center gap-1.5 rounded-lg bg-secondary text-xs font-bold text-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                            <Plus className="size-3.5" />
                            Selecionar
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              className={`card-soft flex flex-col overflow-hidden h-[calc(100dvh-14rem)] lg:h-[calc(100vh-12rem)] ${pdvPane !== "carrinho" ? "max-lg:hidden" : ""}`}
            >
              <div className="p-4 border-b border-border shrink-0">
                <input
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  list="clientes-full"
                  placeholder="Cliente…"
                  className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none mb-2"
                />
                <datalist id="clientes-full">
                  {clientes.map((c) => (
                    <option key={c.id} value={c.nome} />
                  ))}
                </datalist>
                {petsCliente.length > 0 && (
                  <select
                    value={petSelecionado}
                    onChange={(e) => setPetSelecionado(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none mb-2"
                  >
                    {petsCliente.map((pet) => (
                      <option key={pet} value={pet}>
                        {pet}
                      </option>
                    ))}
                  </select>
                )}
                <h3 className="font-semibold">Carrinho</h3>
                <p className="text-xs text-muted-foreground">
                  {carrinho.length} itens · margem {margem.toFixed(0)}%
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-2">
                {carrinho.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-12">
                    Adicione produtos ao carrinho
                  </div>
                )}
                {carrinho.map((i) => (
                  <div key={itemCarrinhoKey(i)} className="card-soft p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{i.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{brl(i.preco)} · un</div>
                      {petsCliente.length > 0 && (
                        <select
                          value={i.petNome ?? ""}
                          onChange={(event) => alterarPetItem(i, event.target.value)}
                          className="mt-1 h-8 w-full rounded-lg bg-secondary px-2 text-xs outline-none"
                        >
                          <option value="">Sem pet especifico</option>
                          {petsCliente.map((pet) => (
                            <option key={pet} value={pet}>
                              {pet}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => change(i, -1)}
                        className="size-7 rounded-lg bg-secondary grid place-items-center"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center font-bold text-sm">{i.qtd}</span>
                      <button
                        onClick={() => change(i, 1)}
                        className="size-7 rounded-lg bg-secondary grid place-items-center"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => change(i, -i.qtd)}
                      className="text-destructive p-1.5 rounded-lg hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <div>
                  <Label>Data da venda</Label>
                  <input
                    type="date"
                    value={dataVenda}
                    max={dataLocalISO(new Date())}
                    onChange={(e) => setDataVenda(e.target.value || dataLocalISO(new Date()))}
                    className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <DiscountField
                    tipo={descontoTipo}
                    value={desconto}
                    base={descontoBase}
                    onTipoChange={setDescontoTipo}
                    onChange={setDesconto}
                  />
                  <NumField label="Frete" value={frete} onChange={setFrete} />
                </div>
                <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5">
                  <Row label="Subtotal" value={brl(subtotalFull)} />
                  {descontoValor > 0 && (
                    <Row label={`Desconto (${descontoRotulo})`} value={`-${brl(descontoValor)}`} />
                  )}
                  <Row label="Custo" value={brl(custoFull)} muted />
                  {taxaMaquininhaValor > 0 && (
                    <Row
                      label={`Taxa maquininha (${taxaMaquininhaRotulo})`}
                      value={`-${brl(taxaMaquininhaValor)}`}
                      muted
                    />
                  )}
                  <Row label="Lucro liquido" value={brl(lucroLiquido)} accent="success" />
                </div>
              </div>

              <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-lg">{brl(totalFull)}</span>
                  <div className="flex gap-1">
                    <PayBtn
                      icon={<QrCode className="size-3.5" />}
                      label="Pix"
                      active={pay === "Pix"}
                      onClick={() => setPay("Pix")}
                    />
                    <PayBtn
                      icon={<CreditCard className="size-3.5" />}
                      label="Cartão"
                      active={pay === "Cartão"}
                      onClick={() => setPay("Cartão")}
                    />
                    <PayBtn
                      icon={<Banknote className="size-3.5" />}
                      label="Dinheiro"
                      active={pay === "Dinheiro"}
                      onClick={() => setPay("Dinheiro")}
                    />
                  </div>
                </div>
                {pay === "Cartão" && (
                  <CardFeeSelector
                    modo={cartaoModo}
                    parcelas={cartaoParcelas}
                    taxaPercentual={taxaMaquininhaPct}
                    taxaValor={taxaMaquininhaValor}
                    liquido={valorLiquidoRecebido}
                    onModoChange={setCartaoModo}
                    onParcelasChange={setCartaoParcelas}
                  />
                )}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    onClick={() => finalizar(false)}
                    disabled={carrinho.length === 0 || totalFull <= 0}
                    className="h-12 rounded-xl bg-success text-success-foreground font-bold text-base hover:opacity-90 disabled:opacity-40 transition"
                  >
                    Finalizar · {brl(totalFull)}
                  </button>
                  <button
                    onClick={() => (carrinho.length ? finalizar(true) : enviarWhats())}
                    className="h-12 px-4 rounded-xl bg-[#25D366] text-white font-semibold hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStatusPag("Pago")}
                    className={`h-9 rounded-lg text-xs font-semibold ${statusPag === "Pago" ? "bg-success text-success-foreground" : "bg-secondary"}`}
                  >
                    ✅ Pago
                  </button>
                  <button
                    onClick={() => setStatusPag("Pendente")}
                    className={`h-9 rounded-lg text-xs font-semibold ${statusPag === "Pendente" ? "bg-warning text-foreground" : "bg-secondary"}`}
                  >
                    ⏳ Pendente
                  </button>
                </div>
                </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendas recentes + cancelamento */}
      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <History className="size-4 text-primary" /> Vendas recentes
            </h2>
            <p className="text-xs text-muted-foreground">
              Cancele, reenvie no WhatsApp ou consulte status
            </p>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground bg-secondary px-2 py-1 rounded-md">
            {vendas.length} vendas
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-5 py-3">Pedido</th>
                <th className="font-medium px-5 py-3">Cliente</th>
                <th className="font-medium px-5 py-3">Itens</th>
                <th className="font-medium px-5 py-3 text-right">Total</th>
                <th className="font-medium px-5 py-3">Pagto</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr
                  key={v.id}
                  className={`border-t border-border hover:bg-secondary/30 ${v.status === "Cancelada" ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-3 font-mono text-xs font-bold">
                    {v.id}
                    <div className="text-[10px] text-muted-foreground font-sans">
                      {v.data} · {v.hora}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold">{v.cliente}</div>
                    <div className="text-[11px] text-muted-foreground">{v.telefone}</div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(" · ")}
                  </td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">
                    {brl(v.total)}
                    {v.taxaMaquininha ? (
                      <div className="text-[10px] text-muted-foreground font-sans">
                        Taxa {brl(v.taxaMaquininha)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <div>{v.pay}</div>
                    <span
                      className={`text-[10px] font-bold ${v.statusPag === "Pago" ? "text-success" : "text-warning"}`}
                    >
                      {v.statusPag}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                        v.status === "Concluída"
                          ? "bg-success/15 text-success"
                          : v.status === "Cancelada"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/15 text-warning"
                      }`}
                    >
                      {v.status}
                    </span>
                    {v.motivoCancel && (
                      <div
                        className="text-[10px] text-muted-foreground mt-1 max-w-[160px] truncate"
                        title={v.motivoCancel}
                      >
                        ↳ {v.motivoCancel}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => enviarWhats(v)}
                        title="Reenviar WhatsApp"
                        className="p-1.5 rounded-lg hover:bg-secondary text-[#25D366]"
                      >
                        <Send className="size-3.5" />
                      </button>
                      {v.status === "Concluída" && (
                        <button
                          onClick={() => setCancelTarget(v)}
                          title="Cancelar venda"
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Histórico WhatsApp */}
      <section className="card-soft p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2">
              <MessageCircle className="size-4 text-[#25D366]" /> Mensagens enviadas
            </h2>
            <p className="text-xs text-muted-foreground">
              Histórico recente · últimas {msgLog.length}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {msgLog.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-6">
              Nenhuma mensagem enviada ainda
            </div>
          )}
          {msgLog.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
              <div className="size-9 rounded-full bg-[#25D366]/15 text-[#25D366] grid place-items-center">
                <MessageCircle className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{m.cliente}</span>
                  {m.vendaId && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-card border border-border">
                      {m.vendaId}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{m.preview}</div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{m.quando}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Modal cancelamento */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40"
          onClick={() => setCancelTarget(null)}
        >
          <div
            className="card-soft p-5 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <RotateCcw className="size-4 text-destructive" /> Cancelar venda
                </h3>
                <p className="text-xs text-muted-foreground">
                  {cancelTarget.id} · {cancelTarget.cliente} · {brl(cancelTarget.total)}
                </p>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="p-1 rounded-lg hover:bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-xs space-y-1">
              <div className="font-semibold text-warning">Ao confirmar:</div>
              <div className="text-muted-foreground">↺ Produtos retornam ao estoque</div>
              <div className="text-muted-foreground">↺ Financeiro é estornado</div>
              <div className="text-muted-foreground">
                ↺ Histórico registrado com data e operador
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                Motivo do cancelamento
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: cliente desistiu, produto em falta…"
                className="mt-1 w-full p-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/70"
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={!cancelMotivo.trim()}
                className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5 inline-flex items-center gap-1">
      {icon} {children}
    </label>
  );
}

function DiscountField({
  tipo,
  value,
  base,
  onTipoChange,
  onChange,
  label = "Desconto",
}: {
  tipo: DescontoTipo;
  value: number;
  base: number;
  onTipoChange: (tipo: DescontoTipo) => void;
  onChange: (n: number) => void;
  label?: string;
}) {
  const max = tipo === "percentual" ? 100 : Math.max(0, base);

  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-[auto_1fr] gap-1.5">
        <div className="flex rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => onTipoChange("percentual")}
            className={`h-7 w-8 rounded-md text-xs font-bold ${tipo === "percentual" ? "bg-card text-primary shadow" : "text-muted-foreground"}`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => onTipoChange("valor")}
            className={`h-7 w-8 rounded-md text-xs font-bold ${tipo === "valor" ? "bg-card text-primary shadow" : "text-muted-foreground"}`}
          >
            R$
          </button>
        </div>
        <input
          type="number"
          min={0}
          max={max || undefined}
          value={value || ""}
          onChange={(e) => {
            const next = Number(e.target.value) || 0;
            onChange(Math.min(Math.max(0, next), max || next));
          }}
          placeholder="0"
          className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:ring-2 ring-primary/30"
        />
      </div>
    </div>
  );
}

function CardFeeSelector({
  modo,
  parcelas,
  taxaPercentual,
  taxaValor,
  liquido,
  onModoChange,
  onParcelasChange,
}: {
  modo: CartaoModo;
  parcelas: CartaoParcela;
  taxaPercentual: number;
  taxaValor: number;
  liquido: number;
  onModoChange: (modo: CartaoModo) => void;
  onParcelasChange: (parcelas: CartaoParcela) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Taxa maquininha</Label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex rounded-lg bg-secondary p-1">
          <button
            type="button"
            onClick={() => onModoChange("debito")}
            className={`h-8 flex-1 rounded-md text-xs font-bold ${
              modo === "debito" ? "bg-card text-primary shadow" : "text-muted-foreground"
            }`}
          >
            Débito
          </button>
          <button
            type="button"
            onClick={() => onModoChange("credito")}
            className={`h-8 flex-1 rounded-md text-xs font-bold ${
              modo === "credito" ? "bg-card text-primary shadow" : "text-muted-foreground"
            }`}
          >
            Crédito
          </button>
        </div>
        <select
          value={modo === "debito" ? 1 : parcelas}
          onChange={(event) => onParcelasChange(Number(event.target.value) as CartaoParcela)}
          disabled={modo === "debito"}
          className="h-10 min-w-20 rounded-lg bg-card border border-border px-2 text-sm outline-none disabled:opacity-50"
        >
          {parcelasCredito.map((parcela) => (
            <option key={parcela} value={parcela}>
              {parcela}x
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-card border border-border p-2">
          <div className="text-muted-foreground">Taxa</div>
          <div className="font-bold tabular-nums">{formatPct(taxaPercentual)}%</div>
        </div>
        <div className="rounded-lg bg-card border border-border p-2">
          <div className="text-muted-foreground">Desconto</div>
          <div className="font-bold tabular-nums">{brl(taxaValor)}</div>
        </div>
        <div className="rounded-lg bg-card border border-border p-2">
          <div className="text-muted-foreground">Líquido</div>
          <div className="font-bold tabular-nums">{brl(liquido)}</div>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        min={0}
        max={max}
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:ring-2 ring-primary/30"
      />
    </div>
  );
}
function Row({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: "success";
}) {
  return (
    <div
      className={`flex justify-between items-baseline ${bold ? "font-bold text-base pt-1.5 border-t border-border" : "text-xs"} ${muted ? "text-muted-foreground" : ""} ${accent === "success" ? "text-success font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
function PayBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
