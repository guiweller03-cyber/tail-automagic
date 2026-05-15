// Domain data & types for the Indicações (referrals) feature.
// Keeps business data separate from UI components.

export type CategoriaRegra = {
  id: string;
  nome: string;
  emoji: string;
  percentual: number;     // % de pontos sobre o valor da compra do indicado
  ativo: boolean;
  limiteMax: number;      // teto em pontos por compra (0 = sem limite)
  validadeDias: number;   // validade dos pontos gerados
};

export type ItemCompra = {
  produto: string;
  categoriaId: string;
  qtd: number;
  preco: number; // preço unitário
};

export type CompraIndicado = {
  id: string;
  indicadorId: string;     // cliente que indicou
  indicadoNome: string;    // amigo indicado
  indicadoTelefone?: string;
  data: string;            // "há 2 dias"
  itens: ItemCompra[];
  descontoAplicado?: boolean;  // 10% OFF aplicado na 1ª compra
  dataDesconto?: string;       // ISO ou data legível
  primeiraCompra?: boolean;
};

export type CampanhaTemp = {
  id: string;
  titulo: string;
  regra: string;
  bonus: number;
  ativo: boolean;
  participantes: number;
};

export const categoriasIniciais: CategoriaRegra[] = [
  { id: "med",   nome: "Medicamentos", emoji: "💊", percentual: 10, ativo: true, limiteMax: 200, validadeDias: 90 },
  { id: "rac",   nome: "Ração",        emoji: "🥣", percentual: 3,  ativo: true, limiteMax: 150, validadeDias: 90 },
  { id: "ace",   nome: "Acessórios",   emoji: "🦮", percentual: 5,  ativo: true, limiteMax: 100, validadeDias: 60 },
  { id: "hig",   nome: "Higiene",      emoji: "🛁", percentual: 4,  ativo: true, limiteMax: 80,  validadeDias: 60 },
  { id: "petisco", nome: "Petiscos",   emoji: "🦴", percentual: 6,  ativo: true, limiteMax: 60,  validadeDias: 45 },
  { id: "brinq", nome: "Brinquedos",   emoji: "🧸", percentual: 5,  ativo: false, limiteMax: 50, validadeDias: 30 },
];

export const comprasIniciais: CompraIndicado[] = [
  // João (clienteId "1") indicou 3 amigos
  { id: "c1", indicadorId: "1", indicadoNome: "Carlos Souza", indicadoTelefone: "(11) 99000-1111", data: "há 2 dias", itens: [
    { produto: "Antipulgas Bravecto", categoriaId: "med", qtd: 1, preco: 140 },
    { produto: "Ração Golden 3kg",     categoriaId: "rac", qtd: 1, preco: 60 },
  ]},
  { id: "c2", indicadorId: "1", indicadoNome: "Maria Lopes", indicadoTelefone: "(11) 99000-2222", data: "há 5 dias", itens: [
    { produto: "Shampoo hipoalergênico", categoriaId: "hig", qtd: 1, preco: 55 },
    { produto: "Coleira ajustável",       categoriaId: "ace", qtd: 1, preco: 45 },
    { produto: "Petisco Natural 90g",     categoriaId: "petisco", qtd: 2, preco: 25 },
  ]},
  { id: "c3", indicadorId: "1", indicadoNome: "Pedro Lima", indicadoTelefone: "(11) 99000-3333", data: "há 1 dia", itens: [
    { produto: "Vermífugo Drontal",     categoriaId: "med", qtd: 2, preco: 60 },
    { produto: "Ração Premier 10kg",    categoriaId: "rac", qtd: 1, preco: 130 },
  ]},
  // Outros indicadores
  { id: "c4", indicadorId: "3", indicadoNome: "Renata Souza", data: "há 8 dias", itens: [
    { produto: "Ração Premier 7kg",  categoriaId: "rac", qtd: 1, preco: 180 },
    { produto: "Brinquedo de corda", categoriaId: "brinq", qtd: 1, preco: 35 },
    { produto: "Shampoo neutro",     categoriaId: "hig", qtd: 1, preco: 45 },
    { produto: "Petisco bifinho",    categoriaId: "petisco", qtd: 2, preco: 30 },
  ]},
  { id: "c5", indicadorId: "4", indicadoNome: "Bruno Tavares", data: "há 5 dias", itens: [
    { produto: "Antialérgico veterinário", categoriaId: "med", qtd: 1, preco: 95 },
    { produto: "Coleira premium",          categoriaId: "ace", qtd: 1, preco: 85 },
  ]},
  { id: "c6", indicadorId: "5", indicadoNome: "Diego Costa", data: "agora", itens: [
    // pendente: sem itens (aguardando 1ª compra)
  ]},
];

export const campanhasIniciais: CampanhaTemp[] = [
  { id: "c1", titulo: "Indique 3 amigos",       regra: "Ganhe 100 pontos extras ao 3º amigo cadastrado", bonus: 100, ativo: true,  participantes: 14 },
  { id: "c2", titulo: "Medicamentos em alta",   regra: "Medicamentos rendem 10% este mês",                bonus: 0,   ativo: true,  participantes: 32 },
  { id: "c3", titulo: "Ração em dobro",         regra: "Pontos da categoria ração em dobro nos finais de semana", bonus: 0, ativo: false, participantes: 0 },
];

// ── Cálculos ──
export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function totalCompra(c: CompraIndicado): number {
  return c.itens.reduce((s, i) => s + i.qtd * i.preco, 0);
}

export function pontosCompra(c: CompraIndicado, cats: CategoriaRegra[]): number {
  return c.itens.reduce((s, i) => {
    const cat = cats.find((k) => k.id === i.categoriaId);
    if (!cat || !cat.ativo) return s;
    const subtotal = i.qtd * i.preco;
    const bruto = (subtotal * cat.percentual) / 100;
    const limitado = cat.limiteMax > 0 ? Math.min(bruto, cat.limiteMax) : bruto;
    return s + limitado;
  }, 0);
}

export function pontosPorCategoria(c: CompraIndicado, cats: CategoriaRegra[]) {
  const map = new Map<string, { categoria: CategoriaRegra; valor: number; pontos: number }>();
  for (const i of c.itens) {
    const cat = cats.find((k) => k.id === i.categoriaId);
    if (!cat) continue;
    const subtotal = i.qtd * i.preco;
    const bruto = cat.ativo ? (subtotal * cat.percentual) / 100 : 0;
    const pontos = cat.limiteMax > 0 ? Math.min(bruto, cat.limiteMax) : bruto;
    const cur = map.get(cat.id) ?? { categoria: cat, valor: 0, pontos: 0 };
    cur.valor += subtotal;
    cur.pontos += pontos;
    map.set(cat.id, cur);
  }
  return Array.from(map.values());
}
