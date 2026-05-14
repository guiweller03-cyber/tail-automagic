import { produtos, clientes } from "@/lib/mock";
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode,
  ChevronDown, ChevronUp, Zap, User, Receipt,
} from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Pay = "Pix" | "Cartão" | "Dinheiro";

export function PDV() {
  const [expandido, setExpandido] = useState(false);
  const [cliente, setCliente] = useState("");
  const [valor, setValor] = useState("");
  const [pay, setPay] = useState<Pay>("Pix");
  const [obs, setObs] = useState("");

  // Modo completo
  const [carrinho, setCarrinho] = useState<{ sku: string; nome: string; preco: number; precoCompra: number; qtd: number }[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [frete, setFrete] = useState(0);

  const subtotalFull = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const custoFull = carrinho.reduce((s, i) => s + i.precoCompra * i.qtd, 0);
  const totalFull = Math.max(0, subtotalFull + frete - desconto);
  const lucro = totalFull - custoFull;
  const margem = totalFull > 0 ? (lucro / totalFull) * 100 : 0;

  const totalRapido = Number(valor.replace(",", ".")) || 0;
  const total = expandido ? totalFull : totalRapido;

  const add = (p: typeof produtos[number]) =>
    setCarrinho((c) => {
      const ex = c.find((i) => i.sku === p.sku);
      if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qtd: i.qtd + 1 } : i));
      return [...c, { sku: p.sku, nome: p.nome, preco: p.preco, precoCompra: p.precoCompra, qtd: 1 }];
    });
  const change = (sku: string, delta: number) =>
    setCarrinho((c) =>
      c.flatMap((i) => (i.sku === sku ? (i.qtd + delta <= 0 ? [] : [{ ...i, qtd: i.qtd + delta }]) : [i])),
    );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Zap className="size-6 text-primary" /> PDV
          </h1>
          <p className="text-sm text-muted-foreground">
            {expandido ? "Modo completo · produtos, estoque e margem" : "Modo rápido · venda em segundos"}
          </p>
        </div>
        <button
          onClick={() => setExpandido((v) => !v)}
          className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary"
        >
          {expandido ? <><ChevronUp className="size-4" /> Recolher</> : <><ChevronDown className="size-4" /> Expandir venda</>}
        </button>
      </div>

      {!expandido ? (
        // ==================== MODO RÁPIDO ====================
        <div className="card-soft p-5 max-w-2xl mx-auto space-y-4">
          <div>
            <Label icon={<User className="size-3.5" />}>Cliente</Label>
            <input
              list="clientes-rapidos"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome ou telefone..."
              className="w-full h-12 px-4 rounded-xl bg-secondary text-base outline-none focus:ring-2 ring-primary/30"
            />
            <datalist id="clientes-rapidos">
              {clientes.map((c) => <option key={c.id} value={c.nome} />)}
            </datalist>
          </div>

          <div>
            <Label icon={<Receipt className="size-3.5" />}>Valor total</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">R$</span>
              <input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0,00"
                className="w-full h-16 pl-12 pr-4 rounded-xl bg-secondary text-3xl font-bold outline-none focus:ring-2 ring-primary/30 tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              <PayBtn icon={<QrCode className="size-5" />} label="Pix" active={pay === "Pix"} onClick={() => setPay("Pix")} />
              <PayBtn icon={<CreditCard className="size-5" />} label="Cartão" active={pay === "Cartão"} onClick={() => setPay("Cartão")} />
              <PayBtn icon={<Banknote className="size-5" />} label="Dinheiro" active={pay === "Dinheiro"} onClick={() => setPay("Dinheiro")} />
            </div>
          </div>

          <div>
            <Label>Observação (opcional)</Label>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: entregar até 18h"
              className="w-full h-11 px-4 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>

          <button
            disabled={!cliente || !totalRapido}
            className="w-full h-14 rounded-xl bg-success text-success-foreground font-bold text-lg shadow hover:opacity-90 disabled:opacity-40 transition"
          >
            Finalizar venda · {brl(total)}
          </button>
        </div>
      ) : (
        // ==================== MODO COMPLETO ====================
        <div className="grid lg:grid-cols-[1fr_400px] gap-4">
          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Buscar produto ou ler código..."
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {produtos.map((p) => (
                <button
                  key={p.sku}
                  onClick={() => add(p)}
                  className="card-soft p-3 text-left hover:border-primary hover:shadow-md transition"
                >
                  <div className="aspect-square rounded-xl bg-secondary grid place-items-center text-3xl">🐾</div>
                  <div className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">{p.categoria}</div>
                  <div className="font-semibold text-xs leading-tight mt-0.5 line-clamp-2">{p.nome}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-sm text-primary">{brl(p.preco)}</span>
                    <span className={`text-[10px] font-bold ${p.estoque <= p.minimo ? "text-destructive" : "text-muted-foreground"}`}>
                      {p.estoque} un
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Carrinho</h3>
              <p className="text-xs text-muted-foreground">{carrinho.length} itens · margem {margem.toFixed(0)}%</p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
              {carrinho.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-12">Adicione produtos ao carrinho</div>
              )}
              {carrinho.map((i) => (
                <div key={i.sku} className="card-soft p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{i.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{brl(i.preco)} · un</div>
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

            <div className="border-t border-border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Desconto" value={desconto} onChange={setDesconto} />
                <NumField label="Frete" value={frete} onChange={setFrete} />
              </div>

              <div className="rounded-xl bg-secondary/60 p-3 space-y-1.5">
                <Row label="Subtotal" value={brl(subtotalFull)} />
                <Row label="Custo" value={brl(custoFull)} muted />
                <Row label="Lucro" value={brl(lucro)} accent="success" />
                <Row label="Total" value={brl(totalFull)} bold />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PayBtn icon={<QrCode className="size-4" />} label="Pix" active={pay === "Pix"} onClick={() => setPay("Pix")} />
                <PayBtn icon={<CreditCard className="size-4" />} label="Cartão" active={pay === "Cartão"} onClick={() => setPay("Cartão")} />
                <PayBtn icon={<Banknote className="size-4" />} label="Dinheiro" active={pay === "Dinheiro"} onClick={() => setPay("Dinheiro")} />
              </div>

              <button
                disabled={carrinho.length === 0}
                className="w-full h-12 rounded-xl bg-success text-success-foreground font-bold text-base hover:opacity-90 disabled:opacity-40 transition"
              >
                Finalizar · {brl(totalFull)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5 inline-flex items-center gap-1">
      {icon} {children}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:ring-2 ring-primary/30"
      />
    </div>
  );
}

function Row({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: "success" }) {
  return (
    <div
      className={`flex justify-between items-baseline ${
        bold ? "font-bold text-base pt-1.5 border-t border-border" : "text-xs"
      } ${muted ? "text-muted-foreground" : ""} ${accent === "success" ? "text-success font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PayBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
      }`}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
