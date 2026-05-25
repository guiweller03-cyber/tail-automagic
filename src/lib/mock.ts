export const kpis = {
  faturamentoHoje: 0,
  faturamentoSemana: 0,
  faturamentoMes: 0,
  lucroMes: 0,
  ticketMedio: 0,
  pedidosHoje: 0,
  taxaRecompra: 0,
  taxaUpsell: 0,
  clientesVip: 0,
  clientesRisco: 0,
  estoqueCritico: 0,
  leadsHoje: 0,
  leadsSemana: 0,
  conversaoHoje: 0,
  conversaoSemana: 0,
  conversaoMes: 0,
  recompraPrevista: 0,
};

export const funilDados = [
  { etapa: "Leads", valor: 0, cor: "var(--color-chart-4)" },
  { etapa: "Conversas", valor: 0, cor: "var(--color-accent)" },
  { etapa: "Pedidos", valor: 0, cor: "var(--color-primary)" },
  { etapa: "Clientes ativos", valor: 0, cor: "var(--color-success)" },
  { etapa: "Recompra", valor: 0, cor: "var(--color-chart-2)" },
];

export const crescimentoMensal = [
  { mes: "Jan", valor: 0 },
  { mes: "Fev", valor: 0 },
  { mes: "Mar", valor: 0 },
  { mes: "Abr", valor: 0 },
  { mes: "Mai", valor: 0 },
  { mes: "Jun", valor: 0 },
  { mes: "Jul", valor: 0 },
  { mes: "Ago", valor: 0 },
];

export const vendasSemana = [
  { dia: "Seg", vendas: 0, lucro: 0 },
  { dia: "Ter", vendas: 0, lucro: 0 },
  { dia: "Qua", vendas: 0, lucro: 0 },
  { dia: "Qui", vendas: 0, lucro: 0 },
  { dia: "Sex", vendas: 0, lucro: 0 },
  { dia: "Sab", vendas: 0, lucro: 0 },
  { dia: "Dom", vendas: 0, lucro: 0 },
];

export const origemLeads: { name: string; value: number }[] = [];

export type Pedido = {
  id: string;
  cliente: string;
  pet: string;
  total: number;
  status: "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";
  bairro: string;
  hora: string;
};

export const pedidos: Pedido[] = [];

export type Conversa = {
  id: string;
  cliente: string;
  ultima: string;
  hora: string;
  naoLidas: number;
  tag: "IA" | "Humano" | "Aguardando";
  pet?: string;
  estagio: KanbanStage;
  valorPotencial: number;
  filtros: ConversaFiltro[];
};

export type ConversaFiltro =
  | "Novos leads"
  | "Recompra"
  | "Follow-up"
  | "VIP"
  | "Sem resposta"
  | "Em negociação"
  | "Upsell"
  | "Pedido hoje";

export const filtrosConversa: ("Todos" | ConversaFiltro)[] = [
  "Todos",
  "Novos leads",
  "Recompra",
  "Follow-up",
  "VIP",
  "Sem resposta",
  "Em negociação",
  "Upsell",
  "Pedido hoje",
];

export type KanbanStage =
  | "Hoje"
  | "Recompra"
  | "Follow-up"
  | "Aguardando pagamento"
  | "Upsell"
  | "Risco";

export const kanbanStages: KanbanStage[] = [
  "Hoje",
  "Recompra",
  "Follow-up",
  "Aguardando pagamento",
  "Upsell",
  "Risco",
];

export const conversas: Conversa[] = [];

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  pets: string[];
  ticket: number;
  frequencia: string;
  ultima: string;
  perfil: "VIP" | "Premium" | "Econômico" | "Novo" | "Risco";
  origem: string;
  origemDetalhe?: string;
  campanha?: string;
  campanhaCusto?: number;
  campanhaConvertidos?: number;
  cupom?: string;
  influenciador?: string;
  cac: number;
  totalGasto: number;
  totalDescontos: number;
  lucroLiquido: number;
  pedidos: number;
  proxRecompra: string;
  cidade?: string;
  especies?: ("cachorro" | "gato")[];
};

export const clientes: Cliente[] = [];

export type RecompraStatus = "ok" | "semana" | "urgente" | "atrasado";
export type ComportamentoIA = "antecipado" | "pontual" | "atrasado" | "instavel";
export type TendenciaIA = "acelerando" | "estavel" | "desacelerando";

export type RecompraPrevista = {
  id: string;
  clienteId: string;
  cliente: string;
  telefone: string;
  cidade: string;
  bairro: string;
  pet: string;
  especie: "cachorro" | "gato";
  perfil: Cliente["perfil"];
  racao: string;
  pesoKg: number;
  consumoDiaKg: number;
  ultimaCompra: string;
  diasRestantes: number;
  dataPrevista: string;
  valorEstimado: number;
  status: RecompraStatus;
  contatado?: boolean;
  mediaRecompra: number;
  previsaoBase: number;
  comportamento: ComportamentoIA;
  precisaoIA: number;
  tendencia: TendenciaIA;
  historicoDias: number[];
  travado?: boolean;
};

export const recomprasPrevistas: RecompraPrevista[] = [];

export const iaRecompraAlertas: { tipo: string; cliente: string; msg: string }[] = [];

export type Produto = {
  sku: string;
  nome: string;
  categoria: string;
  estoque: number;
  minimo: number;
  giro: "alto" | "médio" | "baixo";
  preco: number;
  precoCompra: number;
  tipo: "próprio" | "consignado";
  fornecedor?: string;
  imagem?: string;
};

export const produtos: Produto[] = [
  {
    sku: "ND-TROP-GAT-15",
    nome: "N&D Tropical Para Gatos Adultos Frango 1,5kg",
    categoria: "Rações",
    estoque: 12,
    minimo: 5,
    giro: "alto",
    preco: 124.9,
    precoCompra: 85.0,
    tipo: "próprio",
    fornecedor: "Farmina",
    imagem: "/img/nd_tropical_cat.png",
  },
  {
    sku: "FN-LIFE-CAE-15",
    nome: "Fórmula Natural Life Cães Filhotes Peq. Porte Frango 15Kg",
    categoria: "Rações",
    estoque: 8,
    minimo: 3,
    giro: "médio",
    preco: 264.9,
    precoCompra: 180.0,
    tipo: "próprio",
    fornecedor: "Adimax",
    imagem: "/img/formula_natural_puppy.png",
  },
  {
    sku: "GOLD-GAT-CAST-1",
    nome: "Golden Premium Especial Gatos Castrados Frango 1 kg",
    categoria: "Rações",
    estoque: 20,
    minimo: 10,
    giro: "alto",
    preco: 38.9,
    precoCompra: 22.0,
    tipo: "próprio",
    fornecedor: "Premier Pet",
    imagem: "/img/golden_cat_neutered.png",
  },
  {
    sku: "FN-PRO-SEN-15",
    nome: "Ração Fórmula Natural Pró Cães Sênior Grd/Med 15kg",
    categoria: "Rações",
    estoque: 15,
    minimo: 5,
    giro: "médio",
    preco: 229.9,
    precoCompra: 160.0,
    tipo: "próprio",
    fornecedor: "Adimax",
    imagem: "/img/formula_natural_senior.png",
  },
  {
    sku: "SIMP-80-20-40",
    nome: "Antipulgas Simparic 80mg 20,1 A 40kg (1 Comp)",
    categoria: "Medicamentos e Saúde",
    estoque: 25,
    minimo: 10,
    giro: "alto",
    preco: 89.9,
    precoCompra: 55.0,
    tipo: "próprio",
    fornecedor: "Zoetis",
    imagem: "/img/simparic_flea_medicine.png",
  },
  {
    sku: "CASA-PLAST-N1",
    nome: "Casa Pet Plástica N1 Pequena Protege UV Azul",
    categoria: "Acessórios",
    estoque: 4,
    minimo: 2,
    giro: "baixo",
    preco: 89.9,
    precoCompra: 45.0,
    tipo: "consignado",
    fornecedor: "Mundo Pet",
    imagem: "/img/blue_dog_house.png",
  },
];

export type Entrega = {
  id: string;
  cliente: string;
  endereco: string;
  bairro: string;
  eta: string;
  status: "aguardando" | "em rota" | "concluída";
};

export const entregas: Entrega[] = [];

export type ProdutoProcurado = {
  id: string;
  nome: string;
  cliente: string;
  telefone: string;
  data: string;
  hora: string;
  vezes: number;
  categoria: string;
  obs?: string;
  status: "pendente" | "comprado fornecedor" | "adicionado estoque";
  ticketMedio: number;
};

export const produtosProcurados: ProdutoProcurado[] = [];

export type GrupoCampanha = {
  id: string;
  dia: string;
  produto: string;
  preco: number;
  precoOriginal: number;
  validade: string;
  status: "agendado" | "enviado" | "rascunho";
  alcance?: number;
};

export const gruposCampanhas: GrupoCampanha[] = [];

export type IaMessage = { role: "user" | "ai"; content: string; suggestions?: string[] };

export const iaInicial: IaMessage[] = [];

export const iaAlertas: {
  tipo: string;
  desc: string;
  tone: "destructive" | "warning" | "success";
}[] = [];

export type ProdutoPrevisto = {
  id: string;
  nome: string;
  categoria: string;
  unidadesPrevistas: number;
  semanas: [number, number, number, number];
  taxaRecompra: number;
  precoUnit: number;
  custoUnit: number;
  estoqueAtual: number;
  estoqueReservado: number;
  diasParaRuptura: number;
  rupturaSemana?: 1 | 2 | 3 | 4;
};

export const produtosPrevistos: ProdutoPrevisto[] = [];

export type DemandaBairro = {
  bairro: string;
  cidade: string;
  entregasPrevistas: number;
  ticketMedio: number;
  semanas: [number, number, number, number];
};

export const demandaBairros: DemandaBairro[] = [];
