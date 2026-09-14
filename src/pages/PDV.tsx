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
  Loader2,
  Pencil,
  Link as LinkIcon,
  PawPrint,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useVendas,
  type Pay,
  type StatusPag,
  type Item,
  type Venda,
} from "@/contexts/VendasContext";
import type { Cliente, PetDetalhe, Produto } from "@/lib/crm-types";
import {
  calcularDiasRecompraRacao,
  consumoDiarioPetRacao,
  inferirPesoRacaoKg,
  listarRacasPesoBase,
} from "@/lib/recompra-calculo";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dinheiroInputParaNumero = (valor: string): number => {
  const limpo = valor.trim();
  if (!limpo) return 0;

  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const numero = Number(normalizado);

  return Number.isFinite(numero) ? numero : 0;
};

const dataLocalISO = (d: Date) => d.toLocaleDateString("en-CA");

const dataHoraVenda = (dataISO: string) => {
  const agora = new Date();
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  if (!ano || !mes || !dia) return agora;
  return new Date(ano, mes - 1, dia, agora.getHours(), agora.getMinutes(), agora.getSeconds());
};

const dataVendaInput = (venda: Pick<Venda, "data" | "criadoEm">): string => {
  if (venda.criadoEm) {
    const data = new Date(venda.criadoEm);
    if (!Number.isNaN(data.getTime())) return dataLocalISO(data);
  }

  const [dia, mes, ano] = venda.data.split("/").map(Number);
  if (!ano || !mes || !dia) return dataLocalISO(new Date());
  return dataLocalISO(new Date(ano, mes - 1, dia));
};

const dataHoraVendaEditada = (dataISO: string, venda: Pick<Venda, "hora" | "criadoEm">): Date => {
  const base = dataHoraVenda(dataISO);
  const criadaEm = venda.criadoEm ? new Date(venda.criadoEm) : null;
  if (criadaEm && !Number.isNaN(criadaEm.getTime())) {
    base.setHours(criadaEm.getHours(), criadaEm.getMinutes(), criadaEm.getSeconds(), 0);
    return base;
  }

  const [hora, minuto] = venda.hora.split(":").map(Number);
  if (Number.isFinite(hora) && Number.isFinite(minuto)) {
    base.setHours(hora, minuto, 0, 0);
  }
  return base;
};

const isVendaHoje = (venda: Pick<Venda, "data">, hoje: string) => venda.data === hoje;

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

const especiePadraoProduto = (produto?: Produto, cliente?: Cliente): "cachorro" | "gato" => {
  const text = normalizarBusca(
    `${produto?.nome ?? ""} ${produto?.categoria ?? ""} ${produto?.detalhesTecnicos?.especie ?? ""}`,
  );
  if (
    text.includes("gato") ||
    text.includes("felin") ||
    text.includes("catsy") ||
    text.includes("special cat")
  ) {
    return "gato";
  }
  return cliente?.especies?.[0] ?? "cachorro";
};

const portePadraoProduto = (produto?: Produto): "pequeno" | "medio" | "grande" => {
  const text = normalizarBusca(`${produto?.nome ?? ""} ${produto?.detalhesTecnicos?.porte ?? ""}`);
  if (text.includes("pequeno") || text.includes("peq") || text.includes("mini")) return "pequeno";
  if (text.includes("grande") || text.includes("large") || text.includes("maxi")) return "grande";
  return "medio";
};

const markerValue = (value: string) => value.replace(/"/g, "'").trim();

const petsParaRecompra = (cliente?: Cliente, petNome?: string | null) => {
  const nomes = petNomes(petNome);
  if (nomes.length > 0) {
    return nomes.map((nome) => {
      const pet = cliente?.petsDetalhes?.find(
        (item) => item.nome.trim().toLowerCase() === nome.toLowerCase(),
      );
      return pet ?? { nome };
    });
  }
  if (cliente?.petsDetalhes?.length) return cliente.petsDetalhes.filter((pet) => pet.nome?.trim());
  if (cliente?.pets?.length) return cliente.pets.map((nome) => ({ nome }));
  return [{ nome: "Pet" }];
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

    const pesoKg = inferirPesoRacaoKg(produto, item.qtd);
    const pets = petsParaRecompra(cliente, item.petNome);
    const especiePadrao = especiePadraoProduto(produto, cliente);
    const portePadrao = portePadraoProduto(produto);
    const consumoDiarioG = pets.reduce((sum, pet) => {
      const consumo = consumoDiarioPetRacao({
        produto,
        pet,
        especiePadrao,
        portePadrao,
      });
      return sum + consumo.consumoDiaG;
    }, 0);
    const dias = calcularDiasRecompraRacao(pesoKg, consumoDiarioG);
    if (pesoKg <= 0 || consumoDiarioG <= 0) return [];

    const pet = item.petNome ? ` pet="${markerValue(item.petNome)}"` : "";
    return [
      `recompra_auto sku="${markerValue(item.sku)}"${pet} dias=${dias} consumo_diario_g=${consumoDiarioG} peso_kg=${pesoKg.toFixed(2)}`,
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

const petNomes = (petNome?: string | null) =>
  Array.from(
    new Set(
      (petNome ?? "")
        .split(",")
        .map((nome) => nome.trim())
        .filter(Boolean),
    ),
  );

const petNomesTexto = (pets: string[]) => pets.join(", ");

const alternarPetTexto = (petNomeAtual: string | null | undefined, pet: string) => {
  const petLimpo = pet.trim();
  if (!petLimpo) return petLinha(petNomeAtual) || null;

  const atuais = petNomes(petNomeAtual);
  const existe = atuais.some((nome) => nome.toLowerCase() === petLimpo.toLowerCase());
  const proximos = existe
    ? atuais.filter((nome) => nome.toLowerCase() !== petLimpo.toLowerCase())
    : [...atuais, petLimpo];

  return petNomesTexto(proximos) || null;
};

type PetOpcao = { nome: string; especie?: PetDetalhe["especie"]; dono: Cliente };

const petsDoCliente = (cliente: Cliente): PetOpcao[] => {
  const pets = new Map<string, PetOpcao>();
  for (const pet of cliente.petsDetalhes ?? []) {
    const nome = pet.nome?.trim();
    if (nome) pets.set(nome.toLowerCase(), { nome, especie: pet.especie, dono: cliente });
  }
  for (const pet of cliente.pets ?? []) {
    const nome = pet.trim();
    if (nome && !pets.has(nome.toLowerCase())) {
      pets.set(nome.toLowerCase(), { nome, dono: cliente });
    }
  }
  return [...pets.values()];
};

const LIMITE_PETS_LISTA = 80;

const emojiEspecie = (especie?: PetDetalhe["especie"]) =>
  especie === "gato" ? "🐱" : especie === "cachorro" ? "🐶" : "🐾";

type MsgLog = {
  id: string;
  cliente: string;
  telefone: string;
  quando: string;
  preview: string;
  vendaId?: string;
};
type VendaEditForm = {
  id: string;
  cliente: string;
  telefone: string;
  dataVenda: string;
  total: string;
  pay: Pay;
  statusPag: StatusPag;
  obs: string;
};

type PDVProps = {
  initialCliente?: string;
  initialTelefone?: string;
  initialSku?: string;
  initialPet?: string;
  initialQuantidade?: string;
};

type PedidoPdvApi = {
  id: string;
  cliente: string;
  telefone: string;
  pet?: string;
  total: number;
  hora: string;
  data?: string;
  criadoEm?: string;
  pagamento: string;
  statusPagamento: string;
  status: string;
  observacao: string;
  taxaMaquina?: number;
};

function pagamentoPedidoParaPdv(value: string): Pay {
  if (
    value === "Pix" ||
    value === "Cartão" ||
    value === "Link de pagamento" ||
    value === "Dinheiro"
  ) {
    return value;
  }

  const normalized = normalizarBusca(value);
  if (
    normalized.includes("cartao") ||
    normalized.includes("credito") ||
    normalized.includes("debito")
  ) {
    return "Cartão";
  }
  if (normalized.includes("link")) return "Link de pagamento";
  if (normalized.includes("dinheiro")) return "Dinheiro";
  return "Pix";
}

function pedidoParaVendaPdv(pedido: PedidoPdvApi): Venda {
  const criadoEm = pedido.criadoEm ? new Date(pedido.criadoEm) : null;
  const data =
    pedido.data ??
    (criadoEm && !Number.isNaN(criadoEm.getTime())
      ? criadoEm.toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR"));
  const hora =
    pedido.hora ||
    (criadoEm && !Number.isNaN(criadoEm.getTime())
      ? criadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "");
  const itemNome = pedido.observacao?.trim() || pedido.pet?.trim() || "Venda registrada";

  return {
    id: pedido.id,
    hora,
    data,
    cliente: pedido.cliente,
    telefone: pedido.telefone,
    criadoEm: pedido.criadoEm,
    itens: [{ sku: "registrado", nome: itemNome, preco: pedido.total, precoCompra: 0, qtd: 1 }],
    total: pedido.total,
    taxaMaquininha: Number(pedido.taxaMaquina ?? 0),
    pay: pagamentoPedidoParaPdv(pedido.pagamento),
    statusPag: pedido.statusPagamento === "pago" ? "Pago" : "Pendente",
    status: pedido.status === "cancelado" ? "Cancelada" : "Concluída",
    obs: pedido.observacao,
  };
}

type CartaoModo = "debito" | "credito";
type CartaoParcela = 1 | 2 | 3 | 4 | 5 | 6;

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
const taxasLinkPagamento = {
  1: 4.2,
  2: 6.09,
  3: 7.01,
  4: 7.91,
  5: 8.8,
  6: 9.67,
} as const;

const formatPct = (value: number) =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function PDV({
  initialCliente = "",
  initialTelefone = "",
  initialSku = "",
  initialPet = "",
  initialQuantidade = "",
}: PDVProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [cliente, setCliente] = useState(initialCliente || initialTelefone);
  const [telefoneCliente, setTelefoneCliente] = useState(initialTelefone);
  const [petVenda, setPetVenda] = useState(initialPet);
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [valor, setValor] = useState("");
  const [pay, setPay] = useState<Pay>("Pix");
  const [statusPag, setStatusPag] = useState<StatusPag>("Pago");
  const [obs, setObs] = useState("");
  const [produtoBusca, setProdutoBusca] = useState("");
  const [dataVenda, setDataVenda] = useState(() => dataLocalISO(new Date()));
  const [hojePdv, setHojePdv] = useState(() => new Date().toLocaleDateString("pt-BR"));

  const [carrinho, setCarrinho] = useState<Item[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [frete, setFrete] = useState(0);
  const [cartaoModo, setCartaoModo] = useState<CartaoModo>("debito");
  const [cartaoParcelas, setCartaoParcelas] = useState<CartaoParcela>(1);

  const { vendas, setVendasRecentes, addVenda, updateVenda, cancelarVenda, apagarVenda } =
    useVendas();
  const [msgLog, setMsgLog] = useState<MsgLog[]>([]);

  const [cancelTarget, setCancelTarget] = useState<Venda | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [excluindoVendaId, setExcluindoVendaId] = useState<string | null>(null);
  const [editandoVenda, setEditandoVenda] = useState<Venda | null>(null);
  const [editForm, setEditForm] = useState<VendaEditForm | null>(null);
  const [salvandoEdicaoVenda, setSalvandoEdicaoVenda] = useState(false);
  const [finalizandoVenda, setFinalizandoVenda] = useState(false);
  const [modoAvulso, setModoAvulso] = useState(false);
  const [pedidoInicialAplicado, setPedidoInicialAplicado] = useState(false);

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setHojePdv(new Date().toLocaleDateString("pt-BR"));
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;

    async function carregarVendasRecentes() {
      try {
        const response = await fetch("/api/crm/pedidos?today=1", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as PedidoPdvApi[] | null;
        if (!alive || !response.ok || !Array.isArray(data)) return;

        setVendasRecentes(data.map(pedidoParaVendaPdv));
      } catch {
        if (alive) toast.error("Nao foi possivel carregar as vendas recentes");
      }
    }

    void carregarVendasRecentes();

    return () => {
      alive = false;
    };
  }, [setVendasRecentes]);

  const subtotalFull = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const custoFull = carrinho.reduce((s, i) => s + i.precoCompra * i.qtd, 0);
  const totalRapido = dinheiroInputParaNumero(valor);
  const vendaComItens = carrinho.length > 0;
  const adicionalAvulso = modoAvulso ? totalRapido : 0;
  const valorTotalEditado = !expandido && vendaComItens && !modoAvulso && valor.trim().length > 0;
  const totalBrutoFull = subtotalFull + adicionalAvulso + frete;
  const totalFull = valorTotalEditado
    ? Math.max(0, totalRapido)
    : Math.max(0, totalBrutoFull - desconto);
  const descontoVenda = Math.max(0, Math.round((totalBrutoFull - totalFull) * 100) / 100);
  const descontoPercentualVenda =
    descontoVenda > 0 && totalBrutoFull > 0
      ? Math.round((descontoVenda / totalBrutoFull) * 10000) / 100
      : 0;
  const lucro = totalFull - custoFull;
  const total = expandido || vendaComItens ? totalFull : totalRapido;
  const pagamentoLink = pay === "Link de pagamento";
  const pagamentoCartao = pay !== "Pix" && pay !== "Dinheiro" && !pagamentoLink;
  const taxaMaquininhaPct = pagamentoLink
    ? taxasLinkPagamento[cartaoParcelas]
    : pagamentoCartao
      ? cartaoModo === "debito"
        ? taxasCartao.debito
        : taxasCartao.credito[cartaoParcelas]
      : 0;
  const taxaMaquininhaValor =
    pagamentoCartao || pagamentoLink ? Math.round(total * taxaMaquininhaPct) / 100 : 0;
  const taxaMaquininhaForma = pagamentoLink
    ? `Link ${cartaoParcelas}x`
    : cartaoModo === "debito"
      ? "Debito"
      : `Credito ${cartaoParcelas}x`;
  const taxaMaquininhaRotulo = `${taxaMaquininhaForma} ${formatPct(taxaMaquininhaPct)}%`;
  const taxaMaquininhaObservacao = `${taxaMaquininhaRotulo} (${brl(taxaMaquininhaValor)})`;
  const taxaPagamentoNome = pagamentoLink ? "Taxa link de pagamento" : "Taxa maquininha";
  const lucroLiquido = lucro - taxaMaquininhaValor;
  const valorLiquidoRecebido = Math.max(0, total - taxaMaquininhaValor);
  const margem = totalFull > 0 ? (lucroLiquido / totalFull) * 100 : 0;
  const vendasRecentes = useMemo(
    () => vendas.filter((venda) => isVendaHoje(venda, hojePdv)),
    [hojePdv, vendas],
  );

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
  const petsCliente = useMemo(
    () => (clienteSel ? petsDoCliente(clienteSel).map((pet) => pet.nome) : []),
    [clienteSel],
  );
  const qtdPetsVenda = petNomes(petVenda).length;
  const produtosFiltrados = useMemo(() => {
    const q = normalizarBusca(produtoBusca);
    if (!q) return [];
    return produtos
      .filter((p) => p.estoque > 0)
      .filter((p) => normalizarBusca(`${p.nome} ${p.sku} ${p.categoria}`).includes(q))
      .slice(0, 12);
  }, [produtoBusca, produtos]);
  const produtosDisponiveis = useMemo(
    () => produtos.filter((produto) => produto.estoque > 0),
    [produtos],
  );

  useEffect(() => {
    if (cliente) return;
    if (initialCliente || initialTelefone) {
      setCliente(initialCliente || initialTelefone);
    }
  }, [cliente, initialCliente, initialTelefone]);

  useEffect(() => {
    if (!clienteSel) return;
    setTelefoneCliente((atual) => atual || clienteSel.telefone || "");
    setPetVenda(
      (atual) => atual || clienteSel.pets?.[0] || clienteSel.petsDetalhes?.[0]?.nome || "",
    );
  }, [clienteSel]);

  useEffect(() => {
    if (pedidoInicialAplicado || !initialSku || produtos.length === 0) return;

    const produto = produtos.find((p) => p.sku.toLowerCase() === initialSku.toLowerCase());
    if (!produto) return;

    const quantidade = Number(String(initialQuantidade).replace(",", "."));
    setExpandido(true);
    setModoAvulso(false);
    setProdutoBusca(produto.nome);
    setCarrinho([
      {
        sku: produto.sku,
        nome: produto.nome,
        preco: produto.preco,
        precoCompra: produto.precoCompra,
        qtd: Number.isFinite(quantidade) && quantidade > 0 ? Math.round(quantidade) : 1,
        petNome: initialPet || null,
      },
    ]);
    if (initialPet && !obs.trim()) {
      setObs(`Recompra prevista - ${initialPet}`);
    }
    setPedidoInicialAplicado(true);
  }, [initialPet, initialQuantidade, initialSku, obs, pedidoInicialAplicado, produtos]);

  const itensVendaAtual = () => {
    const itens = [...carrinho];
    if (modoAvulso && totalRapido > 0) {
      itens.push({
        sku: "avulso",
        nome: obs.trim() || "Venda avulsa",
        preco: totalRapido,
        precoCompra: 0,
        qtd: 1,
      });
    }
    return itens;
  };

  const atualizarEstoqueLocalVendaPaga = (itens: Item[]) => {
    const quantidadePorSku = new Map<string, number>();
    for (const item of itens) {
      if (item.sku === "avulso") continue;
      quantidadePorSku.set(item.sku, (quantidadePorSku.get(item.sku) ?? 0) + item.qtd);
    }

    if (quantidadePorSku.size === 0) return;

    setProdutos((atuais) =>
      atuais.map((produto) => {
        const quantidade = quantidadePorSku.get(produto.sku) ?? 0;
        if (quantidade <= 0) return produto;
        return { ...produto, estoque: Math.max(0, produto.estoque - quantidade) };
      }),
    );
  };

  const construirMensagem = (v?: Partial<Venda>) => {
    const nome = v?.cliente || cliente || "cliente";
    const itensMensagem =
      v?.itens ?? (expandido || vendaComItens || modoAvulso ? itensVendaAtual() : []);
    const itens =
      itensMensagem.map((i) => `• ${i.qtd}x ${i.nome} - ${brl(i.preco * i.qtd)}`).join("\n") ||
      "• Pedido avulso";
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
    if (finalizandoVenda) return;

    const nome = cliente.trim() || "Avulso";
    const c = buscarCliente(nome);
    const itens = expandido || vendaComItens || modoAvulso ? itensVendaAtual() : [];
    const petsItens = petNomesTexto(itens.flatMap((item) => petNomes(item.petNome)));
    const petPedido = petNomesTexto(petNomes(petVenda)) || petsItens || c?.pets?.[0] || "";
    const itensEstoque = itens
      .filter((item) => item.sku !== "avulso")
      .map((item) => ({ ...item, petNome: (item.petNome ?? petPedido) || null }));
    const itensVenda = itens.map((item) =>
      item.sku === "avulso" ? item : { ...item, petNome: (item.petNome ?? petPedido) || null },
    );
    const telefone = telefoneDigits(telefoneCliente) || c?.telefone || telefoneDigits(cliente);
    // Quando no modo avulsa, exigir descrição
    if (modoAvulso && !obs.trim()) {
      toast.error("Descreva o produto/serviço vendido");
      return;
    }
    if (modoAvulso && totalRapido <= 0) {
      toast.error("Informe o valor da venda avulsa");
      return;
    }
    if (expandido && carrinho.length === 0) {
      toast.error("Adicione produtos ao carrinho");
      return;
    }
    if (!expandido && total <= 0) {
      toast.error("Informe um valor para finalizar a venda");
      return;
    }
    const momentoVenda = dataHoraVenda(dataVenda);
    const observacaoTaxa =
      taxaMaquininhaValor > 0 ? `${taxaPagamentoNome} ${taxaMaquininhaObservacao}` : "";
    const observacaoRecompra = observacaoRecompraPdv({ itens: itensEstoque, produtos, cliente: c });
    const observacaoPedido = [obs.trim(), observacaoTaxa, observacaoRecompra]
      .filter((parte) => parte.length > 0)
      .join(" | ");
    const v: Venda = {
      id: `V-${1043 + vendas.length}`,
      hora: momentoVenda.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      data: momentoVenda.toLocaleDateString("pt-BR"),
      cliente: nome,
      telefone,
      criadoEm: momentoVenda.toISOString(),
      itens: itensVenda,
      total,
      taxaMaquininha: taxaMaquininhaValor,
      lucroLiquido,
      pay,
      statusPag,
      status: "Concluída",
      obs: observacaoPedido,
      whatsEnviado: whats,
    };
    setFinalizandoVenda(true);
    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          telefone,
          total,
          totalBruto: descontoVenda > 0 ? totalBrutoFull : undefined,
          descontoValor: descontoVenda > 0 ? descontoVenda : undefined,
          descontoPercentual: descontoVenda > 0 ? descontoPercentualVenda : undefined,
          taxaMaquininha: taxaMaquininhaValor,
          formaPagamento: pay,
          observacao: observacaoPedido || (expandido ? "Pedido do PDV" : "Venda rapida do PDV"),
          bairro: c?.bairro ?? null,
          pet: petPedido || null,
          pago: statusPag === "Pago",
          dataVenda: momentoVenda.toISOString(),
          itens:
            itensEstoque.length > 0
              ? itensEstoque.map((item) => ({
                  sku: item.sku,
                  nome: item.nome,
                  quantidade: item.qtd,
                  preco: item.preco,
                  precoCompra: item.precoCompra,
                  petNome: (item.petNome ?? petPedido) || null,
                }))
              : [],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof data.erro === "string" ? data.erro : "Nao foi possivel finalizar a venda",
        );
      }

      const vendaFinalizada = { ...v, id: typeof data.id === "string" ? data.id : v.id };
      addVenda(vendaFinalizada);
      if (statusPag === "Pago") {
        atualizarEstoqueLocalVendaPaga(itensVenda);
      }
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel finalizar a venda");
      return;
    } finally {
      setFinalizandoVenda(false);
    }

    setCliente("");
    setTelefoneCliente("");
    setPetVenda("");
    setValor("");
    setObs("");
    setProdutoBusca("");
    setCarrinho([]);
    setDesconto(0);
    setFrete(0);
    setDataVenda(dataLocalISO(new Date()));
  };

  const confirmarCancelamento = () => {
    if (!cancelTarget || !cancelMotivo.trim()) return;
    cancelarVenda(cancelTarget.id, cancelMotivo);
    setCancelTarget(null);
    setCancelMotivo("");
  };

  const abrirEdicaoVenda = (venda: Venda) => {
    setEditandoVenda(venda);
    setEditForm({
      id: venda.id,
      cliente: venda.cliente,
      telefone: venda.telefone,
      dataVenda: dataVendaInput(venda),
      total: String(venda.total),
      pay: venda.pay,
      statusPag: venda.statusPag,
      obs: venda.obs ?? "",
    });
  };

  const fecharEdicaoVenda = () => {
    if (salvandoEdicaoVenda) return;
    setEditandoVenda(null);
    setEditForm(null);
  };

  const salvarEdicaoVenda = async () => {
    if (!editandoVenda || !editForm) return;

    const nome = editForm.cliente.trim();
    const totalEditado = dinheiroInputParaNumero(editForm.total);
    const momentoEditado = dataHoraVendaEditada(editForm.dataVenda, editandoVenda);
    if (!nome || !Number.isFinite(totalEditado) || totalEditado <= 0) {
      toast.error("Informe cliente e total valido");
      return;
    }

    setSalvandoEdicaoVenda(true);
    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editandoVenda.id,
          nome,
          telefone: editForm.telefone,
          total: totalEditado,
          formaPagamento: editForm.pay,
          observacao: editForm.obs,
          pago: editForm.statusPag === "Pago",
          dataVenda: momentoEditado.toISOString(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof data.erro === "string" ? data.erro : "Nao foi possivel editar a venda",
        );
      }

      updateVenda(editandoVenda.id, {
        cliente: nome,
        telefone: editForm.telefone,
        criadoEm: momentoEditado.toISOString(),
        data: momentoEditado.toLocaleDateString("pt-BR"),
        hora: momentoEditado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        total: Math.round(totalEditado * 100) / 100,
        pay: editForm.pay,
        statusPag: editForm.statusPag,
        obs: editForm.obs,
      });
      toast.success("Venda atualizada");
      setEditandoVenda(null);
      setEditForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao editar venda");
    } finally {
      setSalvandoEdicaoVenda(false);
    }
  };

  const excluirVenda = async (venda: Venda) => {
    const confirmou = window.confirm(
      `Excluir definitivamente a venda ${venda.id} de ${venda.cliente}?\n\nIsso remove a venda do CRM e desfaz estoque/financeiro vinculados.`,
    );
    if (!confirmou) return;

    setExcluindoVendaId(venda.id);
    try {
      const response = await fetch("/api/crm/pedidos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: venda.id }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof data.erro === "string" ? data.erro : "Nao foi possivel excluir a venda",
        );
      }

      apagarVenda(venda.id);
      toast.success("Venda excluida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir venda");
    } finally {
      setExcluindoVendaId(null);
    }
  };

  const add = (p: (typeof produtos)[number]) =>
    setCarrinho((c) => {
      const petNome = petLinha(petVenda) || null;
      const totalSku = c
        .filter((item) => item.sku === p.sku)
        .reduce((sum, item) => sum + item.qtd, 0);
      const ex = c.find((i) => i.sku === p.sku && petLinha(i.petNome) === petLinha(petNome));
      if (totalSku >= p.estoque) {
        toast.error("Quantidade maior que o estoque disponivel");
        return c;
      }
      if (ex) {
        return c.map((i) =>
          itemCarrinhoKey(i) === itemCarrinhoKey(ex) ? { ...i, qtd: i.qtd + 1 } : i,
        );
      }
      return [
        ...c,
        { sku: p.sku, nome: p.nome, preco: p.preco, precoCompra: p.precoCompra, qtd: 1, petNome },
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
  const changePreco = (itemAtual: Item, preco: number) =>
    setCarrinho((c) =>
      c.map((i) =>
        itemCarrinhoKey(i) === itemCarrinhoKey(itemAtual)
          ? {
              ...i,
              preco: Number.isFinite(preco) && preco >= 0 ? Math.round(preco * 100) / 100 : 0,
            }
          : i,
      ),
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

  const alternarPetItem = (itemAtual: Item, pet: string) =>
    alterarPetItem(itemAtual, alternarPetTexto(itemAtual.petNome, pet) ?? "");

  // Escolher pet de outro dono troca o cliente da venda; do mesmo dono, soma/remove da seleção.
  const alternarPetVenda = (nome: string, dono?: Cliente) => {
    if (dono && dono.id !== clienteSel?.id) {
      setCliente(dono.nome);
      setTelefoneCliente(dono.telefone);
      setPetVenda(nome);
      return;
    }
    setPetVenda((atual) => alternarPetTexto(atual, nome) ?? "");
  };

  // Pet cadastrado no PDV já vai para a ficha do cliente e fica selecionado na venda.
  const aplicarPetCadastrado = (clienteSalvo: Cliente, petNome: string) => {
    setClientes((atuais) => atuais.map((c) => (c.id === clienteSalvo.id ? clienteSalvo : c)));
    setPetVenda((atual) =>
      petNomes(atual).some((nome) => nome.toLowerCase() === petNome.toLowerCase())
        ? atual
        : (alternarPetTexto(atual, petNome) ?? petNome),
    );
  };

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
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => {
                setModoAvulso(false);
                setObs("");
              }}
              className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${!modoAvulso ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
            >
              + Nova venda
            </button>
            <button
              onClick={() => {
                setModoAvulso(true);
              }}
              className={`py-2 px-3 rounded-lg text-sm font-semibold transition ${modoAvulso ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
            >
              Venda avulsa
            </button>
          </div>

          {modoAvulso && (
            <div className="space-y-3">
              <div>
                <Label icon={<Receipt className="size-3.5" />}>Descrição do item vendido</Label>
                <textarea
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={3}
                  placeholder="Descreva o produto/serviço vendido"
                  className="w-full p-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
                />
              </div>
            </div>
          )}
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
                        setTelefoneCliente(c.telefone);
                        setPetVenda(c.pets?.[0] || c.petsDetalhes?.[0]?.nome || "");
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

          <div>
            <Label icon={<Phone className="size-3.5" />}>Telefone</Label>
            <input
              value={telefoneCliente}
              onChange={(e) => setTelefoneCliente(e.target.value)}
              placeholder="WhatsApp do cliente"
              inputMode="tel"
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          <div>
            <Label>
              Pet da recompra{qtdPetsVenda > 1 ? ` · ${qtdPetsVenda} selecionados` : ""}
            </Label>
            <PetVendaPanel
              clienteSel={clienteSel}
              clientes={clientes}
              petVenda={petVenda}
              onAlternar={alternarPetVenda}
              onPetSalvo={aplicarPetCadastrado}
            />
          </div>

          <div className="space-y-2">
            <Label icon={<Search className="size-3.5" />}>Produto do estoque</Label>
            <input
              value={produtoBusca}
              onChange={(e) => setProdutoBusca(e.target.value)}
              placeholder="Buscar racao/produto para dar baixa..."
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
            {produtoBusca && (
              <div className="grid sm:grid-cols-2 gap-2">
                {produtosFiltrados.length > 0 ? (
                  produtosFiltrados.slice(0, 6).map((p) => (
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
                  ))
                ) : (
                  <div className="sm:col-span-2 rounded-xl border border-border p-3 text-xs text-muted-foreground">
                    Nenhum produto encontrado.
                  </div>
                )}
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
                      <div className="mt-1 grid gap-1 sm:grid-cols-[auto_1fr] sm:items-center text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span>R$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.preco || ""}
                            onChange={(e) => changePreco(item, Number(e.target.value))}
                            className="h-7 w-24 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 ring-primary/30"
                            aria-label={`Preco unitario de ${item.nome}`}
                          />
                          <span>cada</span>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          {petsCliente.map((pet) => {
                            const active = petNomes(item.petNome).some(
                              (nome) => nome.toLowerCase() === pet.toLowerCase(),
                            );
                            return (
                              <button
                                key={pet}
                                type="button"
                                onClick={() => alternarPetItem(item, pet)}
                                className={`h-7 rounded-md border px-2 text-xs font-semibold ${
                                  active
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-card text-muted-foreground hover:bg-card/70"
                                }`}
                              >
                                {pet}
                              </button>
                            );
                          })}
                          <input
                            value={item.petNome ?? ""}
                            onChange={(e) => alterarPetItem(item, e.target.value)}
                            placeholder="Pet(s)"
                            className="h-7 min-w-28 flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-2 ring-primary/30"
                            aria-label={`Pet de ${item.nome}`}
                          />
                        </div>
                      </div>
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
            <Label icon={<Receipt className="size-3.5" />}>
              {modoAvulso ? "Valor avulso" : "Valor total"}
            </Label>
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
            {vendaComItens && !modoAvulso && (
              <div className="mt-1 text-xs text-muted-foreground">
                Produtos {brl(subtotalFull)}
                {valorTotalEditado && descontoVenda > 0
                  ? ` - desconto ${brl(descontoVenda)} = ${brl(total)}`
                  : ` - total atual ${brl(total)}`}
              </div>
            )}
            {vendaComItens && modoAvulso && (
              <div className="mt-1 text-xs text-muted-foreground">
                Produtos {brl(subtotalFull)} + avulso {brl(totalRapido)} = {brl(total)}
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
            <div className="grid grid-cols-4 gap-2">
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
                icon={<LinkIcon className="size-5" />}
                label="Link"
                active={pay === "Link de pagamento"}
                onClick={() => setPay("Link de pagamento")}
              />
              <PayBtn
                icon={<Banknote className="size-5" />}
                label="Dinheiro"
                active={pay === "Dinheiro"}
                onClick={() => setPay("Dinheiro")}
              />
            </div>
          </div>

          {pagamentoCartao && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
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

          {pagamentoLink && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3">
              <PaymentLinkFeeSelector
                parcelas={cartaoParcelas}
                taxaPercentual={taxaMaquininhaPct}
                taxaValor={taxaMaquininhaValor}
                liquido={valorLiquidoRecebido}
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

          {!modoAvulso && (
            <div>
              <Label>Observação (opcional)</Label>
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Ex: entregar até 18h"
                className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => finalizar(false)}
              disabled={total <= 0 || finalizandoVenda}
              className="h-14 rounded-xl bg-success text-success-foreground font-bold text-lg shadow hover:opacity-90 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
            >
              Finalizar · {brl(total)}
            </button>
            <button
              onClick={() => (total > 0 ? finalizar(true) : enviarWhats())}
              disabled={finalizandoVenda}
              title="Enviar resumo no WhatsApp"
              className="h-14 px-5 rounded-xl bg-[#25D366] text-white font-semibold shadow hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-2"
            >
              <MessageCircle className="size-5" />
              <span className="hidden sm:inline">Enviar no WhatsApp</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-4">
          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Buscar produto ou ler código..."
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {produtosDisponiveis.map((p) => (
                <button
                  key={p.sku}
                  onClick={() => add(p)}
                  className="card-soft p-3 text-left hover:border-primary hover:shadow-md transition"
                >
                  <div className="aspect-square rounded-xl bg-secondary grid place-items-center text-3xl">
                    🐾
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">
                    {p.categoria}
                  </div>
                  <div className="font-semibold text-xs leading-tight mt-0.5 line-clamp-2">
                    {p.nome}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-sm text-primary">{brl(p.preco)}</span>
                    <span
                      className={`text-[10px] font-bold ${p.estoque <= p.minimo ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {p.estoque} un
                    </span>
                  </div>
                </button>
              ))}
              {produtosDisponiveis.length === 0 && (
                <div className="col-span-full grid place-items-center rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                  Nenhum produto com estoque disponivel para venda.
                </div>
              )}
            </div>
          </div>

          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
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
              <input
                value={telefoneCliente}
                onChange={(e) => setTelefoneCliente(e.target.value)}
                placeholder="Telefone"
                inputMode="tel"
                className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none mb-3"
              />
              <div className="mb-3">
                <Label>
                  Pet da recompra{qtdPetsVenda > 1 ? ` · ${qtdPetsVenda} selecionados` : ""}
                </Label>
                <PetVendaPanel
                  compact
                  clienteSel={clienteSel}
                  clientes={clientes}
                  petVenda={petVenda}
                  onAlternar={alternarPetVenda}
                  onPetSalvo={aplicarPetCadastrado}
                />
              </div>
              <h3 className="font-semibold">Carrinho</h3>
              <p className="text-xs text-muted-foreground">
                {carrinho.length} itens · margem {margem.toFixed(0)}%
              </p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
              {carrinho.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-12">
                  Adicione produtos ao carrinho
                </div>
              )}
              {carrinho.map((i) => (
                <div key={itemCarrinhoKey(i)} className="card-soft p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{i.nome}</div>
                    <div className="mt-1 grid gap-1 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={i.preco || ""}
                          onChange={(e) => changePreco(i, Number(e.target.value))}
                          className="h-7 w-24 rounded-md border border-border bg-secondary px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 ring-primary/30"
                          aria-label={`Preco unitario de ${i.nome}`}
                        />
                        <span>un</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {petsCliente.map((pet) => {
                          const active = petNomes(i.petNome).some(
                            (nome) => nome.toLowerCase() === pet.toLowerCase(),
                          );
                          return (
                            <button
                              key={pet}
                              type="button"
                              onClick={() => alternarPetItem(i, pet)}
                              className={`h-7 rounded-md border px-2 text-xs font-semibold ${
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
                              }`}
                            >
                              {pet}
                            </button>
                          );
                        })}
                        <input
                          value={i.petNome ?? ""}
                          onChange={(e) => alterarPetItem(i, e.target.value)}
                          placeholder="Pet(s)"
                          className="h-7 min-w-28 flex-1 rounded-md border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:ring-2 ring-primary/30"
                          aria-label={`Pet de ${i.nome}`}
                        />
                      </div>
                    </div>
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
            </div>

            <div className="border-t border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Desconto" value={desconto} onChange={setDesconto} />
                <NumField label="Frete" value={frete} onChange={setFrete} />
              </div>

              <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5">
                <Row label="Subtotal" value={brl(subtotalFull)} />
                <Row label="Custo" value={brl(custoFull)} muted />
                {taxaMaquininhaValor > 0 && (
                  <Row
                    label={`${taxaPagamentoNome} (${taxaMaquininhaRotulo})`}
                    value={`-${brl(taxaMaquininhaValor)}`}
                    muted
                  />
                )}
                <Row label="Lucro liquido" value={brl(lucroLiquido)} accent="success" />
                <Row label="Total" value={brl(totalFull)} bold />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <PayBtn
                  icon={<QrCode className="size-4" />}
                  label="Pix"
                  active={pay === "Pix"}
                  onClick={() => setPay("Pix")}
                />
                <PayBtn
                  icon={<CreditCard className="size-4" />}
                  label="Cartão"
                  active={pay === "Cartão"}
                  onClick={() => setPay("Cartão")}
                />
                <PayBtn
                  icon={<LinkIcon className="size-4" />}
                  label="Link"
                  active={pay === "Link de pagamento"}
                  onClick={() => setPay("Link de pagamento")}
                />
                <PayBtn
                  icon={<Banknote className="size-4" />}
                  label="Dinheiro"
                  active={pay === "Dinheiro"}
                  onClick={() => setPay("Dinheiro")}
                />
              </div>

              {pagamentoCartao && (
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

              {pagamentoLink && (
                <PaymentLinkFeeSelector
                  parcelas={cartaoParcelas}
                  taxaPercentual={taxaMaquininhaPct}
                  taxaValor={taxaMaquininhaValor}
                  liquido={valorLiquidoRecebido}
                  onParcelasChange={setCartaoParcelas}
                />
              )}

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

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  onClick={() => finalizar(false)}
                  disabled={carrinho.length === 0 || finalizandoVenda}
                  className="h-12 rounded-xl bg-success text-success-foreground font-bold text-base hover:opacity-90 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
                >
                  Finalizar · {brl(totalFull)}
                </button>
                <button
                  onClick={() => (carrinho.length ? finalizar(true) : enviarWhats())}
                  disabled={finalizandoVenda}
                  className="h-12 px-4 rounded-xl bg-[#25D366] text-white font-semibold hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </button>
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
            {vendasRecentes.length} vendas
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-5 py-3">Pedido</th>
                <th className="font-medium px-5 py-3">Data</th>
                <th className="font-medium px-5 py-3">Cliente</th>
                <th className="font-medium px-5 py-3">Itens</th>
                <th className="font-medium px-5 py-3 text-right">Total</th>
                <th className="font-medium px-5 py-3">Pagto</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendasRecentes.map((v) => (
                <tr
                  key={v.id}
                  className={`border-t border-border hover:bg-secondary/30 ${v.status === "Cancelada" ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-3 font-mono text-xs font-bold">
                    {v.id}
                    <div className="text-[10px] text-muted-foreground font-sans">{v.hora}</div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {v.data}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-semibold">{v.cliente}</div>
                    <div className="text-[11px] text-muted-foreground">{v.telefone}</div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(" · ")}
                  </td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{brl(v.total)}</td>
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
                      <button
                        onClick={() => abrirEdicaoVenda(v)}
                        title="Editar venda"
                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
                      >
                        <Pencil className="size-3.5" />
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
                      <button
                        onClick={() => void excluirVenda(v)}
                        title="Excluir venda"
                        disabled={excluindoVendaId === v.id}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive disabled:opacity-50"
                      >
                        {excluindoVendaId === v.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
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

      {/* Modal edicao */}
      {editandoVenda && editForm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40"
          onClick={fecharEdicaoVenda}
        >
          <div
            className="card-soft p-5 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2">
                  <Pencil className="size-4 text-primary" /> Editar venda
                </h3>
                <p className="text-xs text-muted-foreground">
                  {editandoVenda.id} · {editandoVenda.data} · {editandoVenda.hora}
                </p>
              </div>
              <button
                onClick={fecharEdicaoVenda}
                disabled={salvandoEdicaoVenda}
                className="p-1 rounded-lg hover:bg-secondary disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                  Cliente
                </span>
                <input
                  value={editForm.cliente}
                  onChange={(e) =>
                    setEditForm((form) => form && { ...form, cliente: e.target.value })
                  }
                  className="w-full h-10 rounded-xl bg-secondary px-3 text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                  Telefone
                </span>
                <input
                  value={editForm.telefone}
                  onChange={(e) =>
                    setEditForm((form) => form && { ...form, telefone: e.target.value })
                  }
                  className="w-full h-10 rounded-xl bg-secondary px-3 text-sm outline-none focus:ring-2 ring-primary/30"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                    Data da venda
                  </span>
                  <input
                    type="date"
                    value={editForm.dataVenda}
                    max={dataLocalISO(new Date())}
                    onChange={(e) =>
                      setEditForm(
                        (form) =>
                          form && {
                            ...form,
                            dataVenda: e.target.value || dataLocalISO(new Date()),
                          },
                      )
                    }
                    className="w-full h-10 rounded-xl bg-secondary px-3 text-sm outline-none focus:ring-2 ring-primary/30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                    Total
                  </span>
                  <input
                    inputMode="decimal"
                    value={editForm.total}
                    onChange={(e) =>
                      setEditForm(
                        (form) =>
                          form && { ...form, total: e.target.value.replace(/[^\d.,]/g, "") },
                      )
                    }
                    className="w-full h-10 rounded-xl bg-secondary px-3 text-sm font-bold outline-none focus:ring-2 ring-primary/30"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                    Status
                  </span>
                  <select
                    value={editForm.statusPag}
                    onChange={(e) =>
                      setEditForm(
                        (form) => form && { ...form, statusPag: e.target.value as StatusPag },
                      )
                    }
                    className="w-full h-10 rounded-xl bg-secondary px-3 text-sm outline-none focus:ring-2 ring-primary/30"
                  >
                    <option value="Pago">Pago</option>
                    <option value="Pendente">Pendente</option>
                  </select>
                </label>
              </div>
              <label className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                  Forma de pagamento
                </span>
                <select
                  value={editForm.pay}
                  onChange={(e) =>
                    setEditForm((form) => form && { ...form, pay: e.target.value as Pay })
                  }
                  className="w-full h-10 rounded-xl bg-secondary px-3 text-sm outline-none focus:ring-2 ring-primary/30"
                >
                  <option value="Pix">Pix</option>
                  <option value="Cartão">Cartao</option>
                  <option value="Link de pagamento">Link de pagamento</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
                  Observacao
                </span>
                <textarea
                  value={editForm.obs}
                  onChange={(e) => setEditForm((form) => form && { ...form, obs: e.target.value })}
                  rows={3}
                  className="w-full rounded-xl bg-secondary p-3 text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
                />
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={fecharEdicaoVenda}
                disabled={salvandoEdicaoVenda}
                className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/70 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void salvarEdicaoVenda()}
                disabled={salvandoEdicaoVenda}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {salvandoEdicaoVenda ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

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

type PetVendaAba = "selecionar" | "cadastrar";

function PetVendaPanel({
  clienteSel,
  clientes,
  petVenda,
  onAlternar,
  onPetSalvo,
  compact = false,
}: {
  clienteSel?: Cliente;
  clientes: Cliente[];
  petVenda: string;
  onAlternar: (nome: string, dono?: Cliente) => void;
  onPetSalvo: (cliente: Cliente, petNome: string) => void;
  compact?: boolean;
}) {
  const [aba, setAba] = useState<PetVendaAba>("selecionar");
  const petsDoTutor = useMemo(() => (clienteSel ? petsDoCliente(clienteSel) : []), [clienteSel]);

  useEffect(() => {
    setAba("selecionar");
  }, [clienteSel?.id]);

  const concluirCadastro = (clienteSalvo: Cliente, petNome: string) => {
    onPetSalvo(clienteSalvo, petNome);
    setAba("selecionar");
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 p-1.5">
      <div
        role="tablist"
        aria-label="Pet da venda"
        className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-secondary/70 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={aba === "selecionar"}
          onClick={() => setAba("selecionar")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 font-semibold transition ${
            compact ? "h-8 text-[11px]" : "h-9 text-xs"
          } ${
            aba === "selecionar"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PawPrint className="size-3.5" />
          Selecionar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === "cadastrar"}
          onClick={() => setAba("cadastrar")}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 font-semibold transition ${
            compact ? "h-8 text-[11px]" : "h-9 text-xs"
          } ${
            aba === "cadastrar"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plus className="size-3.5" />
          Cadastrar novo
        </button>
      </div>

      {aba === "selecionar" ? (
        <div role="tabpanel">
          <PetRecompraPicker
            compact={compact}
            clienteSel={clienteSel}
            clientes={clientes}
            petVenda={petVenda}
            onAlternar={onAlternar}
          />
          {clienteSel && petsDoTutor.length === 0 && (
            <button
              type="button"
              onClick={() => setAba("cadastrar")}
              className="mt-2 w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Nenhum pet cadastrado para {clienteSel.nome}. Cadastrar agora
            </button>
          )}
        </div>
      ) : (
        <div role="tabpanel">
          {clienteSel ? (
            <CadastroPetRapido
              compact={compact}
              key={clienteSel.id}
              cliente={clienteSel}
              onCancelar={() => setAba("selecionar")}
              onSalvo={concluirCadastro}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Selecione o cliente da venda antes de cadastrar o pet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PetRecompraPicker({
  clienteSel,
  clientes,
  petVenda,
  onAlternar,
  compact = false,
}: {
  clienteSel?: Cliente;
  clientes: Cliente[];
  petVenda: string;
  onAlternar: (nome: string, dono?: Cliente) => void;
  compact?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const selecionados = petNomes(petVenda);
  const estaSelecionado = (nome: string) =>
    selecionados.some((sel) => sel.toLowerCase() === nome.toLowerCase());

  useEffect(() => {
    if (!aberto) return;
    const fecharAoClicarFora = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fecharAoClicarFora);
    return () => document.removeEventListener("mousedown", fecharAoClicarFora);
  }, [aberto]);

  // Cadastros com pet "1", "2"... vão para o fim para não esconder os nomes de verdade.
  const todosPets = useMemo(() => {
    const semNome = (pet: PetOpcao) => !/\p{L}/u.test(pet.nome);
    return clientes
      .flatMap(petsDoCliente)
      .sort(
        (a, b) => Number(semNome(a)) - Number(semNome(b)) || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [clientes]);
  const petsDoSel = useMemo(() => (clienteSel ? petsDoCliente(clienteSel) : []), [clienteSel]);

  const q = normalizarBusca(busca);
  const combina = (pet: PetOpcao) =>
    !q || normalizarBusca(`${pet.nome} ${pet.dono.nome}`).includes(q);
  const doCliente = petsDoSel.filter(combina);
  const outros = todosPets.filter((pet) => pet.dono.id !== clienteSel?.id && combina(pet));
  const outrosVisiveis = outros.slice(0, LIMITE_PETS_LISTA);
  const marcado = (pet: PetOpcao) => pet.dono.id === clienteSel?.id && estaSelecionado(pet.nome);

  // Pets digitados à mão ou vindos do link de recompra que não estão no cadastro do cliente.
  const foraDoCadastro = selecionados.filter(
    (nome) => !petsDoSel.some((pet) => pet.nome.toLowerCase() === nome.toLowerCase()),
  );

  // Enter: com um único resultado, marca ele; sem nenhum pet com esse nome, usa o texto digitado.
  const adicionarDigitado = () => {
    const nome = busca.trim();
    if (!nome) return;
    const visiveis = [...doCliente, ...outros];
    if (visiveis.length === 1) {
      if (!marcado(visiveis[0])) onAlternar(visiveis[0].nome, visiveis[0].dono);
    } else if (!visiveis.some((pet) => pet.nome.toLowerCase() === nome.toLowerCase())) {
      if (!estaSelecionado(nome)) onAlternar(nome);
    } else {
      return;
    }
    setBusca("");
  };

  const fechar = () => {
    setAberto(false);
    setBusca("");
  };

  const titulo = (texto: string) => (
    <div className="px-2 pt-2 pb-1 text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
      {texto}
    </div>
  );

  const linha = (
    key: string,
    nome: string,
    dono: string,
    especie: PetDetalhe["especie"],
    ativo: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
        ativo ? "bg-primary/10" : "hover:bg-secondary"
      }`}
    >
      <span
        className={`size-4 shrink-0 rounded border grid place-items-center ${
          ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
        }`}
      >
        {ativo && <Check className="size-3" />}
      </span>
      <span className="size-8 shrink-0 rounded-full bg-secondary grid place-items-center text-base">
        {emojiEspecie(especie)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${ativo ? "text-primary" : ""}`}>
          {nome}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">{dono}</span>
      </span>
    </button>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => (aberto ? fechar() : setAberto(true))}
        className={`w-full flex items-center gap-2 bg-secondary text-sm text-left outline-none focus:ring-2 ring-primary/30 ${
          compact ? "min-h-9 px-3 py-1.5 rounded-lg" : "min-h-11 px-4 py-2 rounded-xl"
        }`}
      >
        <PawPrint className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 min-w-0">
          {selecionados.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {selecionados.map((nome) => (
                <span
                  key={nome}
                  className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  {nome}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">Selecionar pet(s)…</span>
          )}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition ${aberto ? "rotate-180" : ""}`}
        />
      </button>

      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-1 card-soft p-2 space-y-2">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionarDigitado();
              } else if (e.key === "Escape") {
                fechar();
              }
            }}
            placeholder="Filtrar por pet ou dono…"
            className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
          />
          <div className={`overflow-y-auto scrollbar-thin ${compact ? "max-h-60" : "max-h-72"}`}>
            {foraDoCadastro.length > 0 && (
              <>
                {titulo("Sem cadastro")}
                {foraDoCadastro.map((nome) =>
                  linha(
                    `avulso::${nome.toLowerCase()}`,
                    nome,
                    clienteSel?.nome ?? "Pet digitado",
                    undefined,
                    true,
                    () => onAlternar(nome),
                  ),
                )}
              </>
            )}
            {doCliente.length > 0 && (
              <>
                {titulo(`Pets de ${clienteSel?.nome ?? ""}`)}
                {doCliente.map((pet) =>
                  linha(
                    `${pet.dono.id}::${pet.nome.toLowerCase()}`,
                    pet.nome,
                    pet.dono.nome,
                    pet.especie,
                    marcado(pet),
                    () => onAlternar(pet.nome, pet.dono),
                  ),
                )}
              </>
            )}
            {outrosVisiveis.length > 0 && (
              <>
                {titulo(clienteSel ? "Outros clientes" : "Todos os pets")}
                {outrosVisiveis.map((pet) =>
                  linha(
                    `${pet.dono.id}::${pet.nome.toLowerCase()}`,
                    pet.nome,
                    pet.dono.nome,
                    pet.especie,
                    false,
                    () => onAlternar(pet.nome, pet.dono),
                  ),
                )}
              </>
            )}
            {outros.length > outrosVisiveis.length && (
              <div className="px-2 py-2 text-[11px] text-muted-foreground">
                Mostrando {outrosVisiveis.length} de {outros.length}. Digite o nome do pet ou do
                dono para achar os outros.
              </div>
            )}
            {doCliente.length + outros.length + foraDoCadastro.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {q
                  ? `Nenhum pet encontrado. Tecle Enter para usar "${busca.trim()}".`
                  : "Nenhum pet cadastrado."}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[11px] text-muted-foreground">
              {selecionados.length} selecionado(s)
            </span>
            <button
              type="button"
              onClick={fechar}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90"
            >
              Pronto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const RACAS_PESO_BASE = listarRacasPesoBase();

type PetRapidoForm = {
  nome: string;
  especie: "" | "cachorro" | "gato";
  raca: string;
  porte: "" | NonNullable<PetDetalhe["porte"]>;
  pesoKg: string;
  idade: "" | "filhote" | "adulto" | "senior";
};

// Cliente selecionado sem nenhum pet: cadastra o pet ali mesmo para fechar a venda de uma vez.
function CadastroPetRapido({
  cliente,
  onSalvo,
  onCancelar,
  compact = false,
}: {
  cliente: Cliente;
  onSalvo: (cliente: Cliente, petNome: string) => void;
  onCancelar: () => void;
  compact?: boolean;
}) {
  const [form, setForm] = useState<PetRapidoForm>({
    nome: "",
    especie: "",
    raca: "",
    porte: "",
    pesoKg: "",
    idade: "",
  });
  const [salvando, setSalvando] = useState(false);
  const update = (patch: Partial<PetRapidoForm>) => setForm((atual) => ({ ...atual, ...patch }));
  const racaAtual = RACAS_PESO_BASE.find((raca) => raca.nome === form.raca);
  const racas = RACAS_PESO_BASE.filter((raca) => !form.especie || raca.especie === form.especie);

  // A raça traz porte e peso médio, que são o que o cálculo de recompra de ração usa.
  const selecionarRaca = (nome: string) => {
    const raca = RACAS_PESO_BASE.find((item) => item.nome === nome);
    if (!raca) {
      update({ raca: nome });
      return;
    }
    update({
      especie: raca.especie,
      raca: raca.nome,
      porte: raca.porte === "gato" ? "" : raca.porte,
      pesoKg: String(raca.pesoKg).replace(".", ","),
    });
  };

  const alterarEspecie = (especie: PetRapidoForm["especie"]) => {
    const incompativel = racaAtual && especie && racaAtual.especie !== especie;
    update({ especie, ...(incompativel ? { raca: "", porte: "", pesoKg: "" } : {}) });
  };

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Informe o nome do pet");
      return;
    }

    const nomeJaExiste = petsDoCliente(cliente).some(
      (petExistente) => petExistente.nome.toLowerCase() === nome.toLowerCase(),
    );
    if (nomeJaExiste) {
      toast.error(`${nome} ja esta cadastrado para ${cliente.nome}`);
      return;
    }

    const pesoKg = Number(form.pesoKg.replace(",", "."));
    const pet: PetDetalhe = {
      nome,
      especie: form.especie || undefined,
      raca: form.raca || undefined,
      porte: form.porte || undefined,
      pesoKg: Number.isFinite(pesoKg) && pesoKg > 0 ? pesoKg : undefined,
      idade: form.idade || undefined,
      idadeAdultaConfirmada: form.idade === "filhote" ? false : form.idade ? true : undefined,
    };

    setSalvando(true);
    try {
      // O PATCH regrava a ficha inteira: sem reenviar tudo, endereço, bairro e perfil seriam apagados.
      const response = await fetch("/api/crm/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: cliente.id,
          nome: cliente.nome,
          telefone: cliente.telefone,
          endereco: cliente.endereco ?? "",
          bairro: cliente.bairro ?? "",
          perfil: cliente.perfil,
          origem: cliente.origem ?? "",
          observacoes: cliente.observacoes ?? "",
          pets: [...(cliente.pets ?? []), nome],
          petsDetalhes: [...(cliente.petsDetalhes ?? []), pet],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<Cliente> & {
        erro?: string;
      };
      if (!response.ok || typeof data.id !== "string") {
        throw new Error(data.erro || "Nao foi possivel cadastrar o pet");
      }

      toast.success(`${nome} cadastrado para ${cliente.nome}`);
      onSalvo(data as Cliente, nome);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel cadastrar o pet");
    } finally {
      setSalvando(false);
    }
  };

  const campo = `w-full min-w-0 bg-card border border-border px-3 text-sm outline-none focus:ring-2 ring-primary/30 ${
    compact ? "h-9 rounded-lg" : "h-10 rounded-xl"
  }`;

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold inline-flex items-center gap-1.5">
          <PawPrint className="size-3.5 shrink-0 text-primary" />
          Novo pet para {cliente.nome}
        </div>
        <button
          type="button"
          onClick={onCancelar}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Cancelar cadastro do pet"
          title="Cancelar"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        <input
          value={form.nome}
          onChange={(e) => update({ nome: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void salvar();
            }
          }}
          placeholder="Nome do pet"
          aria-label="Nome do pet"
          className={`${campo} ${compact ? "col-span-2" : "col-span-2 sm:col-span-1"}`}
        />
        <select
          value={form.especie}
          onChange={(e) => alterarEspecie(e.target.value as PetRapidoForm["especie"])}
          aria-label="Espécie"
          className={campo}
        >
          <option value="">Espécie</option>
          <option value="cachorro">Cachorro</option>
          <option value="gato">Gato</option>
        </select>
        <select
          value={form.raca}
          onChange={(e) => selecionarRaca(e.target.value)}
          aria-label="Raça"
          className={campo}
        >
          <option value="">Raça / SRD</option>
          {(["cachorro", "gato"] as const).map((especie) => {
            const doGrupo = racas.filter((raca) => raca.especie === especie);
            return doGrupo.length > 0 ? (
              <optgroup key={especie} label={especie === "cachorro" ? "Cachorro" : "Gato"}>
                {doGrupo.map((raca) => (
                  <option key={raca.nome} value={raca.nome}>
                    {raca.nome}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
        <select
          value={form.porte}
          onChange={(e) => update({ porte: e.target.value as PetRapidoForm["porte"] })}
          aria-label="Porte"
          className={campo}
        >
          <option value="">Porte</option>
          <option value="toy">Toy</option>
          <option value="pequeno">Pequeno</option>
          <option value="medio">Médio</option>
          <option value="grande">Grande</option>
          <option value="gigante">Gigante</option>
        </select>
        <input
          value={form.pesoKg}
          onChange={(e) => update({ pesoKg: e.target.value.replace(/[^\d.,]/g, "") })}
          inputMode="decimal"
          placeholder="Peso (kg)"
          aria-label="Peso em kg"
          className={campo}
        />
        <select
          value={form.idade}
          onChange={(e) => update({ idade: e.target.value as PetRapidoForm["idade"] })}
          aria-label="Fase"
          className={campo}
        >
          <option value="">Fase</option>
          <option value="filhote">Filhote</option>
          <option value="adulto">Adulto</option>
          <option value="senior">Sênior</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() => void salvar()}
        disabled={salvando}
        className={`w-full bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 ${
          compact ? "h-9 rounded-lg" : "h-10 rounded-xl"
        }`}
      >
        {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Salvar pet e usar na venda
      </button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
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
            DÃ©bito
          </button>
          <button
            type="button"
            onClick={() => onModoChange("credito")}
            className={`h-8 flex-1 rounded-md text-xs font-bold ${
              modo === "credito" ? "bg-card text-primary shadow" : "text-muted-foreground"
            }`}
          >
            CrÃ©dito
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
          <div className="text-muted-foreground">LÃ­quido</div>
          <div className="font-bold tabular-nums">{brl(liquido)}</div>
        </div>
      </div>
    </div>
  );
}

function PaymentLinkFeeSelector({
  parcelas,
  taxaPercentual,
  taxaValor,
  liquido,
  onParcelasChange,
}: {
  parcelas: CartaoParcela;
  taxaPercentual: number;
  taxaValor: number;
  liquido: number;
  onParcelasChange: (parcelas: CartaoParcela) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Taxa link de pagamento</Label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
          Link de pagamento do cliente
        </div>
        <select
          value={parcelas}
          onChange={(event) => onParcelasChange(Number(event.target.value) as CartaoParcela)}
          className="h-10 min-w-20 rounded-lg bg-card border border-border px-2 text-sm outline-none"
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
          <div className="text-muted-foreground">Liquido</div>
          <div className="font-bold tabular-nums">{brl(liquido)}</div>
        </div>
      </div>
    </div>
  );
}
