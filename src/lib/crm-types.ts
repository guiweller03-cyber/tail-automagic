export type FormaPagamento =
  | "Pix"
  | "Cartão débito"
  | "Cartão crédito"
  | "Link de pagamento"
  | "Dinheiro"
  | "Pendente";

export type Pedido = {
  id: string;
  cliente: string;
  telefone?: string;
  pet: string;
  total: number;
  status: "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";
  bairro: string;
  hora: string;
  pagamento: FormaPagamento | string;
  pago: boolean;
  comprovante: boolean;
  taxaMaquina: number;
  notaFiscal: boolean;
  observacao?: string;
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

export type KanbanStage =
  | "Hoje"
  | "Recompra"
  | "Follow-up"
  | "Aguardando pagamento"
  | "Upsell"
  | "Risco";

export type Conversa = {
  id: string;
  cliente: string;
  ultima: string;
  hora: string;
  naoLidas: number;
  tag: "IA" | "Humano" | "Aguardando" | "Humano + IA";
  pet?: string;
  estagio: KanbanStage;
  kanbanColumnId?: string;
  valorPotencial: number;
  resumoFinanceiro?: ResumoFinanceiroConversa;
  filtros: ConversaFiltro[];
};

export type ResumoFinanceiroConversa = {
  totalGasto: number;
  lucroLiquido: number;
  totalDescontos: number;
  ticketMedio: number;
  pedidos: number;
};

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
  petsDetalhes?: PetDetalhe[];
  observacoes: string;
  followUpManual?: {
    mensagem: string;
    data: string;
    hora?: string;
    canal: "WhatsApp" | "Ligacao" | "Presencial" | "Outro";
    status: "pendente" | "feito";
    midiaUrl?: string;
    midiaNome?: string;
    midiaTipo?: string;
    atualizadoEm?: string;
  };
};

export type PetDetalhe = {
  nome: string;
  especie?: "cachorro" | "gato";
  castrado?: boolean;
  raca?: string;
  porte?: "toy" | "pequeno" | "medio" | "grande" | "gigante";
  pesoKg?: number;
  pesoKgMedidoEm?: string;
  idade?: string;
  nascimento?: string;
  dataNascimentoEstimada?: string;
  idadeAdultaConfirmada?: boolean;
  racaSlug?: string;
  observacao?: string;
};

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
  fotoUrl?: string | null;
  fotoPath?: string | null;
  detalhesTecnicos?: ProdutoDetalhesTecnicos;
};

export type ProdutoDetalhesTecnicos = {
  marca?: string;
  linha?: string;
  peso?: string;
  especie?: string;
  idade?: string;
  porte?: string;
  racaEspecifica?: string;
  tipoProduto?: string;
  proteinaBruta?: string;
  gordura?: string;
  fibra?: string;
  umidade?: string;
  materiaMineral?: string;
  calcio?: string;
  fosforo?: string;
  omega3?: string;
  omega6?: string;
  taurina?: string;
  condroitina?: string;
  glicosamina?: string;
  prebioticos?: string;
  yucca?: string;
  miniBits?: string;
  semCorantes?: string;
  semTransgenicos?: string;
  fonteProteinaAnimal?: string;
  principaisIngredientes?: string;
  beneficios?: string;
  indicacao?: string;
};

export type RecompraStatus = "ok" | "semana" | "urgente" | "atrasado";
export type ComportamentoIA = "antecipado" | "pontual" | "atrasado" | "instavel";
export type TendenciaIA = "acelerando" | "estavel" | "desacelerando";

export type RecompraPetCalculo = {
  nome: string;
  especie: "cachorro" | "gato";
  porte?: string;
  raca?: string;
  pesoKg?: number;
  pesoInformado?: boolean;
  pesoOrigem?: "informado" | "medido" | "crescimento" | "raca" | "porte";
  consumoDiaG?: number;
  linha?: "fresh_meat" | "pro_life" | "generica";
  fase?: "filhote" | "adulto" | "senior" | "castrado";
};

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
  sku: string;
  racao: string;
  quantidade: number;
  pesoKg: number;
  consumoDiaKg: number;
  ultimaCompra: string;
  ultimaCompraIso?: string;
  /** Dias corridos desde a data real da venda; nao e a duracao estimada da racao. */
  diasDesdeCompra?: number;
  /** Duracao teorica da racao pelo peso comprado e consumo diario dos pets. */
  cicloRacao?: number;
  /** Media observada entre pedidos anteriores do mesmo cliente, produto e pet. */
  intervaloPedidos?: number | null;
  diasRestantes: number;
  dataPrevista: string;
  dataPrevistaIso?: string;
  valorEstimado: number;
  fonteCalculo?: "tabela" | "estimativa";
  petsCalculo?: RecompraPetCalculo[];
  status: RecompraStatus;
  contatado?: boolean;
  mediaRecompra: number;
  previsaoBase: number;
  comportamento: ComportamentoIA;
  precisaoIA: number;
  tendencia: TendenciaIA;
  historicoDias: number[];
  travado?: boolean;
  /** Ciclo em dias calculado automaticamente, antes de qualquer ajuste manual. */
  cicloCalculado?: number;
  /** Ciclo informado pelo operador; quando existe, `previsaoBase` é igual a ele. */
  cicloManual?: number | null;
  /** De onde veio o ciclo automático (ver RECOMPRA_CALCULO.md). */
  origemCiclo?: OrigemCicloRecompra;
};

export type OrigemCicloRecompra = "historico" | "observacao" | "cadastro_manual" | "consumo";

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

export type ModeloRecompraRacao = {
  sku: string;
  produtoNome: string;
  diasRecompra: number;
  consumoDiarioG?: number;
  ativo: boolean;
  atualizadoEm?: string;
};

export type DemandaBairro = {
  bairro: string;
  cidade: string;
  entregasPrevistas: number;
  ticketMedio: number;
  semanas: [number, number, number, number];
};

export type Entrega = {
  id: string;
  cliente: string;
  endereco: string;
  bairro: string;
  eta: string;
  status: "aguardando" | "em rota" | "concluída";
};

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

export type IaMessage = { role: "user" | "ai"; content: string; suggestions?: string[] };

export type CupomStatus = "gerado" | "enviado" | "usado" | "expirado";
export type CupomTipo = "percentual" | "fixo";
export type Cupom = {
  id: string;
  clienteId: string;
  codigo: string;
  desconto: number;
  tipo: CupomTipo;
  status: CupomStatus;
  criadoEm: string;
  usadoEm?: string;
  expiradoEm?: string;
  motivoEnvio?: string;
};

export type ClienteInativo = {
  id: string;
  nome: string;
  telefone: string;
  bairro: string;
  pets: string[];
  ultimoContato: string;
  diasSemCompra: number;
  followUpFeito: boolean;
  respondeuFollowUp: boolean;
  motivoPerdaProvavel: "preço" | "concorrência" | "momento ruim" | "sem resposta";
  valorPotencial: number;
  ultimaMensagem: string;
  tentativas: number;
};

export type ClientePorBairro = {
  bairro: string;
  cidade: string;
  total: number;
  vip: number;
  ticketMedio: number;
  receitaTotal: number;
  lat: number;
  lng: number;
};
