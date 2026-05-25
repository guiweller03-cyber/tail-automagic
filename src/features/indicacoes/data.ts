export type CategoriaRegra = {
  id: string;
  nome: string;
  emoji: string;
  percentual: number;
  ativo: boolean;
  limiteMax: number;
  validadeDias: number;
};

export type ItemCompra = {
  produto: string;
  categoriaId: string;
  qtd: number;
  preco: number;
};

export type CompraIndicado = {
  id: string;
  indicadorId: string;
  indicadoNome: string;
  indicadoTelefone?: string;
  data: string;
  itens: ItemCompra[];
};

export type CampanhaTemp = {
  id: string;
  titulo: string;
  regra: string;
  bonus: number;
  ativo: boolean;
  participantes: number;
};

export const categoriasIniciais: CategoriaRegra[] = [];
export const comprasIniciais: CompraIndicado[] = [];
export const campanhasIniciais: CampanhaTemp[] = [];

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
