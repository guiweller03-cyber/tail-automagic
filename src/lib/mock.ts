// Mock data for Mundo Pet CRM (frontend-only demo)
export const kpis = {
  faturamentoHoje: 4870.5,
  faturamentoSemana: 31420,
  faturamentoMes: 87420,
  lucroMes: 24180,
  ticketMedio: 142.3,
  pedidosHoje: 34,
  taxaRecompra: 68,
  taxaUpsell: 23,
  clientesVip: 142,
  clientesRisco: 18,
  estoqueCritico: 7,
  leadsHoje: 22,
  leadsSemana: 168,
  conversaoHoje: 31,
  conversaoSemana: 28,
  conversaoMes: 26,
  recompraPrevista: 14,
};

export const funilDados = [
  { etapa: "Leads", valor: 168, cor: "var(--color-chart-4)" },
  { etapa: "Conversas", valor: 124, cor: "var(--color-accent)" },
  { etapa: "Pedidos", valor: 86, cor: "var(--color-primary)" },
  { etapa: "Clientes ativos", valor: 72, cor: "var(--color-success)" },
  { etapa: "Recompra", valor: 49, cor: "var(--color-chart-2)" },
];

export const crescimentoMensal = [
  { mes: "Jan", valor: 52000 }, { mes: "Fev", valor: 58400 },
  { mes: "Mar", valor: 61200 }, { mes: "Abr", valor: 67800 },
  { mes: "Mai", valor: 74300 }, { mes: "Jun", valor: 79100 },
  { mes: "Jul", valor: 82900 }, { mes: "Ago", valor: 87420 },
];


export const vendasSemana = [
  { dia: "Seg", vendas: 3200, lucro: 980 },
  { dia: "Ter", vendas: 4100, lucro: 1240 },
  { dia: "Qua", vendas: 3850, lucro: 1100 },
  { dia: "Qui", vendas: 4870, lucro: 1480 },
  { dia: "Sex", vendas: 5620, lucro: 1720 },
  { dia: "Sáb", vendas: 6890, lucro: 2100 },
  { dia: "Dom", vendas: 2900, lucro: 880 },
];

export const origemLeads = [
  { name: "Instagram", value: 38 },
  { name: "Indicação", value: 27 },
  { name: "Orgânico", value: 18 },
  { name: "Influenciador", value: 12 },
  { name: "Google", value: 5 },
];

export type FormaPagamento = "Pix" | "Cartão débito" | "Cartão crédito" | "Dinheiro" | "Pendente";

export type Pedido = {
  id: string;
  cliente: string;
  pet: string;
  total: number;
  status: "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";
  bairro: string;
  hora: string;
  pagamento: FormaPagamento;
  pago: boolean;
  comprovante: boolean;
  taxaMaquina: number;
  notaFiscal: boolean;
};

export const pedidos: Pedido[] = [
  { id: "#10238", cliente: "Marina Costa", pet: "Thor (Golden)", total: 189.9, status: "em rota", bairro: "Vila Mariana", hora: "14:20", pagamento: "Pix", pago: true, comprovante: true, taxaMaquina: 0, notaFiscal: false },
  { id: "#10237", cliente: "Pedro Alves", pet: "Mel (SRD)", total: 87.5, status: "separando", bairro: "Moema", hora: "14:05", pagamento: "Dinheiro", pago: false, comprovante: false, taxaMaquina: 0, notaFiscal: false },
  { id: "#10236", cliente: "Júlia Ramos", pet: "Bento (Shih-tzu)", total: 264.0, status: "pago", bairro: "Pinheiros", hora: "13:48", pagamento: "Cartão crédito", pago: true, comprovante: false, taxaMaquina: 2.5, notaFiscal: true },
  { id: "#10235", cliente: "Carlos Mendes", pet: "Luna (Maine Coon)", total: 142.3, status: "entregue", bairro: "Itaim", hora: "13:12", pagamento: "Pix", pago: true, comprovante: true, taxaMaquina: 0, notaFiscal: false },
  { id: "#10234", cliente: "Ana Beatriz", pet: "Nina (Poodle)", total: 320.0, status: "novo", bairro: "Vila Olímpia", hora: "12:55", pagamento: "Cartão débito", pago: false, comprovante: false, taxaMaquina: 1.5, notaFiscal: false },
  { id: "#10233", cliente: "Roberto Lima", pet: "Zeus (Rottweiler)", total: 540.7, status: "em rota", bairro: "Brooklin", hora: "12:30", pagamento: "Pix", pago: true, comprovante: true, taxaMaquina: 0, notaFiscal: true },
  { id: "#10232", cliente: "Fernanda Sá", pet: "Mia (Persa)", total: 95.0, status: "entregue", bairro: "Moema", hora: "11:50", pagamento: "Pix", pago: true, comprovante: true, taxaMaquina: 0, notaFiscal: false },
];

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

export type KanbanStage = "Hoje" | "Recompra" | "Follow-up" | "Aguardando pagamento" | "Upsell" | "Risco";

export const kanbanStages: KanbanStage[] = ["Hoje", "Recompra", "Follow-up", "Aguardando pagamento", "Upsell", "Risco"];

export const conversas: Conversa[] = [
  { id: "1", cliente: "Marina Costa", pet: "Thor", ultima: "Pode mandar o Pix? 🙏", hora: "14:32", naoLidas: 2, tag: "IA", estagio: "Aguardando pagamento", valorPotencial: 210, filtros: ["VIP", "Em negociação", "Pedido hoje"] },
  { id: "2", cliente: "Pedro Alves", pet: "Mel", ultima: "Beleza, pode confirmar!", hora: "14:18", naoLidas: 0, tag: "IA", estagio: "Hoje", valorPotencial: 95, filtros: ["Pedido hoje"] },
  { id: "3", cliente: "Júlia Ramos", pet: "Bento", ultima: "Vocês têm shampoo hipoalergênico?", hora: "13:50", naoLidas: 1, tag: "Aguardando", estagio: "Upsell", valorPotencial: 280, filtros: ["Upsell", "Em negociação"] },
  { id: "4", cliente: "Carlos Mendes", pet: "Luna", ultima: "Recebi, obrigado! ❤️", hora: "13:14", naoLidas: 0, tag: "Humano", estagio: "Follow-up", valorPotencial: 142, filtros: ["Follow-up", "VIP"] },
  { id: "5", cliente: "Ana Beatriz", pet: "Nina", ultima: "A ração da Nina tá acabando 😅", hora: "12:58", naoLidas: 3, tag: "IA", estagio: "Recompra", valorPotencial: 320, filtros: ["Recompra", "VIP"] },
  { id: "6", cliente: "Roberto Lima", pet: "Zeus", ultima: "Quanto sai o saco de 15kg?", hora: "12:30", naoLidas: 0, tag: "IA", estagio: "Hoje", valorPotencial: 540, filtros: ["Novos leads", "Em negociação", "VIP"] },
  { id: "7", cliente: "Helena Souza", pet: "Pretinha", ultima: "—", hora: "ontem", naoLidas: 0, tag: "Humano", estagio: "Risco", valorPotencial: 78, filtros: ["Sem resposta"] },
];

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

export const clientes: Cliente[] = [
  { id: "1", nome: "Marina Costa", telefone: "(11) 99812-3344", endereco: "R. Vergueiro, 1240", bairro: "Vila Mariana", cidade: "São Paulo", especies: ["cachorro"], pets: ["Thor"], ticket: 210, frequencia: "Mensal", ultima: "há 3 dias", perfil: "VIP", origem: "Influenciadora Gabi Pets", origemDetalhe: "Story patrocinado · 12/03", campanha: "Influencer @gabipets", campanhaCusto: 300, campanhaConvertidos: 15, cupom: "GABI10", influenciador: "@gabipets", cac: 20, totalGasto: 2940, totalDescontos: 180, lucroLiquido: 1180, pedidos: 14, proxRecompra: "em 4 dias" },
  { id: "2", nome: "Pedro Alves", telefone: "(11) 99423-7788", endereco: "R. Tuim, 220", bairro: "Moema", cidade: "São Paulo", especies: ["cachorro"], pets: ["Mel"], ticket: 95, frequencia: "Bimestral", ultima: "há 12 dias", perfil: "Econômico", origem: "Meta Ads", origemDetalhe: "Campanha Black Pet · Nov", campanha: "Black Pet Nov", campanhaCusto: 880, campanhaConvertidos: 40, cac: 22, totalGasto: 760, totalDescontos: 40, lucroLiquido: 210, pedidos: 8, proxRecompra: "em 18 dias" },
  { id: "3", nome: "Júlia Ramos", telefone: "(11) 98011-2231", endereco: "R. dos Pinheiros, 412", bairro: "Pinheiros", cidade: "São Paulo", especies: ["cachorro", "gato"], pets: ["Bento", "Lola"], ticket: 280, frequencia: "Mensal", ultima: "há 1 dia", perfil: "Premium", origem: "Instagram Orgânico", origemDetalhe: "Reels viral · 02/04", cac: 0, totalGasto: 4480, totalDescontos: 220, lucroLiquido: 1620, pedidos: 16, proxRecompra: "em 22 dias" },
  { id: "4", nome: "Carlos Mendes", telefone: "(11) 97812-5599", endereco: "R. Iguatemi, 88", bairro: "Itaim", cidade: "São Paulo", especies: ["gato"], pets: ["Luna"], ticket: 142, frequencia: "Mensal", ultima: "há 5 dias", perfil: "VIP", origem: "Indicação", origemDetalhe: "Indicado por João Silva", cac: 0, totalGasto: 1988, totalDescontos: 60, lucroLiquido: 720, pedidos: 14, proxRecompra: "em 12 dias" },
  { id: "5", nome: "Ana Beatriz", telefone: "(11) 99988-1144", endereco: "R. Funchal, 200", bairro: "Vila Olímpia", cidade: "São Paulo", especies: ["cachorro"], pets: ["Nina"], ticket: 320, frequencia: "Mensal", ultima: "há 2 dias", perfil: "Premium", origem: "TikTok", origemDetalhe: "Reels orgânico · #petlovers", campanha: "Reels orgânico", campanhaCusto: 0, campanhaConvertidos: 24, cac: 0, totalGasto: 5120, totalDescontos: 320, lucroLiquido: 1980, pedidos: 16, proxRecompra: "em 9 dias" },
  { id: "6", nome: "Roberto Lima", telefone: "(11) 98234-6677", endereco: "Av. Berrini, 880", bairro: "Brooklin", cidade: "São Paulo", especies: ["cachorro"], pets: ["Zeus"], ticket: 540, frequencia: "Mensal", ultima: "há 1 dia", perfil: "VIP", origem: "Google Ads", origemDetalhe: "Search · ração premium", campanha: "Search ração premium", campanhaCusto: 1520, campanhaConvertidos: 40, cac: 38, totalGasto: 7560, totalDescontos: 410, lucroLiquido: 2980, pedidos: 14, proxRecompra: "em 7 dias" },
  { id: "7", nome: "Helena Souza", telefone: "(11) 97001-2233", endereco: "R. das Rosas, 14", bairro: "Saúde", cidade: "São Paulo", especies: ["gato"], pets: ["Pretinha"], ticket: 78, frequencia: "—", ultima: "há 62 dias", perfil: "Risco", origem: "WhatsApp direto", cac: 0, totalGasto: 234, totalDescontos: 0, lucroLiquido: 38, pedidos: 3, proxRecompra: "atrasada" },
];

// ── Recompra Prevista ──
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
  ultimaCompra: string; // dd/mm
  diasRestantes: number; // negativo = atrasado
  dataPrevista: string; // dd/mm
  valorEstimado: number;
  status: RecompraStatus;
  contatado?: boolean;
  // ── IA adaptativa ──
  mediaRecompra: number;        // dias médios reais do cliente
  previsaoBase: number;         // o que o cálculo geral previa
  comportamento: ComportamentoIA;
  precisaoIA: number;           // 0-100
  tendencia: TendenciaIA;
  historicoDias: number[];      // dias entre compras (mais antigo → mais recente)
  travado?: boolean;            // previsão fixada manualmente
};

export const recomprasPrevistas: RecompraPrevista[] = [
  { id: "r1", clienteId: "1", cliente: "Marina Costa", telefone: "(11) 99812-3344", cidade: "São Paulo", bairro: "Vila Mariana", pet: "Thor", especie: "cachorro", perfil: "VIP", racao: "Golden Adultos 15kg", pesoKg: 15, consumoDiaKg: 0.5, ultimaCompra: "16/04", diasRestantes: 0, dataPrevista: "16/05", valorEstimado: 289.9, status: "urgente",
    mediaRecompra: 27, previsaoBase: 30, comportamento: "antecipado", precisaoIA: 92, tendencia: "acelerando", historicoDias: [31, 30, 29, 28, 27, 27] },
  { id: "r2", clienteId: "5", cliente: "Ana Beatriz", telefone: "(11) 99988-1144", cidade: "São Paulo", bairro: "Vila Olímpia", pet: "Nina", especie: "cachorro", perfil: "Premium", racao: "Premier Gourmet 10,1kg", pesoKg: 10.1, consumoDiaKg: 0.35, ultimaCompra: "20/04", diasRestantes: 2, dataPrevista: "18/05", valorEstimado: 318, status: "urgente",
    mediaRecompra: 28, previsaoBase: 29, comportamento: "pontual", precisaoIA: 88, tendencia: "estavel", historicoDias: [29, 28, 28, 29, 28] },
  { id: "r3", clienteId: "6", cliente: "Roberto Lima", telefone: "(11) 98234-6677", cidade: "São Paulo", bairro: "Brooklin", pet: "Zeus", especie: "cachorro", perfil: "VIP", racao: "Golden Raças Grandes 20kg", pesoKg: 20, consumoDiaKg: 0.7, ultimaCompra: "23/04", diasRestantes: 4, dataPrevista: "20/05", valorEstimado: 419, status: "semana",
    mediaRecompra: 26, previsaoBase: 28, comportamento: "antecipado", precisaoIA: 94, tendencia: "acelerando", historicoDias: [30, 29, 27, 26, 25] },
  { id: "r4", clienteId: "4", cliente: "Carlos Mendes", telefone: "(11) 97812-5599", cidade: "São Paulo", bairro: "Itaim", pet: "Luna", especie: "gato", perfil: "VIP", racao: "Hills Felino 3kg + Areia 12kg", pesoKg: 3, consumoDiaKg: 0.06, ultimaCompra: "27/04", diasRestantes: 6, dataPrevista: "22/05", valorEstimado: 248, status: "semana",
    mediaRecompra: 30, previsaoBase: 30, comportamento: "pontual", precisaoIA: 96, tendencia: "estavel", historicoDias: [30, 30, 30, 30, 30, 30] },
  { id: "r5", clienteId: "2", cliente: "Pedro Alves", telefone: "(11) 99423-7788", cidade: "São Paulo", bairro: "Moema", pet: "Mel", especie: "cachorro", perfil: "Econômico", racao: "Premier Filhotes 3kg", pesoKg: 3, consumoDiaKg: 0.12, ultimaCompra: "02/05", diasRestantes: 11, dataPrevista: "27/05", valorEstimado: 142, status: "ok",
    mediaRecompra: 25, previsaoBase: 25, comportamento: "instavel", precisaoIA: 61, tendencia: "estavel", historicoDias: [22, 28, 21, 31, 23] },
  { id: "r6", clienteId: "3", cliente: "Júlia Ramos", telefone: "(11) 98011-2231", cidade: "São Paulo", bairro: "Pinheiros", pet: "Bento", especie: "cachorro", perfil: "Premium", racao: "Golden Mini 10,1kg", pesoKg: 10.1, consumoDiaKg: 0.18, ultimaCompra: "10/04", diasRestantes: 18, dataPrevista: "03/06", valorEstimado: 264, status: "ok",
    mediaRecompra: 54, previsaoBase: 56, comportamento: "pontual", precisaoIA: 89, tendencia: "estavel", historicoDias: [55, 54, 56, 53, 54] },
  { id: "r7", clienteId: "7", cliente: "Helena Souza", telefone: "(11) 97001-2233", cidade: "São Paulo", bairro: "Saúde", pet: "Pretinha", especie: "gato", perfil: "Risco", racao: "Whiskas Adulto 3kg", pesoKg: 3, consumoDiaKg: 0.06, ultimaCompra: "13/03", diasRestantes: -8, dataPrevista: "07/05", valorEstimado: 78, status: "atrasado",
    mediaRecompra: 48, previsaoBase: 40, comportamento: "atrasado", precisaoIA: 54, tendencia: "desacelerando", historicoDias: [40, 44, 47, 52, 60] },
  { id: "r8", clienteId: "3", cliente: "Júlia Ramos", telefone: "(11) 98011-2231", cidade: "São Paulo", bairro: "Pinheiros", pet: "Lola", especie: "gato", perfil: "Premium", racao: "Royal Canin Felino 1,5kg", pesoKg: 1.5, consumoDiaKg: 0.05, ultimaCompra: "21/04", diasRestantes: 1, dataPrevista: "17/05", valorEstimado: 168, status: "urgente",
    mediaRecompra: 26, previsaoBase: 30, comportamento: "antecipado", precisaoIA: 90, tendencia: "acelerando", historicoDias: [30, 29, 28, 26, 25], travado: false },
  { id: "r9", clienteId: "1", cliente: "Marina Costa", telefone: "(11) 99812-3344", cidade: "São Paulo", bairro: "Vila Mariana", pet: "Thor", especie: "cachorro", perfil: "VIP", racao: "Petisco Natural 90g · combo", pesoKg: 0.27, consumoDiaKg: 0.01, ultimaCompra: "30/04", diasRestantes: -2, dataPrevista: "14/05", valorEstimado: 56, status: "atrasado",
    mediaRecompra: 14, previsaoBase: 16, comportamento: "atrasado", precisaoIA: 72, tendencia: "desacelerando", historicoDias: [14, 14, 15, 17, 18] },
];

export const iaRecompraAlertas = [
  { tipo: "antecipou",    cliente: "Marina Costa",  msg: "começou a recomprar 3 dias mais cedo · ajuste automático aplicado" },
  { tipo: "antecipou",    cliente: "Roberto Lima",  msg: "consumo do Zeus aumentando · ciclo caiu de 30 → 26 dias" },
  { tipo: "atrasou",      cliente: "Helena Souza",  msg: "atrasando recompra há 2 ciclos · risco de churn" },
  { tipo: "instavel",     cliente: "Pedro Alves",   msg: "comportamento irregular · IA com 61% de precisão" },
  { tipo: "previsivel",   cliente: "Carlos Mendes", msg: "padrão extremamente estável · 96% de precisão" },
];


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
};

export const produtos: Produto[] = [
  { sku: "RAC-GOL-15", nome: "Ração Golden Adultos 15kg", categoria: "Ração", estoque: 4, minimo: 8, giro: "alto", preco: 289.9, precoCompra: 198, tipo: "próprio" },
  { sku: "RAC-PRE-3", nome: "Ração Premier Filhotes 3kg", categoria: "Ração", estoque: 22, minimo: 6, giro: "alto", preco: 142.0, precoCompra: 92, tipo: "próprio" },
  { sku: "ARE-PIN-12", nome: "Areia Pipicat 12kg", categoria: "Higiene", estoque: 3, minimo: 10, giro: "alto", preco: 39.9, precoCompra: 24, tipo: "próprio" },
  { sku: "BRI-COR-M", nome: "Brinquedo Corda Média", categoria: "Brinquedos", estoque: 18, minimo: 5, giro: "médio", preco: 24.5, precoCompra: 11, tipo: "consignado", fornecedor: "PetToys SP" },
  { sku: "SHA-HIP-500", nome: "Shampoo Hipoalergênico 500ml", categoria: "Higiene", estoque: 1, minimo: 4, giro: "médio", preco: 58.0, precoCompra: 34, tipo: "próprio" },
  { sku: "PET-NAT-90", nome: "Petisco Natural 90g", categoria: "Petiscos", estoque: 47, minimo: 12, giro: "alto", preco: 18.9, precoCompra: 8.4, tipo: "consignado", fornecedor: "Natural Pet" },
  { sku: "ANT-FRO-G", nome: "Antipulga Frontline G", categoria: "Saúde", estoque: 12, minimo: 6, giro: "médio", preco: 119.0, precoCompra: 78, tipo: "próprio" },
  { sku: "CAM-SOF-M", nome: "Caminha Soft Média", categoria: "Acessórios", estoque: 6, minimo: 3, giro: "baixo", preco: 189.0, precoCompra: 95, tipo: "consignado", fornecedor: "PetHome" },
];

export type Entrega = {
  id: string;
  cliente: string;
  endereco: string;
  bairro: string;
  eta: string;
  status: "aguardando" | "em rota" | "concluída";
};

export const entregas: Entrega[] = [
  { id: "#10238", cliente: "Marina Costa", endereco: "R. Vergueiro, 1240", bairro: "Vila Mariana", eta: "15 min", status: "em rota" },
  { id: "#10233", cliente: "Roberto Lima", endereco: "Av. Berrini, 880", bairro: "Brooklin", eta: "28 min", status: "em rota" },
  { id: "#10236", cliente: "Júlia Ramos", endereco: "R. dos Pinheiros, 412", bairro: "Pinheiros", eta: "44 min", status: "aguardando" },
  { id: "#10234", cliente: "Ana Beatriz", endereco: "R. Funchal, 200", bairro: "Vila Olímpia", eta: "1h 02min", status: "aguardando" },
];

export const automacoes = [
  { nome: "Recompra automática de ração", desc: "Dispara 3 dias antes do fim previsto", ativo: true, execHoje: 12 },
  { nome: "Aniversário do pet 🎂", desc: "Cupom 15% no mês do aniversário", ativo: true, execHoje: 4 },
  { nome: "Follow-up pós-venda", desc: "24h após entrega — pesquisa de satisfação", ativo: true, execHoje: 18 },
  { nome: "Cliente inativo (60+ dias)", desc: "Mensagem de reativação com brinde", ativo: true, execHoje: 6 },
  { nome: "Upsell inteligente", desc: "Sugere petisco / brinquedo no checkout", ativo: false, execHoje: 0 },
  { nome: "Relatório IA diário 22h", desc: "Resumo completo no WhatsApp do dono", ativo: true, execHoje: 1 },
];

// ── Produtos Procurados (não encontrados em estoque) ──
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

export const produtosProcurados: ProdutoProcurado[] = [
  { id: "p1", nome: "Ração Royal Canin Renal 7,5kg", cliente: "Marina Costa", telefone: "(11) 99812-3344", data: "13/05", hora: "14:20", vezes: 8, categoria: "Ração medicamentosa", obs: "Cliente VIP — pediu 3x esta semana", status: "comprado fornecedor", ticketMedio: 320 },
  { id: "p2", nome: "Areia Sílica Cristal 7,2kg", cliente: "Júlia Ramos", telefone: "(11) 98011-2231", data: "13/05", hora: "13:42", vezes: 12, categoria: "Higiene", status: "pendente", ticketMedio: 89 },
  { id: "p3", nome: "Coleira antipulga Seresto Grande", cliente: "Roberto Lima", telefone: "(11) 98234-6677", data: "12/05", hora: "10:18", vezes: 6, categoria: "Saúde", status: "pendente", ticketMedio: 240 },
  { id: "p4", nome: "Snack Dental Pedigree Dentastix", cliente: "Pedro Alves", telefone: "(11) 99423-7788", data: "12/05", hora: "09:05", vezes: 4, categoria: "Petiscos", status: "adicionado estoque", ticketMedio: 28 },
  { id: "p5", nome: "Caixa de transporte nº 4", cliente: "Ana Beatriz", telefone: "(11) 99988-1144", data: "11/05", hora: "16:30", vezes: 3, categoria: "Acessórios", obs: "Para viagem em junho", status: "pendente", ticketMedio: 220 },
  { id: "p6", nome: "Ração Hills Felino c/d 1,5kg", cliente: "Carlos Mendes", telefone: "(11) 97812-5599", data: "11/05", hora: "11:12", vezes: 5, categoria: "Ração medicamentosa", status: "pendente", ticketMedio: 195 },
];

// ── Grupos / Campanhas WhatsApp ──
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

export const gruposCampanhas: GrupoCampanha[] = [
  { id: "g1", dia: "Segunda", produto: "Ração Premium Golden 15kg", preco: 259.9, precoOriginal: 289.9, validade: "13/05", status: "enviado", alcance: 412 },
  { id: "g2", dia: "Terça", produto: "Petisco Natural 90g · 3 por R$ 49", preco: 49, precoOriginal: 56.7, validade: "14/05", status: "agendado" },
  { id: "g3", dia: "Quarta", produto: "Combo Banho + Tosa + Petisco", preco: 89, precoOriginal: 120, validade: "15/05", status: "agendado" },
  { id: "g4", dia: "Quinta", produto: "Antipulga Frontline G", preco: 99, precoOriginal: 119, validade: "16/05", status: "rascunho" },
  { id: "g5", dia: "Sexta", produto: "Promo relâmpago — Areia 12kg R$ 29", preco: 29, precoOriginal: 39.9, validade: "17/05", status: "rascunho" },
];

// ── Assistente IA — mensagens iniciais ──
export type IaMessage = { role: "user" | "ai"; content: string; suggestions?: string[] };

export const iaInicial: IaMessage[] = [
  { role: "ai", content: "Bom dia! 👋 Aqui está o seu resumo operacional:\n\n• **R$ 4.870** vendidos hoje (34 pedidos)\n• **7 produtos** abaixo do estoque mínimo\n• **3 clientes VIP** sem comprar há +20 dias\n• Campanha *Black Pet* com ROI **3.4x** 🚀", suggestions: ["Quais clientes estão em risco?", "Crie campanha para ração premium", "Quanto lucramos essa semana?"] },
];

export const iaAlertas = [
  { tipo: "Estoque crítico", desc: "Shampoo Hipoalergênico — 1 unidade", tone: "destructive" as const },
  { tipo: "Cliente VIP sumindo", desc: "Carlos Mendes (Luna) — sem compra há 5 dias", tone: "warning" as const },
  { tipo: "Recompra subindo +18%", desc: "Categoria Ração Premium", tone: "success" as const },
  { tipo: "Entrega atrasada", desc: "Pedido #10233 · ETA estourou em 12 min", tone: "destructive" as const },
];

// ── Produtos previstos para recompra ──
export type ProdutoPrevisto = {
  id: string;
  nome: string;
  categoria: string;
  unidadesPrevistas: number;        // total 4 semanas
  semanas: [number, number, number, number]; // S1..S4
  taxaRecompra: number;             // 0-100
  precoUnit: number;
  custoUnit: number;
  estoqueAtual: number;
  estoqueReservado: number;
  diasParaRuptura: number;
  rupturaSemana?: 1 | 2 | 3 | 4;    // semana em que pode faltar
};

export const produtosPrevistos: ProdutoPrevisto[] = [
  { id: "pp1", nome: "Golden Mini Bits 15kg",       categoria: "Ração",    semanas: [14, 9, 11, 6],  unidadesPrevistas: 40, taxaRecompra: 84, precoUnit: 189,  custoUnit: 128, estoqueAtual: 12, estoqueReservado: 4, diasParaRuptura: 5,  rupturaSemana: 2 },
  { id: "pp2", nome: "Special Dog Gold 15kg",       categoria: "Ração",    semanas: [4, 3, 2, 2],    unidadesPrevistas: 11, taxaRecompra: 71, precoUnit: 185,  custoUnit: 122, estoqueAtual: 14, estoqueReservado: 2, diasParaRuptura: 12 },
  { id: "pp3", nome: "FN Fresh Meat 7kg",           categoria: "Ração",    semanas: [3, 2, 1, 1],    unidadesPrevistas: 7,  taxaRecompra: 92, precoUnit: 259,  custoUnit: 178, estoqueAtual: 3,  estoqueReservado: 1, diasParaRuptura: 3,  rupturaSemana: 1 },
  { id: "pp4", nome: "Royal Canin Felino 1,5kg",    categoria: "Ração",    semanas: [3, 2, 2, 2],    unidadesPrevistas: 9,  taxaRecompra: 88, precoUnit: 168,  custoUnit: 112, estoqueAtual: 6,  estoqueReservado: 1, diasParaRuptura: 7,  rupturaSemana: 3 },
  { id: "pp5", nome: "Areia Pipicat 12kg",          categoria: "Higiene",  semanas: [9, 5, 4, 4],    unidadesPrevistas: 22, taxaRecompra: 79, precoUnit: 39.9, custoUnit: 24,  estoqueAtual: 3,  estoqueReservado: 0, diasParaRuptura: 2,  rupturaSemana: 1 },
  { id: "pp6", nome: "Petisco Natural 90g · combo", categoria: "Petiscos", semanas: [10, 8, 7, 6],   unidadesPrevistas: 31, taxaRecompra: 64, precoUnit: 18.9, custoUnit: 8.4, estoqueAtual: 47, estoqueReservado: 5, diasParaRuptura: 18 },
  { id: "pp7", nome: "Antipulga Frontline G",       categoria: "Saúde",    semanas: [2, 1, 2, 1],    unidadesPrevistas: 6,  taxaRecompra: 58, precoUnit: 119,  custoUnit: 78,  estoqueAtual: 12, estoqueReservado: 0, diasParaRuptura: 22 },
  { id: "pp8", nome: "Hills Felino c/d 1,5kg",      categoria: "Ração",    semanas: [2, 1, 1, 1],    unidadesPrevistas: 5,  taxaRecompra: 95, precoUnit: 195,  custoUnit: 134, estoqueAtual: 2,  estoqueReservado: 0, diasParaRuptura: 4,  rupturaSemana: 1 },
];

// ── Demanda por bairro (logística prevista) ──
export type DemandaBairro = {
  bairro: string;
  cidade: string;
  entregasPrevistas: number;
  ticketMedio: number;
  semanas: [number, number, number, number];
};

export const demandaBairros: DemandaBairro[] = [
  { bairro: "Rau",          cidade: "Jaraguá do Sul", entregasPrevistas: 28, ticketMedio: 198, semanas: [10, 7, 6, 5] },
  { bairro: "Centro",       cidade: "Jaraguá do Sul", entregasPrevistas: 22, ticketMedio: 224, semanas: [8, 6, 4, 4] },
  { bairro: "Vila Nova",    cidade: "Jaraguá do Sul", entregasPrevistas: 18, ticketMedio: 176, semanas: [6, 5, 4, 3] },
  { bairro: "Vila Mariana", cidade: "São Paulo",      entregasPrevistas: 14, ticketMedio: 240, semanas: [5, 4, 3, 2] },
  { bairro: "Pinheiros",    cidade: "São Paulo",      entregasPrevistas: 12, ticketMedio: 268, semanas: [4, 3, 3, 2] },
  { bairro: "Brooklin",     cidade: "São Paulo",      entregasPrevistas: 9,  ticketMedio: 312, semanas: [3, 2, 2, 2] },
];


// ── Cupons (ciclo de vida) ──
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

export const cupons: Cupom[] = [
  { id: "cp1", clienteId: "1", codigo: "PET-A1B2C3", desconto: 10, tipo: "percentual", status: "usado",    criadoEm: "01/04", usadoEm: "12/04", motivoEnvio: "Aniversário do Thor" },
  { id: "cp2", clienteId: "1", codigo: "PET-X9Y8Z7", desconto: 15, tipo: "percentual", status: "enviado",  criadoEm: "10/05", motivoEnvio: "Reativação VIP" },
  { id: "cp3", clienteId: "3", codigo: "PET-J5K6L7", desconto: 20, tipo: "fixo",       status: "gerado",   criadoEm: "13/05" },
  { id: "cp4", clienteId: "5", codigo: "PET-M2N3P4", desconto: 12, tipo: "percentual", status: "enviado",  criadoEm: "11/05", motivoEnvio: "Recompra prevista" },
  { id: "cp5", clienteId: "7", codigo: "PET-Q1R2S3", desconto: 25, tipo: "percentual", status: "expirado", criadoEm: "20/03", expiradoEm: "30/04", motivoEnvio: "Cliente em risco" },
  { id: "cp6", clienteId: "6", codigo: "PET-T7U8V9", desconto: 30, tipo: "fixo",       status: "usado",    criadoEm: "02/05", usadoEm: "08/05", motivoEnvio: "Indicação convertida" },
];
