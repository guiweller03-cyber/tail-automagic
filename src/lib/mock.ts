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
};

export const conversas: Conversa[] = [
  { id: "1", cliente: "Marina Costa", pet: "Thor", ultima: "Pode mandar o Pix? 🙏", hora: "14:32", naoLidas: 2, tag: "IA" },
  { id: "2", cliente: "Pedro Alves", pet: "Mel", ultima: "Beleza, pode confirmar!", hora: "14:18", naoLidas: 0, tag: "IA" },
  { id: "3", cliente: "Júlia Ramos", pet: "Bento", ultima: "Vocês têm shampoo hipoalergênico?", hora: "13:50", naoLidas: 1, tag: "Aguardando" },
  { id: "4", cliente: "Carlos Mendes", pet: "Luna", ultima: "Recebi, obrigado! ❤️", hora: "13:14", naoLidas: 0, tag: "Humano" },
  { id: "5", cliente: "Ana Beatriz", pet: "Nina", ultima: "A ração da Nina tá acabando 😅", hora: "12:58", naoLidas: 3, tag: "IA" },
  { id: "6", cliente: "Roberto Lima", pet: "Zeus", ultima: "Quanto sai o saco de 15kg?", hora: "12:30", naoLidas: 0, tag: "IA" },
];

export type Cliente = {
  id: string;
  nome: string;
  telefone: string;
  bairro: string;
  pets: string[];
  ticket: number;
  frequencia: string;
  ultima: string;
  perfil: "VIP" | "Premium" | "Econômico" | "Novo" | "Risco";
};

export const clientes: Cliente[] = [
  { id: "1", nome: "Marina Costa", telefone: "(11) 99812-3344", bairro: "Vila Mariana", pets: ["Thor"], ticket: 210, frequencia: "Mensal", ultima: "há 3 dias", perfil: "VIP" },
  { id: "2", nome: "Pedro Alves", telefone: "(11) 99423-7788", bairro: "Moema", pets: ["Mel"], ticket: 95, frequencia: "Bimestral", ultima: "há 12 dias", perfil: "Econômico" },
  { id: "3", nome: "Júlia Ramos", telefone: "(11) 98011-2231", bairro: "Pinheiros", pets: ["Bento", "Lola"], ticket: 280, frequencia: "Mensal", ultima: "há 1 dia", perfil: "Premium" },
  { id: "4", nome: "Carlos Mendes", telefone: "(11) 97812-5599", bairro: "Itaim", pets: ["Luna"], ticket: 142, frequencia: "Mensal", ultima: "há 5 dias", perfil: "VIP" },
  { id: "5", nome: "Ana Beatriz", telefone: "(11) 99988-1144", bairro: "Vila Olímpia", pets: ["Nina"], ticket: 320, frequencia: "Mensal", ultima: "há 2 dias", perfil: "Premium" },
  { id: "6", nome: "Roberto Lima", telefone: "(11) 98234-6677", bairro: "Brooklin", pets: ["Zeus"], ticket: 540, frequencia: "Mensal", ultima: "há 1 dia", perfil: "VIP" },
  { id: "7", nome: "Helena Souza", telefone: "(11) 97001-2233", bairro: "Saúde", pets: ["Pretinha"], ticket: 78, frequencia: "—", ultima: "há 62 dias", perfil: "Risco" },
];

export type Produto = {
  sku: string;
  nome: string;
  categoria: string;
  estoque: number;
  minimo: number;
  giro: "alto" | "médio" | "baixo";
  preco: number;
};

export const produtos: Produto[] = [
  { sku: "RAC-GOL-15", nome: "Ração Golden Adultos 15kg", categoria: "Ração", estoque: 4, minimo: 8, giro: "alto", preco: 289.9 },
  { sku: "RAC-PRE-3", nome: "Ração Premier Filhotes 3kg", categoria: "Ração", estoque: 22, minimo: 6, giro: "alto", preco: 142.0 },
  { sku: "ARE-PIN-12", nome: "Areia Pipicat 12kg", categoria: "Higiene", estoque: 3, minimo: 10, giro: "alto", preco: 39.9 },
  { sku: "BRI-COR-M", nome: "Brinquedo Corda Média", categoria: "Brinquedos", estoque: 18, minimo: 5, giro: "médio", preco: 24.5 },
  { sku: "SHA-HIP-500", nome: "Shampoo Hipoalergênico 500ml", categoria: "Higiene", estoque: 1, minimo: 4, giro: "médio", preco: 58.0 },
  { sku: "PET-NAT-90", nome: "Petisco Natural 90g", categoria: "Petiscos", estoque: 47, minimo: 12, giro: "alto", preco: 18.9 },
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
