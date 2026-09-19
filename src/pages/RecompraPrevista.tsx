import type {
  Cliente,
  DemandaBairro,
  ModeloRecompraRacao,
  PetDetalhe,
  Produto,
  ProdutoPrevisto,
  RecompraPrevista,
  RecompraStatus,
  ComportamentoIA,
  TendenciaIA,
} from "@/lib/crm-types";
import {
  calcularDiasRecompraRacao,
  consumoDiarioPetRacao,
  inferirPesoRacaoKg,
} from "@/lib/recompra-calculo";
import { useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  ShoppingBag,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ArrowRightLeft,
  AlertTriangle,
  TrendingUp,
  Search,
  MapPin,
  Sparkles,
  Package,
  BarChart3,
  Boxes,
  Target,
  Users,
  Flame,
  Brain,
  Activity,
  Lock,
  LockOpen,
  X,
  TrendingDown,
  Minus,
  Settings2,
  Truck,
  Map as MapIcon,
  ShoppingCart,
  RefreshCw,
  Loader2,
  Send,
} from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const recomprasPrevistas: RecompraPrevista[] = [];
const produtosPrevistos: ProdutoPrevisto[] = [];
const demandaBairros: DemandaBairro[] = [];
const iaRecompraAlertas: { tipo: string; cliente: string; msg: string }[] = [];

function numeroPositivo(value: string): number | null {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

type RecompraApiData = {
  recompras: RecompraPrevista[];
  produtos: ProdutoPrevisto[];
  bairros: DemandaBairro[];
  alertas: { tipo: string; cliente: string; msg: string }[];
  modelos: ModeloRecompraRacao[];
};

type VendaManualForm = {
  clienteId: string;
  petNome: string;
  petNomes: string[];
  petsDetalhes: Record<
    string,
    {
      especie: "" | NonNullable<PetDetalhe["especie"]>;
      raca: string;
      porte: "" | NonNullable<PetDetalhe["porte"]>;
      pesoKg: string;
    }
  >;
  modoDistribuicao: "compartilhada" | "por_pet";
  sku: string;
  compraEm: string;
  diasRecompra: string;
  quantidade: string;
  pesoKg: string;
  consumoDiarioG: string;
};

type AgendamentoTutorDraft = {
  grupo: TutorAvisoGrupo;
  texto: string;
};

type AvisoTutorFollowup = {
  id: string;
  telefone: string;
  agendadoPara: string;
  disparo: "automatico" | "confirmar";
  status: "pendente" | "aguardando_confirmacao" | "enviado" | "cancelado" | "erro";
  contexto?: {
    objetivo?: string;
  };
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function defaultAgendamentoLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

function localDateTimeParaIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function telefoneWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function telefoneKey(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function dataHoraAgendamentoLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data invalida";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function urlPedidoPdv(item: RecompraPrevista): string {
  const params = new URLSearchParams({
    cliente: item.cliente,
    telefone: item.telefone,
    sku: item.sku,
    pet: item.pet,
    quantidade: String(Math.max(1, item.quantidade)),
  });

  return `/pdv?${params.toString()}`;
}

function urlConversaWhatsAppIa(item: RecompraPrevista): string {
  const params = new URLSearchParams({
    telefone: telefoneWhatsApp(item.telefone),
    clienteId: item.clienteId,
    cliente: item.cliente,
    origem: "recompra",
  });

  return `/conversas?${params.toString()}`;
}

const VENDA_MANUAL_INICIAL: VendaManualForm = {
  clienteId: "",
  petNome: "",
  petNomes: [],
  petsDetalhes: {},
  modoDistribuicao: "compartilhada",
  sku: "",
  compraEm: todayInputValue(),
  diasRecompra: "30",
  quantidade: "1",
  pesoKg: "",
  consumoDiarioG: "",
};

const statusMap: Record<RecompraStatus, { label: string; cls: string; dot: string }> = {
  ok: { label: "OK", cls: "bg-success/10 text-success border-success/30", dot: "bg-success" },
  semana: {
    label: "Semana",
    cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    dot: "bg-amber-500",
  },
  urgente: {
    label: "Urgente",
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  atrasado: {
    label: "Atrasado",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    dot: "bg-destructive",
  },
};

function petDetalheKey(nome: string): string {
  return nome.trim().toLowerCase();
}

type Filtro =
  | "Todos"
  | "Hoje"
  | "3 dias"
  | "7 dias"
  | "15 dias"
  | "Atrasados"
  | "VIP"
  | "Premium"
  | "Econômico"
  | "Cachorro"
  | "Gato";

const filtros: Filtro[] = [
  "Todos",
  "Hoje",
  "3 dias",
  "7 dias",
  "15 dias",
  "Atrasados",
  "VIP",
  "Premium",
  "Econômico",
  "Cachorro",
  "Gato",
];

export function RecompraPrevista() {
  const search = useSearch({ from: "/recompra-prevista" });
  const [items, setItems] = useState<RecompraPrevista[]>(recomprasPrevistas);
  const [produtos, setProdutos] = useState<ProdutoPrevisto[]>(produtosPrevistos);
  const [catalogoProdutos, setCatalogoProdutos] = useState<Produto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteManualBusca, setClienteManualBusca] = useState("");
  const [modelosRacao, setModelosRacao] = useState<ModeloRecompraRacao[]>([]);
  const [vendaManual, setVendaManual] = useState<VendaManualForm>(VENDA_MANUAL_INICIAL);
  const [salvandoVendaManual, setSalvandoVendaManual] = useState(false);
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [bairrosDemanda, setBairrosDemanda] = useState<DemandaBairro[]>(demandaBairros);
  const [alertasIa, setAlertasIa] =
    useState<{ tipo: string; cliente: string; msg: string }[]>(iaRecompraAlertas);
  const [loading, setLoading] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("Todas");
  const [bairro, setBairro] = useState("Todos");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [semana, setSemana] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 = todas
  const [showConfig, setShowConfig] = useState(false);
  const [iaConfig, setIaConfig] = useState({
    sensibilidade: 70,
    minCompras: 3,
    pesoRecente: 60,
    ajusteAuto: true,
  });

  const cidades = useMemo(
    () => ["Todas", ...Array.from(new Set(items.map((r) => r.cidade)))],
    [items],
  );
  const bairros = useMemo(
    () => ["Todos", ...Array.from(new Set(items.map((r) => r.bairro)))],
    [items],
  );
  const produtosRacao = useMemo(() => {
    return catalogoProdutos.filter((produto) => {
      const texto = `${produto.nome} ${produto.categoria} ${produto.fornecedor ?? ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return (
        texto.includes("racao") ||
        texto.includes("formula natural") ||
        texto.includes("golden") ||
        texto.includes("premier") ||
        texto.includes("special") ||
        texto.includes("gran plus") ||
        texto.includes("nd ") ||
        texto.includes("n&d")
      );
    });
  }, [catalogoProdutos]);
  const clienteManual = clientes.find((cliente) => cliente.id === vendaManual.clienteId) ?? null;
  const produtoManual = catalogoProdutos.find((produto) => produto.sku === vendaManual.sku) ?? null;
  const modeloManual = modelosRacao.find((modelo) => modelo.sku === vendaManual.sku) ?? null;
  const petNomesManualSelecionados = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...vendaManual.petNomes,
          ...(vendaManual.petNome.trim() ? [vendaManual.petNome.trim()] : []),
        ]
          .map((pet) => pet.trim())
          .filter(Boolean),
      ),
    );
  }, [vendaManual.petNome, vendaManual.petNomes]);
  const petDetalhesManualSelecionados = useMemo(() => {
    return petNomesManualSelecionados.map((nome) => {
      const existente = clienteManual?.petsDetalhes?.find(
        (pet) => pet.nome.trim().toLowerCase() === nome.toLowerCase(),
      );
      const manual = vendaManual.petsDetalhes[petDetalheKey(nome)];
      const pesoManual = manual?.pesoKg ? numeroPositivo(manual.pesoKg) : null;

      return {
        nome: existente?.nome || nome,
        especie: manual?.especie || existente?.especie,
        raca: manual?.raca.trim() || existente?.raca,
        porte: manual?.porte || existente?.porte,
        pesoKg: pesoManual ?? existente?.pesoKg,
      } satisfies PetDetalhe;
    });
  }, [clienteManual, petNomesManualSelecionados, vendaManual.petsDetalhes]);
  const diasRecompraSugeridos = useMemo(() => {
    if (!produtoManual || petNomesManualSelecionados.length === 0) return null;

    const quantidade = numeroPositivo(vendaManual.quantidade) ?? 1;
    const pesoRacaoKg =
      numeroPositivo(vendaManual.pesoKg) ?? inferirPesoRacaoKg(produtoManual, quantidade);
    const consumoManual = numeroPositivo(vendaManual.consumoDiarioG);
    const consumoDiarioG =
      consumoManual ??
      petDetalhesManualSelecionados.reduce((sum, pet) => {
        const consumo = consumoDiarioPetRacao({
          produto: produtoManual,
          pet,
          especiePadrao: clienteManual?.especies?.[0] ?? "cachorro",
          portePadrao: "medio",
        });
        return sum + consumo.consumoDiaG;
      }, 0);

    return calcularDiasRecompraRacao(pesoRacaoKg, consumoDiarioG);
  }, [
    clienteManual,
    petDetalhesManualSelecionados,
    petNomesManualSelecionados,
    produtoManual,
    vendaManual.consumoDiarioG,
    vendaManual.pesoKg,
    vendaManual.quantidade,
  ]);
  function petNomesCliente(cliente: Cliente): string[] {
    const detalhes = cliente.petsDetalhes?.map((pet) => pet.nome).filter(Boolean) ?? [];
    return Array.from(new Set([...detalhes, ...(cliente.pets ?? [])])).filter(Boolean);
  }
  const petsClienteManual = useMemo(() => {
    if (!clienteManual) return [];
    return petNomesCliente(clienteManual);
  }, [clienteManual]);
  const clientesManualFiltrados = useMemo(() => {
    const termo = clienteManualBusca.trim().toLowerCase();
    const lista = termo
      ? clientes.filter((cliente) =>
          [cliente.nome, cliente.telefone, cliente.bairro, petNomesCliente(cliente).join(" ")]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(termo),
        )
      : clientes;

    return lista.slice(0, 80);
  }, [clienteManualBusca, clientes]);
  const petsCadastradosManual = useMemo(() => {
    return clientes.flatMap((cliente) =>
      petNomesCliente(cliente).map((pet) => ({
        pet,
        cliente,
        label: `${pet} - ${cliente.nome}`,
      })),
    );
  }, [clientes]);

  useEffect(() => {
    if (!search.clienteId || clientes.length === 0) return;

    const cliente = clientes.find((item) => item.id === search.clienteId);
    if (!cliente) return;

    const pet = search.pet?.trim() || "";
    setClienteManualBusca(clienteManualLabel(cliente));
    setVendaManual((current) => {
      if (current.clienteId === cliente.id) return current;
      return {
        ...current,
        clienteId: cliente.id,
        petNome: pet,
        petNomes: pet ? [pet] : [],
      };
    });
  }, [clientes, search.clienteId, search.pet]);

  useEffect(() => {
    if (modeloManual || !diasRecompraSugeridos) return;
    const proximo = String(diasRecompraSugeridos);
    if (vendaManual.diasRecompra !== proximo) {
      updateVendaManual({ diasRecompra: proximo });
    }
  }, [diasRecompraSugeridos, modeloManual, vendaManual.diasRecompra]);

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/crm/recompra-prevista", { cache: "no-store" });
      const data = (await response.json()) as RecompraApiData | { erro?: string };
      if (!response.ok) {
        const erro = "erro" in data ? data.erro : undefined;
        throw new Error(erro ?? "Nao foi possivel carregar recompra");
      }
      const payload = data as RecompraApiData;
      setItems(payload.recompras ?? []);
      setProdutos(payload.produtos ?? []);
      setBairrosDemanda(payload.bairros ?? []);
      setAlertasIa(payload.alertas ?? []);
      setModelosRacao(payload.modelos ?? []);
    } catch (error) {
      setItems([]);
      setProdutos([]);
      setBairrosDemanda([]);
      setAlertasIa([]);
      setModelosRacao([]);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar recompra");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let alive = true;

    async function carregarApoio() {
      try {
        const [clientesRes, produtosRes] = await Promise.all([
          fetch("/api/crm/clientes", { cache: "no-store" }),
          fetch("/api/crm/produtos", { cache: "no-store" }),
        ]);
        const [clientesData, produtosData] = await Promise.all([
          clientesRes.json() as Promise<Cliente[] | { erro?: string }>,
          produtosRes.json() as Promise<Produto[] | { erro?: string }>,
        ]);
        if (!alive) return;
        if (Array.isArray(clientesData)) setClientes(clientesData);
        if (Array.isArray(produtosData)) setCatalogoProdutos(produtosData);
      } catch {
        if (alive) {
          setClientes([]);
          setCatalogoProdutos([]);
        }
      }
    }

    void carregarApoio();

    return () => {
      alive = false;
    };
  }, []);

  async function recalcular() {
    if (recalculando) return;
    setRecalculando(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", { method: "POST" });
      const data = (await response.json()) as { ok?: boolean; vendas?: number; erro?: string };
      if (!response.ok || !data.ok) throw new Error(data.erro ?? "Falha ao recalcular previsoes");
      toast.success(`Previsoes recalculadas · ${data.vendas ?? 0} vendas analisadas`);
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao recalcular previsoes");
    } finally {
      setRecalculando(false);
    }
  }

  function updateVendaManual(patch: Partial<VendaManualForm>) {
    setVendaManual((current) => ({ ...current, ...patch }));
  }

  function clienteManualLabel(cliente: Cliente): string {
    return `${cliente.nome} - ${cliente.telefone}`;
  }

  function escolherClienteManualPorTexto(value: string) {
    setClienteManualBusca(value);
    const cliente = clientes.find(
      (item) => clienteManualLabel(item) === value || item.nome === value || item.id === value,
    );
    updateVendaManual({
      clienteId: cliente?.id ?? "",
      petNome: "",
      petNomes: [],
    });
  }

  function escolherPetManualPorTexto(value: string) {
    updateVendaManual({ petNome: value });
    const termo = value.trim().toLowerCase();
    if (!termo) return;

    const match = petsCadastradosManual.find(
      (item) => item.pet.toLowerCase() === termo || item.label.toLowerCase() === termo,
    );
    if (!match || match.cliente.id === vendaManual.clienteId) return;

    setClienteManualBusca(clienteManualLabel(match.cliente));
    updateVendaManual({
      clienteId: match.cliente.id,
      petNome: match.pet,
      petNomes: [match.pet],
    });
  }

  function escolherProdutoManual(sku: string) {
    const produto = catalogoProdutos.find((item) => item.sku === sku);
    const modelo = modelosRacao.find((item) => item.sku === sku);
    updateVendaManual({
      sku,
      diasRecompra: String(modelo?.diasRecompra ?? (vendaManual.diasRecompra || 30)),
      consumoDiarioG: modelo?.consumoDiarioG
        ? String(modelo.consumoDiarioG)
        : vendaManual.consumoDiarioG,
      pesoKg: produto?.detalhesTecnicos?.peso?.match(/\d+(?:[,.]\d+)?/)?.[0] ?? vendaManual.pesoKg,
    });
  }

  function petsSelecionadosManual(): string[] {
    return petNomesManualSelecionados;
  }

  function togglePetManual(pet: string) {
    updateVendaManual({
      petNomes: vendaManual.petNomes.includes(pet)
        ? vendaManual.petNomes.filter((item) => item !== pet)
        : [...vendaManual.petNomes, pet],
    });
  }

  function atualizarPetDetalheManual(
    petNome: string,
    patch: Partial<VendaManualForm["petsDetalhes"][string]>,
  ) {
    const key = petDetalheKey(petNome);
    setVendaManual((current) => {
      const atual = current.petsDetalhes[key];
      const proximo = {
        especie: patch.especie ?? atual?.especie ?? "",
        raca: patch.raca ?? atual?.raca ?? "",
        porte: patch.porte ?? atual?.porte ?? "",
        pesoKg: patch.pesoKg ?? atual?.pesoKg ?? "",
      };

      return {
        ...current,
        petsDetalhes: {
          ...current.petsDetalhes,
          [key]: proximo,
        },
      };
    });
  }

  function petsDetalhesParaPayload(): PetDetalhe[] {
    return petDetalhesManualSelecionados.map((pet) => ({
      nome: pet.nome,
      ...(pet.especie ? { especie: pet.especie } : {}),
      ...(pet.raca ? { raca: pet.raca } : {}),
      ...(pet.porte ? { porte: pet.porte } : {}),
      ...(pet.pesoKg ? { pesoKg: pet.pesoKg } : {}),
    }));
  }

  async function salvarModeloAtual() {
    if (!produtoManual) {
      toast.error("Escolha uma racao do catalogo");
      return;
    }
    const diasRecompra = Number(vendaManual.diasRecompra);
    if (!Number.isFinite(diasRecompra) || diasRecompra <= 0) {
      toast.error("Informe o ciclo em dias dessa racao");
      return;
    }

    setSalvandoModelo(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "modelo_racao",
          sku: produtoManual.sku,
          produtoNome: produtoManual.nome,
          diasRecompra,
          consumoDiarioG: vendaManual.consumoDiarioG,
          ativo: true,
        }),
      });
      const data = (await response.json()) as ModeloRecompraRacao | { erro?: string };
      if (!response.ok || !("sku" in data)) {
        throw new Error("erro" in data ? data.erro : "Falha ao salvar modelo");
      }
      setModelosRacao((current) => {
        const exists = current.some((item) => item.sku === data.sku);
        return exists
          ? current.map((item) => (item.sku === data.sku ? data : item))
          : [...current, data].sort((a, b) => a.produtoNome.localeCompare(b.produtoNome));
      });
      toast.success("Modelo da racao salvo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar modelo");
    } finally {
      setSalvandoModelo(false);
    }
  }

  async function registrarVendaManual() {
    const petNomes = petsSelecionadosManual();
    if (!clienteManual || !produtoManual || petNomes.length === 0) {
      toast.error("Escolha cliente, pelo menos um pet e racao");
      return;
    }
    const diasRecompra = Number(vendaManual.diasRecompra);
    if (!Number.isFinite(diasRecompra) || diasRecompra <= 0) {
      toast.error("Informe em quantos dias deve recomprar");
      return;
    }
    const quantidade = Number(vendaManual.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error("Informe uma quantidade maior que zero");
      return;
    }

    setSalvandoVendaManual(true);
    try {
      const response = await fetch("/api/crm/recompra-prevista", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "venda_manual",
          clienteId: clienteManual.id,
          petNome: petNomes[0],
          petNomes,
          petsDetalhes: petsDetalhesParaPayload(),
          modoDistribuicao: vendaManual.modoDistribuicao,
          sku: produtoManual.sku,
          produtoNome: produtoManual.nome,
          compraEm: vendaManual.compraEm,
          diasRecompra,
          quantidade: vendaManual.quantidade,
          pesoKg: vendaManual.pesoKg,
          consumoDiarioG: vendaManual.consumoDiarioG,
        }),
      });
      const data = (await response.json()) as
        | RecompraPrevista
        | RecompraPrevista[]
        | { erro?: string };
      if (!response.ok || (!Array.isArray(data) && !("id" in data))) {
        throw new Error("erro" in data ? data.erro : "Falha ao registrar recompra");
      }
      const total = Array.isArray(data) ? data.length : 1;
      toast.success(
        total > 1 ? `${total} recompras previstas registradas` : "Recompra prevista registrada",
      );
      setVendaManual((current) => ({ ...VENDA_MANUAL_INICIAL, clienteId: current.clienteId }));
      await carregar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar recompra");
    } finally {
      setSalvandoVendaManual(false);
    }
  }

  const filtrados = useMemo(() => {
    return items.filter((r) => {
      if (busca && !`${r.cliente} ${r.pet} ${r.racao}`.toLowerCase().includes(busca.toLowerCase()))
        return false;
      if (cidade !== "Todas" && r.cidade !== cidade) return false;
      if (bairro !== "Todos" && r.bairro !== bairro) return false;
      switch (filtro) {
        case "Hoje":
          return r.diasRestantes <= 0 && r.diasRestantes >= -1;
        case "3 dias":
          return r.diasRestantes >= 0 && r.diasRestantes <= 3;
        case "7 dias":
          return r.diasRestantes >= 0 && r.diasRestantes <= 7;
        case "15 dias":
          return r.diasRestantes >= 0 && r.diasRestantes <= 15;
        case "Atrasados":
          return r.diasRestantes < 0;
        case "VIP":
          return r.perfil === "VIP";
        case "Premium":
          return r.perfil === "Premium";
        case "Econômico":
          return r.perfil === "Econômico";
        case "Cachorro":
          return r.especie === "cachorro";
        case "Gato":
          return r.especie === "gato";
        default:
          return true;
      }
    });
  }, [items, filtro, busca, cidade, bairro]);
  const avisosTutorSemana = useMemo(() => agruparAvisosPorTutor(filtrados), [filtrados]);

  // KPIs do topo
  const valorPrevistoProdutos = produtos.reduce(
    (s, p) => s + p.unidadesPrevistas * p.precoUnit * (p.taxaRecompra / 100),
    0,
  );
  const clientesEmRecompra = items.length;
  const taxaPrevista = produtos.length
    ? Math.round(produtos.reduce((s, p) => s + p.taxaRecompra, 0) / produtos.length)
    : 0;
  const atrasados = items.filter((r) => r.diasRestantes < 0).length;
  const urgentes = items.filter((r) => r.diasRestantes >= 0 && r.diasRestantes <= 3).length;

  function marcarContatado(id: string) {
    const atual = items.find((r) => r.id === id);
    const contatado = !atual?.contatado;
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, contatado } : r)));
    void fetch("/api/crm/recompra-prevista", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "contatado", id, contatado }),
    }).catch(() => undefined);
  }

  function gerarPedido(item: RecompraPrevista) {
    if (!item.sku) {
      toast.error("Nao foi possivel identificar o SKU dessa racao");
      return;
    }

    window.location.href = urlPedidoPdv(item);
  }

  function abrirConversaWhatsAppIa(item: RecompraPrevista) {
    if (!telefoneWhatsApp(item.telefone)) {
      toast.error("Cliente sem telefone para abrir conversa");
      return;
    }

    window.location.href = urlConversaWhatsAppIa(item);
  }

  function registrarFollowUp(item: RecompraPrevista) {
    if (!item.contatado) marcarContatado(item.id);
    toast.success("Follow-up marcado para esse cliente");
  }

  function toggleTravado(id: string) {
    const atual = items.find((r) => r.id === id);
    const travado = !atual?.travado;
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, travado } : r)));
    void fetch("/api/crm/recompra-prevista", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "travado", id, travado }),
    }).catch(() => undefined);
  }

  // ── IA stats ──
  const antecipando = items.filter((r) => r.comportamento === "antecipado").length;
  const atrasando = items.filter((r) => r.comportamento === "atrasado").length;
  const instaveis = items.filter((r) => r.comportamento === "instavel").length;
  const previsiveis = items.filter((r) => r.precisaoIA >= 85).length;
  const precisaoMedia = items.length
    ? Math.round(items.reduce((s, r) => s + r.precisaoIA, 0) / items.length)
    : 0;

  const drawerItem = items.find((i) => i.id === drawerId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="size-6 text-primary" /> Recompra Prevista
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Painel de vendas futuras · previsão de produtos, estoque e clientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70"
          >
            <Settings2 className="size-3.5" /> Config IA
          </button>
          <button
            onClick={() => void recalcular()}
            disabled={recalculando}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70 disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${recalculando ? "animate-spin" : ""}`} />
            {recalculando ? "Recalculando..." : "Recalcular"}
          </button>
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
            <Sparkles className="size-3.5" /> Disparar todos via IA
          </button>
        </div>
      </div>

      {/* RESUMO SUPERIOR */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Valor previsto"
          value={brl(valorPrevistoProdutos)}
          sub="próximas recompras"
          tone="primary"
        />
        <Kpi
          icon={<Users className="size-4" />}
          label="Clientes em recompra"
          value={String(clientesEmRecompra)}
          sub="ativos no funil"
        />
        <Kpi
          icon={<Target className="size-4" />}
          label="Taxa prevista"
          value={`${taxaPrevista}%`}
          sub="histórico + comportamento"
          tone="success"
        />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          label="Atrasados"
          value={String(atrasados)}
          sub="ação urgente"
          tone="destructive"
        />
        <Kpi
          icon={<Flame className="size-4" />}
          label="Urgentes"
          value={String(urgentes)}
          sub="próx. 3 dias"
          tone="amber"
        />
      </div>

      {/* IA ADAPTATIVA — DASHBOARD */}
      <section className="card-soft p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
              <ShoppingBag className="size-4 text-primary" /> Registrar racao vendida
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Cada pet gera uma previsao propria. Dois pets ou duas racoes viram ciclos separados.
            </p>
          </div>
          <span className="rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
            {modelosRacao.length} modelo(s) de ciclo
          </span>
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Cliente</span>
            <input
              list="clientes-recompra"
              value={clienteManualBusca}
              onChange={(event) => escolherClienteManualPorTexto(event.target.value)}
              className="input h-10"
              placeholder="Digite nome ou telefone"
              autoComplete="off"
            />
            <datalist id="clientes-recompra">
              {clientesManualFiltrados.map((cliente) => (
                <option key={cliente.id} value={clienteManualLabel(cliente)} />
              ))}
            </datalist>
            {clienteManual && (
              <div className="text-[10px] font-semibold text-primary truncate">
                Selecionado: {clienteManual.nome}
              </div>
            )}
            {!clienteManual && clienteManualBusca && (
              <div className="text-[10px] font-semibold text-destructive">
                Selecione um cliente da lista.
              </div>
            )}
          </label>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Pets</span>
            <div className="min-h-10 rounded-lg border border-border bg-background px-2 py-1.5">
              {petsClienteManual.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {petsClienteManual.map((pet) => {
                    const selected = vendaManual.petNomes.includes(pet);
                    return (
                      <button
                        key={pet}
                        type="button"
                        onClick={() => togglePetManual(pet)}
                        className={`h-7 rounded-md border px-2 text-[11px] font-bold transition ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary/50 hover:bg-secondary"
                        }`}
                      >
                        {pet}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="pt-1 text-[11px] font-semibold text-muted-foreground">
                  Selecione um cliente com pets cadastrados
                </div>
              )}
            </div>
            <input
              list="pets-recompra"
              value={vendaManual.petNome}
              onChange={(event) => escolherPetManualPorTexto(event.target.value)}
              className="input h-9"
              placeholder="Buscar ou adicionar pet"
            />
            <datalist id="pets-recompra">
              {petsClienteManual.map((pet) => (
                <option key={`cliente-${pet}`} value={pet} />
              ))}
              {petsCadastradosManual.map((item) => (
                <option key={`${item.cliente.id}-${item.pet}`} value={item.pet} label={item.cliente.nome} />
              ))}
            </datalist>
          </div>

          <label className="space-y-1.5 lg:col-span-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Racao</span>
            <select
              value={vendaManual.sku}
              onChange={(event) => escolherProdutoManual(event.target.value)}
              className="input h-10"
            >
              <option value="">Selecione a racao vendida</option>
              {produtosRacao.map((produto) => (
                <option key={produto.sku} value={produto.sku}>
                  {produto.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">
              Pets na acao
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {petsSelecionadosManual().length > 0 ? (
                petsSelecionadosManual().map((pet) => (
                  <span
                    key={pet}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-background px-2 text-[11px] font-bold"
                  >
                    {pet}
                    <button
                      type="button"
                      onClick={() =>
                        updateVendaManual({
                          petNomes: vendaManual.petNomes.filter((item) => item !== pet),
                          petNome: vendaManual.petNome.trim() === pet ? "" : vendaManual.petNome,
                        })
                      }
                      className="text-muted-foreground hover:text-foreground"
                      title="Remover pet"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Nenhum pet selecionado.
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">
              Distribuicao
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-background p-1">
              <button
                type="button"
                onClick={() => updateVendaManual({ modoDistribuicao: "compartilhada" })}
                className={`h-8 rounded-md text-[11px] font-bold ${
                  vendaManual.modoDistribuicao === "compartilhada"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary"
                }`}
              >
                Compartilhada
              </button>
              <button
                type="button"
                onClick={() => updateVendaManual({ modoDistribuicao: "por_pet" })}
                className={`h-8 rounded-md text-[11px] font-bold ${
                  vendaManual.modoDistribuicao === "por_pet"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary"
                }`}
              >
                Por pet
              </button>
            </div>
          </div>
        </div>

        {petDetalhesManualSelecionados.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {petDetalhesManualSelecionados.map((pet) => {
              const key = petDetalheKey(pet.nome);
              const manual = vendaManual.petsDetalhes[key] ?? {
                especie: "",
                raca: "",
                porte: "",
                pesoKg: "",
              };
              const racaValue = manual.raca || pet.raca || "";
              const especieValue = manual.especie || pet.especie || "";
              const porteValue = manual.porte || pet.porte || "";
              const pesoValue = manual.pesoKg || (pet.pesoKg ? String(pet.pesoKg) : "");

              return (
                <div key={pet.nome} className="rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">
                    Dados do pet - {pet.nome}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={especieValue}
                      onChange={(event) =>
                        atualizarPetDetalheManual(pet.nome, {
                          especie: event.target
                            .value as VendaManualForm["petsDetalhes"][string]["especie"],
                        })
                      }
                      className="input h-9 text-xs"
                    >
                      <option value="">Especie</option>
                      <option value="cachorro">Cachorro</option>
                      <option value="gato">Gato</option>
                    </select>
                    <select
                      value={porteValue}
                      onChange={(event) =>
                        atualizarPetDetalheManual(pet.nome, {
                          porte: event.target
                            .value as VendaManualForm["petsDetalhes"][string]["porte"],
                        })
                      }
                      className="input h-9 text-xs"
                    >
                      <option value="">Porte</option>
                      <option value="pequeno">Pequeno</option>
                      <option value="medio">Medio</option>
                      <option value="grande">Grande</option>
                    </select>
                    <input
                      value={racaValue}
                      onChange={(event) =>
                        atualizarPetDetalheManual(pet.nome, { raca: event.target.value })
                      }
                      className="input h-9 text-xs"
                      placeholder="Raca"
                    />
                    <input
                      value={pesoValue}
                      onChange={(event) =>
                        atualizarPetDetalheManual(pet.nome, { pesoKg: event.target.value })
                      }
                      className="input h-9 text-xs"
                      placeholder="Peso do pet kg"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <RecompraInput
            label="Comprada em"
            type="date"
            value={vendaManual.compraEm}
            onChange={(compraEm) => updateVendaManual({ compraEm })}
          />
          <RecompraInput
            label="Recomprar em dias"
            type="number"
            value={vendaManual.diasRecompra}
            onChange={(diasRecompra) => updateVendaManual({ diasRecompra })}
          />
          <RecompraInput
            label={vendaManual.modoDistribuicao === "por_pet" ? "Qtd por pet" : "Qtd total"}
            type="number"
            value={vendaManual.quantidade}
            onChange={(quantidade) => updateVendaManual({ quantidade })}
          />
          <RecompraInput
            label="Peso kg"
            value={vendaManual.pesoKg}
            onChange={(pesoKg) => updateVendaManual({ pesoKg })}
          />
          <RecompraInput
            label="Consumo g/dia"
            type="number"
            value={vendaManual.consumoDiarioG}
            onChange={(consumoDiarioG) => updateVendaManual({ consumoDiarioG })}
          />
          <div className="rounded-lg bg-secondary/60 p-3 text-xs">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Modelo</div>
            <div className="mt-1 font-bold">
              {modeloManual ? `${modeloManual.diasRecompra} dias` : "Sem modelo"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void registrarVendaManual()}
            disabled={salvandoVendaManual}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {salvandoVendaManual ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCheck className="size-4" />
            )}
            Registrar previsao
          </button>
          <button
            type="button"
            onClick={() => void salvarModeloAtual()}
            disabled={salvandoModelo || !produtoManual}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold hover:bg-secondary/70 disabled:opacity-50"
          >
            {salvandoModelo ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Settings2 className="size-4" />
            )}
            Salvar modelo dessa racao
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <Brain className="size-4 text-accent" /> IA adaptativa por cliente
          </h2>
          <span className="text-[11px] text-muted-foreground">
            aprende o ciclo real de cada cliente · ajustes automáticos
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi
            icon={<TrendingUp className="size-4" />}
            label="Antecipando"
            value={String(antecipando)}
            sub="recompra mais cedo"
            tone="success"
          />
          <Kpi
            icon={<TrendingDown className="size-4" />}
            label="Atrasando"
            value={String(atrasando)}
            sub="ciclo aumentando"
            tone="destructive"
          />
          <Kpi
            icon={<Activity className="size-4" />}
            label="Instáveis"
            value={String(instaveis)}
            sub="padrão irregular"
            tone="amber"
          />
          <Kpi
            icon={<Target className="size-4" />}
            label="Altamente previsíveis"
            value={String(previsiveis)}
            sub="precisão ≥ 85%"
            tone="primary"
          />
          <Kpi
            icon={<Brain className="size-4" />}
            label="Precisão IA média"
            value={`${precisaoMedia}%`}
            sub="todos os clientes"
            tone="primary"
          />
        </div>

        {/* Alertas IA */}
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3 text-accent" /> Alertas da IA
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {alertasIa.length === 0 && (
              <div className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground">
                {loading ? "Carregando previsoes..." : "Nenhum alerta de recompra no momento."}
              </div>
            )}
            {alertasIa.map((a, i) => {
              const tone =
                a.tipo === "antecipou"
                  ? "border-success/30 bg-success/5 text-success"
                  : a.tipo === "atrasou"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : a.tipo === "instavel"
                      ? "border-amber-500/30 bg-amber-500/5 text-amber-600"
                      : "border-primary/30 bg-primary/5 text-primary";
              return (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-[11px] flex items-start gap-2 ${tone}`}
                >
                  <Sparkles className="size-3.5 shrink-0 mt-0.5" />
                  <div className="text-foreground/90">
                    <b>{a.cliente}</b> <span className="opacity-80">{a.msg}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showConfig && (
          <div className="card-soft p-4 space-y-3 border border-accent/30">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-2">
                <Settings2 className="size-4 text-accent" /> Configurações da IA de recompra
              </div>
              <button
                onClick={() => setShowConfig(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ConfigSlider
                label="Sensibilidade do aprendizado"
                value={iaConfig.sensibilidade}
                onChange={(v) => setIaConfig({ ...iaConfig, sensibilidade: v })}
                hint="quão rápido a IA muda a previsão"
              />
              <ConfigSlider
                label="Peso do histórico recente"
                value={iaConfig.pesoRecente}
                onChange={(v) => setIaConfig({ ...iaConfig, pesoRecente: v })}
                hint="prioriza últimas compras vs média geral"
              />
              <ConfigNumber
                label="Mínimo de compras p/ aprender"
                value={iaConfig.minCompras}
                onChange={(v) => setIaConfig({ ...iaConfig, minCompras: v })}
              />
              <label className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold">Ajuste automático</div>
                  <div className="text-[10px] text-muted-foreground">
                    aplicar correção sem confirmação
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={iaConfig.ajusteAuto}
                  onChange={(e) => setIaConfig({ ...iaConfig, ajusteAuto: e.target.checked })}
                  className="size-4 accent-accent"
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* PRODUTOS PREVISTOS — PAINEL OPERACIONAL */}
      <PrevisaoProdutos produtosPrevistos={produtos} semana={semana} setSemana={setSemana} />

      {/* LOGÍSTICA + COMPRAS */}
      <PrevisaoLogistica demandaBairros={bairrosDemanda} semana={semana} />

      {/* AUTOMAÇÕES POR CATEGORIA DE PRODUTO */}
      <AutomacoesCategoria produtosPrevistos={produtos} />

      <AvisosTutorSemana grupos={avisosTutorSemana} loading={loading} />

      {/* FILTROS */}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Users className="size-4 text-primary" /> Clientes em recompra
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, pet ou ração..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
          <select
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold outline-none"
          >
            {cidades.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold outline-none"
          >
            {bairros.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filtros.map((f) => {
              const on = filtro === f;
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    on
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card border-border hover:border-foreground/30"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabela */}
        <div className="card-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1460px] w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                  <th className="text-left font-semibold px-3 py-2.5">Cliente</th>
                  <th className="text-left font-semibold px-3 py-2.5">Pet</th>
                  <th className="text-left font-semibold px-3 py-2.5">Ração atual</th>
                  <th
                    className="text-center font-semibold px-3 py-2.5"
                    title="Duracao teorica da racao pelo peso comprado e consumo diario dos pets"
                  >
                    Cálculo da ração
                  </th>
                  <th
                    className="text-center font-semibold px-3 py-2.5"
                    title="Media real de dias entre os pedidos anteriores deste cliente"
                  >
                    Intervalo dos pedidos
                  </th>
                  <th className="text-left font-semibold px-3 py-2.5">Comportamento</th>
                  <th className="text-center font-semibold px-3 py-2.5">Precisão</th>
                  <th className="text-left font-semibold px-3 py-2.5">Tendência</th>
                  <th className="text-center font-semibold px-3 py-2.5">Dias</th>
                  <th className="text-left font-semibold px-3 py-2.5">Prevista</th>
                  <th className="text-right font-semibold px-3 py-2.5">Estimado</th>
                  <th className="text-center font-semibold px-3 py-2.5">Status</th>
                  <th className="text-right font-semibold px-3 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const st = statusMap[r.status];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDrawerId(r.id)}
                      className={`border-t border-border hover:bg-secondary/40 transition cursor-pointer ${
                        r.contatado ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-xs">{r.cliente}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3" /> {r.cidade} · {r.bairro}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <SpeciePill especie={r.especie} compact />
                          <span className="font-semibold text-xs">{r.pet}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.racao}
                        <div className="text-[10px] font-bold text-foreground mt-0.5">
                          {r.quantidade} un
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          comprou {r.ultimaCompra} · há {r.diasDesdeCompra ?? 0}d
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          consumo {(r.consumoDiaKg * 1000).toFixed(0)}g/dia
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="font-bold text-sm tabular-nums">
                          {r.cicloRacao ?? r.previsaoBase}d
                        </div>
                        <div className="text-[10px] text-muted-foreground">peso ÷ consumo</div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.intervaloPedidos ? (
                          <>
                            <div className="font-bold text-sm tabular-nums">
                              {r.intervaloPedidos}d
                            </div>
                            <div
                              className={`text-[10px] font-semibold ${
                                r.origemCiclo === "historico"
                                  ? "text-primary"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {r.origemCiclo === "historico" ? "usado na previsão" : "histórico"}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] font-semibold text-muted-foreground">
                            Sem histórico
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <ComportamentoPill c={r.comportamento} />
                      </td>
                      <td className="px-3 py-3">
                        <PrecisaoBar v={r.precisaoIA} />
                      </td>
                      <td className="px-3 py-3">
                        <TendenciaPill t={r.tendencia} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`font-bold text-sm ${
                            r.diasRestantes < 0
                              ? "text-destructive"
                              : r.diasRestantes <= 3
                                ? "text-destructive"
                                : r.diasRestantes <= 7
                                  ? "text-amber-600"
                                  : "text-foreground"
                          }`}
                        >
                          {r.diasRestantes < 0
                            ? `${Math.abs(r.diasRestantes)}d atraso`
                            : `${r.diasRestantes}d`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          {r.dataPrevista}
                          {r.travado && <Lock className="size-3 text-accent" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-xs">
                        {brl(r.valorEstimado)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border ${st.cls}`}
                        >
                          <span className={`size-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => abrirConversaWhatsAppIa(r)}
                            title="Abrir conversa no WhatsApp IA"
                            className="size-8 grid place-items-center rounded-lg bg-success/15 text-success hover:bg-success/25 transition"
                          >
                            <MessageCircle className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => gerarPedido(r)}
                            title="Gerar pedido"
                            className="size-8 grid place-items-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition"
                          >
                            <ShoppingBag className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirConversaWhatsAppIa(r)}
                            title="Abrir conversa no WhatsApp IA"
                            className="size-8 grid place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition"
                          >
                            <Sparkles className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => registrarFollowUp(r)}
                            title="Follow-up"
                            className="size-8 grid place-items-center rounded-lg bg-secondary hover:bg-secondary/70 transition"
                          >
                            <Bell className="size-4" />
                          </button>
                          <button
                            title={r.travado ? "Destravar previsão" : "Travar previsão"}
                            onClick={() => toggleTravado(r.id)}
                            className={`size-8 grid place-items-center rounded-lg transition ${
                              r.travado
                                ? "bg-accent text-accent-foreground"
                                : "bg-secondary hover:bg-secondary/70"
                            }`}
                          >
                            {r.travado ? (
                              <Lock className="size-4" />
                            ) : (
                              <LockOpen className="size-4" />
                            )}
                          </button>
                          <button
                            title="Marcar contatado"
                            onClick={() => marcarContatado(r.id)}
                            className={`size-8 grid place-items-center rounded-lg transition ${
                              r.contatado
                                ? "bg-success text-success-foreground"
                                : "bg-secondary hover:bg-secondary/70"
                            }`}
                          >
                            <CheckCheck className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-10 text-center text-xs text-muted-foreground"
                    >
                      Nenhum cliente neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {drawerItem && (
        <ClienteDrawer
          item={drawerItem}
          onClose={() => setDrawerId(null)}
          onWhatsAppIa={abrirConversaWhatsAppIa}
          onGerarPedido={gerarPedido}
          onFollowUp={registrarFollowUp}
        />
      )}
    </div>
  );
}

type TutorAvisoGrupo = {
  key: string;
  clienteId: string;
  cliente: string;
  telefone: string;
  cidade: string;
  bairro: string;
  totalQuantidade: number;
  totalValor: number;
  maisUrgente: number;
  itens: RecompraPrevista[];
};

function quantidadeLabel(quantidade: number): string {
  return `${quantidade} un`;
}

function prazoLabel(dias: number): string {
  if (dias < 0) return `venceu ha ${Math.abs(dias)}d`;
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanha";
  return `vence em ${dias}d`;
}

function agruparAvisosPorTutor(recompras: RecompraPrevista[]): TutorAvisoGrupo[] {
  const grupos = new Map<string, TutorAvisoGrupo>();

  for (const recompra of recompras) {
    if (recompra.diasRestantes > 7) continue;

    const key = recompra.clienteId || recompra.telefone || recompra.cliente;
    const atual =
      grupos.get(key) ??
      ({
        key,
        clienteId: recompra.clienteId,
        cliente: recompra.cliente,
        telefone: recompra.telefone,
        cidade: recompra.cidade,
        bairro: recompra.bairro,
        totalQuantidade: 0,
        totalValor: 0,
        maisUrgente: recompra.diasRestantes,
        itens: [],
      } satisfies TutorAvisoGrupo);

    atual.totalQuantidade += recompra.quantidade;
    atual.totalValor += recompra.valorEstimado;
    atual.maisUrgente = Math.min(atual.maisUrgente, recompra.diasRestantes);
    atual.itens.push(recompra);
    grupos.set(key, atual);
  }

  return Array.from(grupos.values())
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.sort((a, b) => a.diasRestantes - b.diasRestantes),
    }))
    .sort((a, b) => a.maisUrgente - b.maisUrgente || b.totalValor - a.totalValor);
}

function urlConversaTutorWhatsAppIa(grupo: TutorAvisoGrupo): string {
  const params = new URLSearchParams({
    telefone: telefoneWhatsApp(grupo.telefone),
    cliente: grupo.cliente,
    origem: "avisos-tutor",
  });

  if (grupo.clienteId) params.set("clienteId", grupo.clienteId);

  return `/conversas?${params.toString()}`;
}

function abrirConversaTutorWhatsAppIa(grupo: TutorAvisoGrupo) {
  if (!telefoneWhatsApp(grupo.telefone)) {
    toast.error("Tutor sem telefone para abrir conversa");
    return;
  }

  window.location.href = urlConversaTutorWhatsAppIa(grupo);
}

function mensagemAvisoTutor(grupo: TutorAvisoGrupo): string {
  const primeiroNome = grupo.cliente.split(" ")[0] || grupo.cliente;
  const linhas = grupo.itens
    .map(
      (item) =>
        `- ${item.pet}: ${item.racao} (${quantidadeLabel(item.quantidade)}), ${prazoLabel(
          item.diasRestantes,
        )}`,
    )
    .join("\n");

  return `Oi ${primeiroNome}! A recompra esta prevista para essa semana:\n${linhas}\nPosso separar pra voce?`;
}

function AvisosTutorSemana({ grupos, loading }: { grupos: TutorAvisoGrupo[]; loading: boolean }) {
  const [draft, setDraft] = useState<AgendamentoTutorDraft | null>(null);
  const [followupsAbertos, setFollowupsAbertos] = useState<AvisoTutorFollowup[]>([]);
  const [carregandoFollowups, setCarregandoFollowups] = useState(false);

  const carregarFollowupsAbertos = useCallback(async () => {
    setCarregandoFollowups(true);
    try {
      const response = await fetch(
        "/api/crm/followups?status=pendente,aguardando_confirmacao,erro",
        { cache: "no-store" },
      );
      const data = (await response.json()) as AvisoTutorFollowup[] | { erro?: string };
      if (!response.ok || !Array.isArray(data)) {
        throw new Error(Array.isArray(data) ? "Falha ao carregar agendamentos" : data.erro);
      }
      setFollowupsAbertos(
        data.filter((followup) => followup.contexto?.objetivo === "Aviso de recompra prevista"),
      );
    } catch {
      setFollowupsAbertos([]);
    } finally {
      setCarregandoFollowups(false);
    }
  }, []);

  useEffect(() => {
    void carregarFollowupsAbertos();
  }, [carregarFollowupsAbertos]);

  const proximoFollowupPorTelefone = useMemo(() => {
    const mapa = new Map<string, AvisoTutorFollowup>();
    for (const followup of followupsAbertos) {
      const key = telefoneKey(followup.telefone);
      if (!key) continue;
      const atual = mapa.get(key);
      if (!atual || followup.agendadoPara.localeCompare(atual.agendadoPara) < 0) {
        mapa.set(key, followup);
      }
    }
    return mapa;
  }, [followupsAbertos]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <Bell className="size-4 text-amber-600" /> Avisos por tutor
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Tutores com recompra vencida ou vencendo nos proximos 7 dias.
          </p>
        </div>
        <span className="rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
          {grupos.length} tutor(es)
          {carregandoFollowups ? " - agenda..." : ""}
        </span>
      </div>

      {grupos.length === 0 ? (
        <div className="card-soft px-4 py-5 text-xs text-muted-foreground">
          {loading ? "Carregando avisos..." : "Nenhum tutor para avisar nesse filtro."}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {grupos.map((grupo) => {
            const telefone = grupo.telefone.replace(/\D/g, "");
            const followupAberto = proximoFollowupPorTelefone.get(telefoneKey(grupo.telefone));

            return (
              <div key={grupo.key} className="card-soft p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{grupo.cliente}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="size-3" /> {grupo.cidade} Â· {grupo.bairro}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${
                      grupo.maisUrgente < 0
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : grupo.maisUrgente <= 3
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {prazoLabel(grupo.maisUrgente)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Mini label="Quantidade" value={quantidadeLabel(grupo.totalQuantidade)} />
                  <Mini label="Estimado" value={brl(grupo.totalValor)} accent="success" />
                </div>

                {followupAberto && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      followupAberto.status === "erro"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : followupAberto.status === "aguardando_confirmacao"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-success/30 bg-success/10 text-success"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold">
                        <CalendarClock className="size-3.5" /> Agendado
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">
                        {dataHoraAgendamentoLabel(followupAberto.agendadoPara)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {followupAberto.status === "aguardando_confirmacao"
                        ? "Aguardando confirmacao"
                        : followupAberto.status === "erro"
                          ? "Falhou no envio"
                          : followupAberto.disparo === "automatico"
                            ? "Vai disparar sozinho"
                            : "Vai pedir confirmacao"}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {grupo.itens.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-lg border border-border bg-secondary/35 px-3 py-2 text-left hover:bg-secondary/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold truncate">{item.racao}</span>
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {quantidadeLabel(item.quantidade)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{item.pet}</span>
                        <span className="shrink-0">{prazoLabel(item.diasRestantes)}</span>
                      </div>
                    </button>
                  ))}
                  {grupo.itens.length > 4 && (
                    <div className="text-[11px] font-semibold text-muted-foreground">
                      +{grupo.itens.length - 4} outro(s) item(ns)
                    </div>
                  )}
                </div>

                {telefone ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => abrirConversaTutorWhatsAppIa(grupo)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent/15 px-3 text-xs font-bold text-accent hover:bg-accent/25"
                    >
                      <MessageCircle className="size-4" /> Conversa IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft({ grupo, texto: mensagemAvisoTutor(grupo) })}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-success/15 px-3 text-xs font-bold text-success hover:bg-success/25"
                    >
                      <CalendarClock className="size-4" /> Agendar aviso
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-secondary text-xs font-bold text-muted-foreground opacity-70"
                  >
                    <MessageCircle className="size-4" /> Sem telefone
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {draft && (
        <AgendarAvisoTutorModal
          draft={draft}
          onChange={(texto) => setDraft((current) => (current ? { ...current, texto } : current))}
          onClose={() => setDraft(null)}
          onScheduled={() => void carregarFollowupsAbertos()}
        />
      )}
    </section>
  );
}

function AgendarAvisoTutorModal({
  draft,
  onChange,
  onClose,
  onScheduled,
}: {
  draft: AgendamentoTutorDraft;
  onChange: (texto: string) => void;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [quando, setQuando] = useState(defaultAgendamentoLocal);
  const [disparo, setDisparo] = useState<"automatico" | "confirmar">("automatico");
  const [salvando, setSalvando] = useState(false);

  async function agendar() {
    const telefone = draft.grupo.telefone.replace(/\D/g, "");
    const agendadoPara = localDateTimeParaIso(quando);

    if (!telefone) {
      toast.error("Tutor sem telefone valido");
      return;
    }
    if (!agendadoPara) {
      toast.error("Escolha uma data e hora validas");
      return;
    }
    if (!draft.texto.trim()) {
      toast.error("Escreva a mensagem que sera enviada");
      return;
    }

    setSalvando(true);
    try {
      const response = await fetch("/api/crm/followups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telefone,
          clienteNome: draft.grupo.cliente,
          agendadoPara,
          modo: "manual",
          disparo,
          mensagem: draft.texto.trim(),
          contexto: {
            nome: draft.grupo.cliente,
            pet: draft.grupo.itens.map((item) => item.pet).filter(Boolean).join(", "),
            resumo: draft.grupo.itens
              .map((item) => `${item.pet}: ${item.racao} (${prazoLabel(item.diasRestantes)})`)
              .join("; "),
            objetivo: "Aviso de recompra prevista",
          },
        }),
      });
      const data = (await response.json()) as { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Falha ao agendar aviso");
      toast.success(
        disparo === "automatico"
          ? "Aviso agendado para disparar sozinho"
          : "Aviso agendado para confirmar no horario",
      );
      onScheduled();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao agendar aviso");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-2xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Aviso de recompra agendado
            </div>
            <h3 className="text-base font-bold">{draft.grupo.cliente}</h3>
            <p className="text-xs text-muted-foreground">
              {draft.grupo.itens.length} item(ns) - {prazoLabel(draft.grupo.maisUrgente)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg bg-secondary hover:bg-secondary/70"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="space-y-1.5 block">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">Quando</span>
          <input
            type="datetime-local"
            value={quando}
            onChange={(event) => setQuando(event.target.value)}
            className="input h-10"
          />
        </label>

        <textarea
          value={draft.texto}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-h-36 rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 ring-primary/30 resize-y"
          placeholder="Mensagem que sera enviada no horario"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDisparo("automatico")}
            className={`h-9 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
              disparo === "automatico"
                ? "border-success/40 bg-success/15 text-success"
                : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Send className="size-3.5" /> Envia sozinho
          </button>
          <button
            type="button"
            onClick={() => setDisparo("confirmar")}
            className={`h-9 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
              disparo === "confirmar"
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:bg-secondary/70"
            }`}
          >
            <Check className="size-3.5" /> Eu confirmo
          </button>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg bg-secondary text-xs font-bold hover:bg-secondary/70"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void agendar()}
            disabled={salvando || !draft.texto.trim()}
            className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-bold inline-flex items-center gap-1.5 hover:bg-success/90 disabled:opacity-50"
          >
            {salvando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CalendarClock className="size-3.5" />
            )}
            {salvando ? "Agendando..." : "Agendar aviso"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecompraInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input h-10"
      />
    </label>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "success" | "destructive" | "amber";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-success"
        : tone === "destructive"
          ? "text-destructive"
          : tone === "amber"
            ? "text-amber-600"
            : "text-foreground";
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
        <span className={toneCls}>{icon}</span> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
}) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div
        className={`font-bold text-xs mt-0.5 ${
          accent === "success" ? "text-success" : accent === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ConfigSlider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="tabular-nums text-accent">{value}%</span>
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mb-1.5">{hint}</div>}
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-accent"
      />
    </div>
  );
}

function ConfigNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5">
      <div className="text-xs font-semibold">{label}</div>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-16 h-7 px-2 rounded-md bg-background text-xs font-bold text-right outline-none ring-1 ring-border focus:ring-accent"
      />
    </label>
  );
}

function ComportamentoPill({ c }: { c: ComportamentoIA }) {
  const map: Record<ComportamentoIA, { label: string; cls: string; icon: React.ReactNode }> = {
    antecipado: {
      label: "Antecipado",
      cls: "bg-success/15 text-success border-success/30",
      icon: <TrendingUp className="size-3" />,
    },
    pontual: {
      label: "Pontual",
      cls: "bg-primary/15 text-primary border-primary/30",
      icon: <Target className="size-3" />,
    },
    atrasado: {
      label: "Atrasado",
      cls: "bg-destructive/15 text-destructive border-destructive/30",
      icon: <TrendingDown className="size-3" />,
    },
    instavel: {
      label: "Instável",
      cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",
      icon: <Activity className="size-3" />,
    },
  };
  const x = map[c];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${x.cls}`}
    >
      {x.icon}
      {x.label}
    </span>
  );
}

function TendenciaPill({ t }: { t: TendenciaIA }) {
  const map: Record<TendenciaIA, { label: string; cls: string; icon: React.ReactNode }> = {
    acelerando: {
      label: "Comprando antes",
      cls: "text-success",
      icon: <TrendingUp className="size-3" />,
    },
    estavel: { label: "Estável", cls: "text-muted-foreground", icon: <Minus className="size-3" /> },
    desacelerando: {
      label: "Comprando depois",
      cls: "text-destructive",
      icon: <TrendingDown className="size-3" />,
    },
  };
  const x = map[t];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${x.cls}`}>
      {x.icon}
      {x.label}
    </span>
  );
}

function PrecisaoBar({ v }: { v: number }) {
  const tone =
    v >= 85 ? "bg-success" : v >= 70 ? "bg-primary" : v >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums">{v}%</span>
    </div>
  );
}

function ClienteDrawer({
  item,
  onClose,
  onWhatsAppIa,
  onGerarPedido,
  onFollowUp,
}: {
  item: RecompraPrevista;
  onClose: () => void;
  onWhatsAppIa: (item: RecompraPrevista) => void;
  onGerarPedido: (item: RecompraPrevista) => void;
  onFollowUp: (item: RecompraPrevista) => void;
}) {
  const hist = item.historicoDias;
  const cicloRacao = item.cicloRacao ?? item.previsaoBase;
  const desvioPedidos = item.intervaloPedidos == null ? null : item.intervaloPedidos - cicloRacao;
  const max = Math.max(...hist);
  const min = Math.min(...hist);
  const delta = hist.length > 1 ? hist[hist.length - 1] - hist[0] : 0;
  const insight =
    delta < -1
      ? "Consumo aumentando · ciclo encurtando"
      : delta > 1
        ? "Consumo diminuindo · ciclo aumentando"
        : "Padrão estável · alta previsibilidade";
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-md bg-card border-l border-border shadow-2xl overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Brain className="size-3 text-accent" /> Perfil IA · {item.pet}
            </div>
            <h3 className="text-lg font-bold mt-0.5">{item.cliente}</h3>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="size-3" /> {item.cidade} · {item.bairro}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg bg-secondary hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Mini label="Cálculo da ração" value={`${cicloRacao}d`} />
          <Mini
            label="Intervalo dos pedidos"
            value={item.intervaloPedidos ? `${item.intervaloPedidos}d` : "Sem histórico"}
            accent={item.origemCiclo === "historico" ? "success" : undefined}
          />
          <Mini label="Ciclo usado na previsão" value={`${item.previsaoBase}d`} />
          <Mini
            label="Diferença pedido × ração"
            value={desvioPedidos == null ? "—" : `${desvioPedidos > 0 ? "+" : ""}${desvioPedidos}d`}
            accent={desvioPedidos != null && Math.abs(desvioPedidos) >= 7 ? "danger" : undefined}
          />
          <Mini
            label="Precisão IA"
            value={`${item.precisaoIA}%`}
            accent={item.precisaoIA >= 85 ? "success" : undefined}
          />
          <Mini label="Compras analisadas" value={`${item.historicoDias.length}`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ComportamentoPill c={item.comportamento} />
          <TendenciaPill t={item.tendencia} />
          {item.travado && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-accent/30 bg-accent/10 text-accent">
              <Lock className="size-3" /> Travado
            </span>
          )}
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-[11px] flex items-start gap-2">
          <Sparkles className="size-3.5 text-accent shrink-0 mt-0.5" />
          <div>
            <b className="text-accent">IA:</b> {insight}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2">
            Histórico de ciclos
          </div>
          <div className="space-y-1.5">
            {hist.map((d, i) => {
              const w = ((d - min) / Math.max(1, max - min)) * 100;
              const isLast = i === hist.length - 1;
              return (
                <div key={i} className="grid grid-cols-[60px_1fr_40px] items-center gap-2">
                  <div className="text-[11px] text-muted-foreground">Compra {i + 1}</div>
                  <div className="h-5 rounded-md bg-secondary/60 overflow-hidden">
                    <div
                      className={`h-full ${isLast ? "bg-gradient-to-r from-primary to-accent" : "bg-primary/40"}`}
                      style={{ width: `${30 + w * 0.7}%` }}
                    />
                  </div>
                  <div className="text-[11px] font-bold text-right tabular-nums">{d}d</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            mín {min}d · máx {max}d · variação {max - min}d
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2">
            Próxima recompra
          </div>
          <div className="rounded-lg bg-secondary/60 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Previsão ajustada IA</div>
              <div className="text-lg font-bold">{item.dataPrevista}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Estimado</div>
              <div className="text-lg font-bold text-success">
                {item.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => onWhatsAppIa(item)}
            className="h-9 rounded-lg bg-success/15 text-success text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-success/25"
          >
            <MessageCircle className="size-3.5" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => onGerarPedido(item)}
            className="h-9 rounded-lg bg-primary/15 text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-primary/25"
          >
            <ShoppingBag className="size-3.5" /> Gerar pedido
          </button>
          <button
            type="button"
            onClick={() => onWhatsAppIa(item)}
            className="h-9 rounded-lg bg-accent/15 text-accent text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-accent/25"
          >
            <Sparkles className="size-3.5" /> Lembrete IA
          </button>
          <button
            type="button"
            onClick={() => onFollowUp(item)}
            className="h-9 rounded-lg bg-secondary text-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70"
          >
            <Bell className="size-3.5" /> Follow-up
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpeciePill({
  especie,
  compact,
}: {
  especie: "cachorro" | "gato";
  compact?: boolean;
}) {
  const isDog = especie === "cachorro";
  const cls = isDog
    ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"
    : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}
    >
      {isDog ? "🐶" : "🐱"} {!compact && (isDog ? "Cachorro" : "Gato")}
    </span>
  );
}

// ───────────────────────── PRODUTOS PREVISTOS ─────────────────────────
const SEMANAS = ["Todas semanas", "Semana 1", "Semana 2", "Semana 3", "Semana 4"] as const;
const PERIODOS_COMPRA = [
  { label: "1 semana", semanas: 1 },
  { label: "2 semanas", semanas: 2 },
  { label: "3 semanas", semanas: 3 },
  { label: "4 semanas", semanas: 4 },
  { label: "6 semanas", semanas: 6 },
  { label: "2 meses", semanas: 8 },
  { label: "3 meses", semanas: 12 },
] as const;

function brl2(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function unidadesNaSemana(p: ProdutoPrevisto, s: 0 | 1 | 2 | 3 | 4) {
  return s === 0 ? p.semanas.reduce((a, b) => a + b, 0) : p.semanas[s - 1];
}

function unidadesNoPeriodo(p: ProdutoPrevisto, semanas: number) {
  if (semanas <= 4) return p.semanas.slice(0, semanas).reduce((a, b) => a + b, 0);
  const quatroSemanas = p.semanas.reduce((a, b) => a + b, 0);
  return Math.round((quatroSemanas / 4) * semanas);
}

function PrevisaoProdutos({
  produtosPrevistos,
  semana,
  setSemana,
}: {
  produtosPrevistos: ProdutoPrevisto[];
  semana: 0 | 1 | 2 | 3 | 4;
  setSemana: (s: 0 | 1 | 2 | 3 | 4) => void;
}) {
  const [periodoCompra, setPeriodoCompra] =
    useState<(typeof PERIODOS_COMPRA)[number]["semanas"]>(4);
  const totals = useMemo(() => {
    let unidades = 0,
      receita = 0,
      custo = 0,
      necessario = 0;
    produtosPrevistos.forEach((p) => {
      const u = unidadesNaSemana(p, semana);
      unidades += u;
      receita += u * p.precoUnit * (p.taxaRecompra / 100);
      custo += u * p.custoUnit;
      const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
      necessario += Math.max(0, u - livre);
    });
    return { unidades, receita, margem: receita - custo, necessario };
  }, [produtosPrevistos, semana]);

  const rupturas = produtosPrevistos.filter(
    (p) => p.rupturaSemana && (semana === 0 || p.rupturaSemana <= semana),
  );
  const resumoPeriodo = useMemo(() => {
    return produtosPrevistos
      .map((p) => {
        const unidades = unidadesNoPeriodo(p, periodoCompra);
        const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
        const comprar = Math.max(0, unidades - livre);
        return {
          id: p.id,
          nome: p.nome,
          categoria: p.categoria,
          unidades,
          comprar,
          valor: unidades * p.precoUnit * (p.taxaRecompra / 100),
        };
      })
      .filter((item) => item.unidades > 0 || item.comprar > 0)
      .sort((a, b) => b.comprar - a.comprar || b.unidades - a.unidades || b.valor - a.valor)
      .slice(0, 8);
  }, [periodoCompra, produtosPrevistos]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Package className="size-4 text-primary" /> Previsão por semana — produtos
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SEMANAS.map((label, i) => {
            const on = semana === i;
            return (
              <button
                key={label}
                onClick={() => setSemana(i as 0 | 1 | 2 | 3 | 4)}
                className={`px-3 h-8 rounded-full text-[11px] font-bold border transition ${
                  on
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border hover:border-foreground/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Boxes className="size-4" />}
          label="Unidades previstas"
          value={`${totals.unidades} un`}
          sub={semana === 0 ? "4 semanas" : `Semana ${semana}`}
          tone="primary"
        />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Receita prevista"
          value={brl2(totals.receita)}
          sub="recompra ponderada"
          tone="success"
        />
        <Kpi
          icon={<Target className="size-4" />}
          label="Margem prevista"
          value={brl2(totals.margem)}
          sub="receita − custo"
          tone="success"
        />
        <Kpi
          icon={<ShoppingCart className="size-4" />}
          label="Estoque a comprar"
          value={`+${totals.necessario}`}
          sub="cobrir o período"
          tone="destructive"
        />
      </div>

      {/* Alertas logísticos */}
      <div className="card-soft p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" /> Resumo de compra do periodo
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Quantidade prevista por produto para orientar a recompra do fornecedor.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS_COMPRA.map((periodo) => (
              <button
                key={periodo.semanas}
                onClick={() => setPeriodoCompra(periodo.semanas)}
                className={`h-8 rounded-full border px-3 text-[11px] font-bold transition ${
                  periodoCompra === periodo.semanas
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:border-foreground/30"
                }`}
              >
                {periodo.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {resumoPeriodo.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="truncate text-xs font-bold">{item.nome}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {item.categoria}
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Previsto</div>
                  <div className="text-lg font-bold tabular-nums">{item.unidades}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-muted-foreground">Comprar</div>
                  <div
                    className={`text-lg font-bold tabular-nums ${
                      item.comprar > 0 ? "text-primary" : "text-success"
                    }`}
                  >
                    {item.comprar > 0 ? `+${item.comprar}` : "ok"}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {resumoPeriodo.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              Sem produtos previstos para o periodo.
            </div>
          )}
        </div>
      </div>

      {rupturas.length > 0 && (
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-3 text-destructive" /> Alertas logísticos da IA
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {rupturas.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] flex items-start gap-2"
              >
                <AlertTriangle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <b className="text-destructive">{p.nome}</b> · pode faltar antes da semana{" "}
                  {p.rupturaSemana}
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] flex items-start gap-2">
              <Truck className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <b className="text-amber-600">Bairro Rau</b> · alta concentração de entregas
                previstas
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TABELA COMPLETA */}
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                <th className="text-left   font-semibold px-3 py-2.5">Produto</th>
                <th className="text-left   font-semibold px-3 py-2.5">Categoria</th>
                <th className="text-center font-semibold px-3 py-2.5">S1</th>
                <th className="text-center font-semibold px-3 py-2.5">S2</th>
                <th className="text-center font-semibold px-3 py-2.5">S3</th>
                <th className="text-center font-semibold px-3 py-2.5">S4</th>
                <th className="text-center font-semibold px-3 py-2.5">Total</th>
                <th className="text-center font-semibold px-3 py-2.5">Estoque</th>
                <th className="text-center font-semibold px-3 py-2.5">Reservado</th>
                <th className="text-center font-semibold px-3 py-2.5">Necessário</th>
                <th className="text-left   font-semibold px-3 py-2.5">Ruptura</th>
                <th className="text-right  font-semibold px-3 py-2.5">Receita</th>
                <th className="text-right  font-semibold px-3 py-2.5">Margem</th>
                <th className="text-center font-semibold px-3 py-2.5">Recompra</th>
              </tr>
            </thead>
            <tbody>
              {produtosPrevistos.map((p) => {
                const total = unidadesNaSemana(p, semana);
                const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
                const necessario = Math.max(0, total - livre);
                const receita = total * p.precoUnit * (p.taxaRecompra / 100);
                const margem = total * (p.precoUnit - p.custoUnit) * (p.taxaRecompra / 100);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-3 py-3 text-xs font-semibold">{p.nome}</td>
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">{p.categoria}</td>
                    {p.semanas.map((u, i) => (
                      <td
                        key={i}
                        className={`px-3 py-3 text-center text-xs tabular-nums ${semana === i + 1 ? "font-bold text-primary" : ""}`}
                      >
                        {u}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center text-xs font-bold tabular-nums">
                      {total}
                    </td>
                    <td className="px-3 py-3 text-center text-xs tabular-nums">{p.estoqueAtual}</td>
                    <td className="px-3 py-3 text-center text-xs tabular-nums text-muted-foreground">
                      {p.estoqueReservado}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {necessario > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-destructive/15 text-destructive">
                          +{necessario}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">ok</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px]">
                      {p.rupturaSemana ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle className="size-3" /> S{p.rupturaSemana}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-success tabular-nums">
                      {brl2(receita)}
                    </td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums">{brl2(margem)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-success/15 text-success">
                        {p.taxaRecompra}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* GRÁFICO BARRAS POR SEMANA + SUGESTÃO COMPRA */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="card-soft p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> Demanda por semana
            </h3>
            <span className="text-[11px] text-muted-foreground">unidades previstas</span>
          </div>
          <DemandaSemanas produtosPrevistos={produtosPrevistos} />
        </div>

        <div className="card-soft p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" /> Sugestão de compra · fornecedor
            </h3>
          </div>
          <div className="space-y-2">
            {produtosPrevistos
              .map((p) => {
                const total = unidadesNaSemana(p, semana);
                const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
                return { p, faltam: Math.max(0, total - livre) };
              })
              .filter((x) => x.faltam > 0)
              .sort((a, b) => b.faltam - a.faltam)
              .map(({ p, faltam }) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{p.nome}</div>
                    <div className="text-[10px] text-muted-foreground">
                      custo unit {brl2(p.custoUnit)} · total {brl2(faltam * p.custoUnit)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-md bg-primary/15 text-primary">
                    +{faltam}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DemandaSemanas({ produtosPrevistos }: { produtosPrevistos: ProdutoPrevisto[] }) {
  const totals: [number, number, number, number] = [0, 0, 0, 0];
  produtosPrevistos.forEach((p) => p.semanas.forEach((u, i) => (totals[i] += u)));
  const max = Math.max(...totals, 1);
  return (
    <div className="space-y-2">
      {totals.map((u, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_44px] items-center gap-2">
          <div className="text-xs font-medium">Semana {i + 1}</div>
          <div className="h-6 rounded-md bg-secondary/60 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${(u / max) * 100}%` }}
            />
          </div>
          <div className="text-xs font-bold text-right tabular-nums">{u}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── LOGÍSTICA / DEMANDA ─────────────────────────
function PrevisaoLogistica({
  demandaBairros,
  semana,
}: {
  demandaBairros: DemandaBairro[];
  semana: 0 | 1 | 2 | 3 | 4;
}) {
  const bairros = useMemo(() => {
    return demandaBairros
      .map((b) => {
        const entregas = semana === 0 ? b.entregasPrevistas : b.semanas[semana - 1];
        return { ...b, entregas, faturamento: entregas * b.ticketMedio };
      })
      .sort((a, b) => b.entregas - a.entregas);
  }, [demandaBairros, semana]);

  const totalEntregas = bairros.reduce((s, b) => s + b.entregas, 0);
  const totalFat = bairros.reduce((s, b) => s + b.faturamento, 0);
  const ticketMed = totalEntregas ? Math.round(totalFat / totalEntregas) : 0;
  const max = Math.max(...bairros.map((b) => b.entregas), 1);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
        <Truck className="size-4 text-primary" /> Previsão de entregas e demanda por bairro
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Truck className="size-4" />}
          label="Entregas previstas"
          value={String(totalEntregas)}
          sub={semana === 0 ? "4 semanas" : `Semana ${semana}`}
          tone="primary"
        />
        <Kpi
          icon={<MapIcon className="size-4" />}
          label="Bairros ativos"
          value={String(bairros.filter((b) => b.entregas > 0).length)}
          sub="com pedidos previstos"
        />
        <Kpi
          icon={<Target className="size-4" />}
          label="Ticket médio"
          value={brl2(ticketMed)}
          sub="esperado no período"
        />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Faturamento previsto"
          value={brl2(totalFat)}
          sub="entregas × ticket"
          tone="success"
        />
      </div>

      <div className="card-soft p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <MapIcon className="size-4 text-primary" /> Mapa de demanda por bairro
          </h3>
          <span className="text-[11px] text-muted-foreground">entregas previstas</span>
        </div>
        <div className="space-y-2">
          {bairros.map((b) => (
            <div key={b.bairro} className="grid grid-cols-[170px_1fr_60px_90px] items-center gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{b.bairro}</div>
                <div className="text-[10px] text-muted-foreground truncate">{b.cidade}</div>
              </div>
              <div className="h-6 rounded-md bg-secondary/60 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${(b.entregas / max) * 100}%` }}
                />
              </div>
              <div className="text-xs font-bold text-right tabular-nums">{b.entregas}</div>
              <div className="text-[11px] font-semibold text-success text-right tabular-nums">
                {brl2(b.faturamento)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── AUTOMAÇÕES POR CATEGORIA ─────────────────────────
type RegraCategoria = {
  id: string;
  categoria: string;
  emoji: string;
  ativo: boolean;
  cicloBaseDias: number; // padrão sugerido (a IA adapta por cliente)
  diasAntes: number; // antecedência da 1ª mensagem
  qtdMensagens: number; // quantas mensagens enviar
  mensagem: string; // template
  aprendeIA: boolean; // se IA pode sobrescrever ciclo por cliente
  perguntaConfirmacao?: string; // ex: vermífugo
};

const REGRAS_KEY = "recompra_regras_categoria_v1";
const REGRAS_DEFAULT: RegraCategoria[] = [
  {
    id: "areia",
    categoria: "Areia para gato",
    emoji: "🪨",
    ativo: true,
    cicloBaseDias: 25,
    diasAntes: 5,
    qtdMensagens: 2,
    mensagem: "Oi {nome}! 🐱 A areia do {pet} deve estar acabando. Posso já separar?",
    aprendeIA: true,
  },
  {
    id: "tapete",
    categoria: "Tapete higiênico",
    emoji: "🧻",
    ativo: true,
    cicloBaseDias: 20,
    diasAntes: 4,
    qtdMensagens: 2,
    mensagem: "Oi {nome}! Os tapetes do {pet} costumam acabar nessa altura. Quer renovar?",
    aprendeIA: true,
  },
  {
    id: "vermifugo",
    categoria: "Vermífugo",
    emoji: "💊",
    ativo: true,
    cicloBaseDias: 90,
    diasAntes: 7,
    qtdMensagens: 2,
    mensagem: "Oi {nome}! 🐾 A proteção do {pet} contra vermes vai vencer em {dias}d.",
    aprendeIA: false,
    perguntaConfirmacao: "Você conseguiu administrar o vermífugo no {pet}? (sim/não)",
  },
  {
    id: "antipulgas",
    categoria: "Antipulgas",
    emoji: "🛡️",
    ativo: true,
    cicloBaseDias: 30,
    diasAntes: 5,
    qtdMensagens: 1,
    mensagem: "Oi {nome}! Está chegando a próxima dose de antipulgas do {pet}.",
    aprendeIA: false,
  },
  {
    id: "racao",
    categoria: "Ração",
    emoji: "🥣",
    ativo: true,
    cicloBaseDias: 35,
    diasAntes: 6,
    qtdMensagens: 2,
    mensagem: "Oi {nome}! 🐶 A ração do {pet} está perto do fim — quer que eu separe?",
    aprendeIA: true,
  },
  {
    id: "saches",
    categoria: "Sachês",
    emoji: "🥫",
    ativo: true,
    cicloBaseDias: 15,
    diasAntes: 3,
    qtdMensagens: 1,
    mensagem: "Oi {nome}! Os sachês do {pet} acabam logo. Quer reposição?",
    aprendeIA: true,
  },
  {
    id: "petiscos",
    categoria: "Petiscos",
    emoji: "🦴",
    ativo: false,
    cicloBaseDias: 30,
    diasAntes: 4,
    qtdMensagens: 1,
    mensagem: "Oi {nome}! Que tal renovar os petiscos do {pet}?",
    aprendeIA: true,
  },
  {
    id: "suplementos",
    categoria: "Suplementos",
    emoji: "💪",
    ativo: true,
    cicloBaseDias: 30,
    diasAntes: 5,
    qtdMensagens: 1,
    mensagem: "Oi {nome}! O suplemento do {pet} está acabando. Renovar?",
    aprendeIA: false,
  },
  {
    id: "shampoos",
    categoria: "Shampoos",
    emoji: "🧴",
    ativo: false,
    cicloBaseDias: 60,
    diasAntes: 7,
    qtdMensagens: 1,
    mensagem: "Oi {nome}! Já pensou em renovar o shampoo do {pet}?",
    aprendeIA: true,
  },
  {
    id: "medcont",
    categoria: "Medicamentos contínuos",
    emoji: "💉",
    ativo: true,
    cicloBaseDias: 30,
    diasAntes: 7,
    qtdMensagens: 3,
    mensagem: "Oi {nome}! ⚠️ O medicamento contínuo do {pet} acaba em {dias}d. Não pode faltar.",
    aprendeIA: false,
    perguntaConfirmacao: "O {pet} segue tomando o medicamento normalmente?",
  },
];

function loadRegras(): RegraCategoria[] {
  if (typeof window === "undefined") return REGRAS_DEFAULT;
  try {
    const raw = window.localStorage.getItem(REGRAS_KEY);
    if (!raw) return REGRAS_DEFAULT;
    const parsed = JSON.parse(raw) as RegraCategoria[];
    // merge: garantir que novas categorias padrão sempre apareçam
    const ids = new Set(parsed.map((r) => r.id));
    const extra = REGRAS_DEFAULT.filter((r) => !ids.has(r.id));
    return [...parsed, ...extra];
  } catch {
    return REGRAS_DEFAULT;
  }
}

function AutomacoesCategoria({ produtosPrevistos }: { produtosPrevistos: ProdutoPrevisto[] }) {
  const [regras, setRegras] = useState<RegraCategoria[]>(loadRegras);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function update(id: string, patch: Partial<RegraCategoria>) {
    setRegras((arr) => {
      const next = arr.map((r) => (r.id === id ? { ...r, ...patch } : r));
      try {
        window.localStorage.setItem(REGRAS_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }
  function resetar() {
    setRegras(REGRAS_DEFAULT);
    try {
      window.localStorage.removeItem(REGRAS_KEY);
    } catch {
      /* noop */
    }
  }

  // Faturamento recorrente previsto por categoria (de produtosPrevistos)
  const recorrentePorCat = useMemo(() => {
    const map = new Map<string, { receita: number; unidades: number }>();
    produtosPrevistos.forEach((p) => {
      const r = p.unidadesPrevistas * p.precoUnit * (p.taxaRecompra / 100);
      const cur = map.get(p.categoria) || { receita: 0, unidades: 0 };
      cur.receita += r;
      cur.unidades += p.unidadesPrevistas;
      map.set(p.categoria, cur);
    });
    return Array.from(map.entries())
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.receita - a.receita);
  }, [produtosPrevistos]);

  const totalRecorrente = recorrentePorCat.reduce((s, c) => s + c.receita, 0);
  const ativos = regras.filter((r) => r.ativo).length;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Settings2 className="size-4 text-primary" /> Automações por categoria de produto
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {ativos}/{regras.length} ativas · IA adapta ciclo por cliente
          </span>
          <button
            onClick={resetar}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            Restaurar padrão
          </button>
        </div>
      </div>

      {/* Faturamento recorrente previsto */}
      <div className="card-soft p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
              Faturamento recorrente previsto
            </div>
            <div className="text-2xl font-bold text-success mt-0.5">{brl(totalRecorrente)}</div>
            <div className="text-[11px] text-muted-foreground">
              próximas 4 semanas · ponderado por taxa de recompra
            </div>
          </div>
          <BarChart3 className="size-8 text-success/40" />
        </div>
        <div className="space-y-1.5">
          {recorrentePorCat.map((c) => {
            const pct = totalRecorrente > 0 ? (c.receita / totalRecorrente) * 100 : 0;
            return (
              <div key={c.cat} className="grid grid-cols-[100px_1fr_90px] items-center gap-2">
                <div className="text-[11px] font-semibold truncate">{c.cat}</div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-success to-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[11px] font-bold tabular-nums text-right">
                  {brl(c.receita)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Regras editáveis */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {regras.map((r) => {
          const editando = editandoId === r.id;
          return (
            <div
              key={r.id}
              className={`card-soft p-4 space-y-2.5 transition ${r.ativo ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{r.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{r.categoria}</div>
                    <div className="text-[10px] text-muted-foreground">
                      ciclo base {r.cicloBaseDias}d · {r.diasAntes}d antes · {r.qtdMensagens} msg
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => update(r.id, { ativo: !r.ativo })}
                  className={`relative w-10 h-5 rounded-full shrink-0 transition ${r.ativo ? "bg-success" : "bg-border"}`}
                  title={r.ativo ? "Desativar" : "Ativar"}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${r.ativo ? "left-5" : "left-0.5"}`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {r.aprendeIA && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-accent/30 bg-accent/10 text-accent">
                    <Brain className="size-3" /> IA adapta
                  </span>
                )}
                {r.perguntaConfirmacao && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-primary/30 bg-primary/10 text-primary">
                    <MessageCircle className="size-3" /> Confirma uso
                  </span>
                )}
              </div>

              {!editando ? (
                <>
                  <div className="text-[11px] text-muted-foreground bg-secondary/50 rounded-md px-2.5 py-2 line-clamp-2">
                    "{r.mensagem}"
                  </div>
                  <button
                    onClick={() => setEditandoId(r.id)}
                    className="w-full h-8 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70 inline-flex items-center justify-center gap-1.5"
                  >
                    <Settings2 className="size-3.5" /> Editar regra
                  </button>
                </>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-3 gap-2">
                    <NumInline
                      label="Ciclo (d)"
                      value={r.cicloBaseDias}
                      onChange={(v) => update(r.id, { cicloBaseDias: v })}
                    />
                    <NumInline
                      label="D-antes"
                      value={r.diasAntes}
                      onChange={(v) => update(r.id, { diasAntes: v })}
                    />
                    <NumInline
                      label="Nº msg"
                      value={r.qtdMensagens}
                      onChange={(v) => update(r.id, { qtdMensagens: v })}
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={r.mensagem}
                    onChange={(e) => update(r.id, { mensagem: e.target.value })}
                    placeholder="Use {nome} {pet} {dias}"
                    className="w-full text-[11px] px-2.5 py-2 rounded-md bg-secondary outline-none focus:ring-2 ring-primary/30 resize-none"
                  />
                  {r.perguntaConfirmacao !== undefined && (
                    <textarea
                      rows={2}
                      value={r.perguntaConfirmacao}
                      onChange={(e) => update(r.id, { perguntaConfirmacao: e.target.value })}
                      placeholder="Pergunta de confirmação pós-envio"
                      className="w-full text-[11px] px-2.5 py-2 rounded-md bg-primary/5 border border-primary/20 outline-none focus:ring-2 ring-primary/30 resize-none"
                    />
                  )}
                  <label className="flex items-center justify-between rounded-md bg-secondary/60 px-2.5 py-1.5 cursor-pointer">
                    <span className="text-[11px] font-semibold flex items-center gap-1.5">
                      <Brain className="size-3 text-accent" /> IA adapta ciclo por cliente
                    </span>
                    <input
                      type="checkbox"
                      checked={r.aprendeIA}
                      onChange={(e) => update(r.id, { aprendeIA: e.target.checked })}
                      className="size-3.5 accent-accent"
                    />
                  </label>
                  <button
                    onClick={() => setEditandoId(null)}
                    className="w-full h-8 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90"
                  >
                    Salvar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NumInline({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="rounded-md bg-secondary/60 px-2 py-1.5 block">
      <div className="text-[9px] uppercase font-bold tracking-wide text-muted-foreground">
        {label}
      </div>
      <input
        type="number"
        min={0}
        max={365}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full bg-transparent text-xs font-bold tabular-nums outline-none"
      />
    </label>
  );
}
