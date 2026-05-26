export type KanbanTab =
  | "Leads"
  | "Clientes"
  | "Pós-venda"
  | "Indicações"
  | "Recuperação"
  | "Campanhas"
  | "Influenciadores";

export type SmartColumn =
  | "Leads do dia"
  | "Novo contato"
  | "Em atendimento"
  | "Interessado"
  | "Orçamento enviado"
  | "Não fechou"
  | "Cliente em risco"
  | "Cliente inativo"
  | "Pós-venda"
  | "Fidelização"
  | "Indicações"
  | "Recuperados";

export type LeadOrigem =
  | "Meta Ads"
  | "Instagram"
  | "TikTok"
  | "Google"
  | "WhatsApp"
  | "Influenciador"
  | "Cupom"
  | "QR Code"
  | "Indicação";

export type LeadIntent = "frio" | "morno" | "quente" | "comprando";
export type LeadPriority = "baixa" | "media" | "alta" | "urgente";

export type LeadCard = {
  id: string;
  nome: string;
  telefone: string;
  tags: string[];
  origem: LeadOrigem;
  origemDetalhe?: string;
  utmSource?: string;
  utmCampaign?: string;
  anuncio?: string;
  influenciador?: string;
  cupom?: string;
  custoLead: number;          // custo individual do lead (não da campanha global)
  primeiroContato: string;    // data
  tempoAteCompra?: number;    // dias
  ultimaInteracao: string;    // ex: "2h", "3d"
  diasSemInteracao: number;
  comprasRealizadas: number;
  ticketMedio: number;
  produtosFavoritos: string[];
  pontos: number;
  indicacoesFeitas: number;
  campanhasRecebidas: string[];
  ultimoAtendimento: string;
  statusRelacionamento: string;
  intent: LeadIntent;
  priority: LeadPriority;
  churnRisk: number;          // 0-100
  column: SmartColumn;
  tab: KanbanTab;
  valorPotencial: number;
};
