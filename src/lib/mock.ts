// Mock data for Mundo Pet CRM (frontend-only demo)
export const kpis = {
  faturamentoHoje: 4870.5,
  faturamentoMes: 87420,
  lucroMes: 24180,
  ticketMedio: 142.3,
  pedidosHoje: 34,
  taxaRecompra: 68,
  taxaUpsell: 23,
  clientesVip: 142,
  clientesRisco: 18,
  estoqueCritico: 7,
};

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

export type Pedido = {
  id: string;
  cliente: string;
  pet: string;
  total: number;
  status: "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";
  bairro: string;
  hora: string;
};

export const pedidos: Pedido[] = [
  { id: "#10238", cliente: "Marina Costa", pet: "Thor (Golden)", total: 189.9, status: "em rota", bairro: "Vila Mariana", hora: "14:20" },
  { id: "#10237", cliente: "Pedro Alves", pet: "Mel (SRD)", total: 87.5, status: "separando", bairro: "Moema", hora: "14:05" },
  { id: "#10236", cliente: "Júlia Ramos", pet: "Bento (Shih-tzu)", total: 264.0, status: "pago", bairro: "Pinheiros", hora: "13:48" },
  { id: "#10235", cliente: "Carlos Mendes", pet: "Luna (Maine Coon)", total: 142.3, status: "entregue", bairro: "Itaim", hora: "13:12" },
  { id: "#10234", cliente: "Ana Beatriz", pet: "Nina (Poodle)", total: 320.0, status: "novo", bairro: "Vila Olímpia", hora: "12:55" },
  { id: "#10233", cliente: "Roberto Lima", pet: "Zeus (Rottweiler)", total: 540.7, status: "em rota", bairro: "Brooklin", hora: "12:30" },
  { id: "#10232", cliente: "Fernanda Sá", pet: "Mia (Persa)", total: 95.0, status: "entregue", bairro: "Moema", hora: "11:50" },
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
  { id: "1", cliente: "Marina Costa", pet: "Thor", ultima: "Pode mandar o Pix? 🙏", hora: "14:32", naoLidas: 2, tag: "IA", estagio: "Aguardando pagamento" },
  { id: "2", cliente: "Pedro Alves", pet: "Mel", ultima: "Beleza, pode confirmar!", hora: "14:18", naoLidas: 0, tag: "IA", estagio: "Hoje" },
  { id: "3", cliente: "Júlia Ramos", pet: "Bento", ultima: "Vocês têm shampoo hipoalergênico?", hora: "13:50", naoLidas: 1, tag: "Aguardando", estagio: "Upsell" },
  { id: "4", cliente: "Carlos Mendes", pet: "Luna", ultima: "Recebi, obrigado! ❤️", hora: "13:14", naoLidas: 0, tag: "Humano", estagio: "Follow-up" },
  { id: "5", cliente: "Ana Beatriz", pet: "Nina", ultima: "A ração da Nina tá acabando 😅", hora: "12:58", naoLidas: 3, tag: "IA", estagio: "Recompra" },
  { id: "6", cliente: "Roberto Lima", pet: "Zeus", ultima: "Quanto sai o saco de 15kg?", hora: "12:30", naoLidas: 0, tag: "IA", estagio: "Hoje" },
  { id: "7", cliente: "Helena Souza", pet: "Pretinha", ultima: "—", hora: "ontem", naoLidas: 0, tag: "Humano", estagio: "Risco" },
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
  campanha?: string;
  cupom?: string;
  influenciador?: string;
  cac: number;
  totalGasto: number;
  totalDescontos: number;
  lucroLiquido: number;
  pedidos: number;
  proxRecompra: string;
};

export const clientes: Cliente[] = [
  { id: "1", nome: "Marina Costa", telefone: "(11) 99812-3344", endereco: "R. Vergueiro, 1240", bairro: "Vila Mariana", pets: ["Thor"], ticket: 210, frequencia: "Mensal", ultima: "há 3 dias", perfil: "VIP", origem: "Influenciadora Gabi Pets", campanha: "Influencer @gabipets", cupom: "GABI10", influenciador: "@gabipets", cac: 14.5, totalGasto: 2940, totalDescontos: 180, lucroLiquido: 1180, pedidos: 14, proxRecompra: "em 4 dias" },
  { id: "2", nome: "Pedro Alves", telefone: "(11) 99423-7788", endereco: "R. Tuim, 220", bairro: "Moema", pets: ["Mel"], ticket: 95, frequencia: "Bimestral", ultima: "há 12 dias", perfil: "Econômico", origem: "Meta Ads", campanha: "Black Pet Nov", cac: 22, totalGasto: 760, totalDescontos: 40, lucroLiquido: 210, pedidos: 8, proxRecompra: "em 18 dias" },
  { id: "3", nome: "Júlia Ramos", telefone: "(11) 98011-2231", endereco: "R. dos Pinheiros, 412", bairro: "Pinheiros", pets: ["Bento", "Lola"], ticket: 280, frequencia: "Mensal", ultima: "há 1 dia", perfil: "Premium", origem: "Instagram Orgânico", cac: 0, totalGasto: 4480, totalDescontos: 220, lucroLiquido: 1620, pedidos: 16, proxRecompra: "em 22 dias" },
  { id: "4", nome: "Carlos Mendes", telefone: "(11) 97812-5599", endereco: "R. Iguatemi, 88", bairro: "Itaim", pets: ["Luna"], ticket: 142, frequencia: "Mensal", ultima: "há 5 dias", perfil: "VIP", origem: "Indicação", cac: 0, totalGasto: 1988, totalDescontos: 60, lucroLiquido: 720, pedidos: 14, proxRecompra: "em 12 dias" },
  { id: "5", nome: "Ana Beatriz", telefone: "(11) 99988-1144", endereco: "R. Funchal, 200", bairro: "Vila Olímpia", pets: ["Nina"], ticket: 320, frequencia: "Mensal", ultima: "há 2 dias", perfil: "Premium", origem: "TikTok", campanha: "Reels orgânico", cac: 4, totalGasto: 5120, totalDescontos: 320, lucroLiquido: 1980, pedidos: 16, proxRecompra: "em 9 dias" },
  { id: "6", nome: "Roberto Lima", telefone: "(11) 98234-6677", endereco: "Av. Berrini, 880", bairro: "Brooklin", pets: ["Zeus"], ticket: 540, frequencia: "Mensal", ultima: "há 1 dia", perfil: "VIP", origem: "Google", campanha: "Search ração premium", cac: 38, totalGasto: 7560, totalDescontos: 410, lucroLiquido: 2980, pedidos: 14, proxRecompra: "em 7 dias" },
  { id: "7", nome: "Helena Souza", telefone: "(11) 97001-2233", endereco: "R. das Rosas, 14", bairro: "Saúde", pets: ["Pretinha"], ticket: 78, frequencia: "—", ultima: "há 62 dias", perfil: "Risco", origem: "WhatsApp direto", cac: 0, totalGasto: 234, totalDescontos: 0, lucroLiquido: 38, pedidos: 3, proxRecompra: "atrasada" },
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
