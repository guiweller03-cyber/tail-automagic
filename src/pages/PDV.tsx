import { produtos } from "@/lib/mock";
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PDV() {
  const [carrinho, setCarrinho] = useState<{ sku: string; nome: string; preco: number; qtd: number }[]>([
    { sku: produtos[1].sku, nome: produtos[1].nome, preco: produtos[1].preco, qtd: 1 },
    { sku: produtos[5].sku, nome: produtos[5].nome, preco: produtos[5].preco, qtd: 2 },
  ]);

  const subtotal = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const frete = 8.0;
  const total = subtotal + frete;

  const add = (p: typeof produtos[number]) =>
    setCarrinho((c) => {
      const ex = c.find((i) => i.sku === p.sku);
      if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qtd: i.qtd + 1 } : i));
      return [...c, { sku: p.sku, nome: p.nome, preco: p.preco, qtd: 1 }];
    });
  const change = (sku: string, delta: number) =>
    setCarrinho((c) => c.flatMap((i) => (i.sku === sku ? (i.qtd + delta <= 0 ? [] : [{ ...i, qtd: i.qtd + delta }]) : [i])));

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-4 h-[calc(100vh-8rem)]">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Frente de Caixa</h2>
          <div className="relative mt-3">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar produto ou ler código..." className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {produtos.map((p) => (
            <button key={p.sku} onClick={() => add(p)} className="card-soft p-4 text-left hover:border-primary hover:shadow-md transition">
              <div className="aspect-square rounded-xl bg-secondary grid place-items-center text-3xl">🐾</div>
              <div className="text-xs text-muted-foreground mt-3">{p.categoria}</div>
              <div className="font-semibold text-sm leading-tight mt-0.5 line-clamp-2">{p.nome}</div>
              <div className="font-bold text-base mt-2 text-primary">{brl(p.preco)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold">Carrinho</h3>
          <p className="text-xs text-muted-foreground">{carrinho.length} itens</p>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
          {carrinho.map((i) => (
            <div key={i.sku} className="card-soft p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{i.nome}</div>
                <div className="text-xs text-muted-foreground">{brl(i.preco)} · un</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => change(i.sku, -1)} className="size-7 rounded-lg bg-secondary grid place-items-center"><Minus className="size-3.5" /></button>
                <span className="w-7 text-center font-bold text-sm">{i.qtd}</span>
                <button onClick={() => change(i.sku, 1)} className="size-7 rounded-lg bg-secondary grid place-items-center"><Plus className="size-3.5" /></button>
              </div>
              <button onClick={() => change(i.sku, -i.qtd)} className="text-destructive p-1.5 rounded-lg hover:bg-destructive/10"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4 space-y-2">
          <Row label="Subtotal" value={brl(subtotal)} />
          <Row label="Frete" value={brl(frete)} />
          <Row label="Total" value={brl(total)} bold />
          <div className="grid grid-cols-3 gap-2 mt-3">
            <PayBtn icon={<QrCode className="size-5" />} label="Pix" active />
            <PayBtn icon={<CreditCard className="size-5" />} label="Cartão" />
            <PayBtn icon={<Banknote className="size-5" />} label="Dinheiro" />
          </div>
          <button className="w-full h-12 mt-2 rounded-xl bg-success text-success-foreground font-bold text-base hover:opacity-90 transition">
            Finalizar venda · {brl(total)}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-base pt-2 border-t border-border" : "text-muted-foreground"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function PayBtn({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>
      {icon}<span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
