import { produtos, clientes } from "@/lib/mock";
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode,
  ChevronDown, ChevronUp, Zap, User, Receipt, MessageCircle,
  Check, X, History, RotateCcw, Phone, MapPin, Send,
} from "lucide-react";
import { useMemo, useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Pay = "Pix" | "Cartão" | "Dinheiro";
type StatusPag = "Pago" | "Pendente";
type StatusVenda = "Concluída" | "Cancelada" | "Reembolsada";

type Item = { sku: string; nome: string; preco: number; precoCompra: number; qtd: number };
type Venda = {
  id: string;
  hora: string;
  data: string;
  cliente: string;
  telefone: string;
  itens: Item[];
  total: number;
  pay: Pay;
  statusPag: StatusPag;
  status: StatusVenda;
  obs?: string;
  motivoCancel?: string;
  canceladoPor?: string;
  canceladoEm?: string;
  whatsEnviado?: boolean;
};
type MsgLog = { id: string; cliente: string; telefone: string; quando: string; preview: string; vendaId?: string };

export function PDV() {
  const [expandido, setExpandido] = useState(false);
  const [cliente, setCliente] = useState("");
  const [showClienteDD, setShowClienteDD] = useState(false);
  const [valor, setValor] = useState("");
  const [pay, setPay] = useState<Pay>("Pix");
  const [statusPag, setStatusPag] = useState<StatusPag>("Pago");
  const [obs, setObs] = useState("");

  const [carrinho, setCarrinho] = useState<Item[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [frete, setFrete] = useState(0);

  const [vendas, setVendas] = useState<Venda[]>([
    { id: "V-1042", hora: "14:32", data: "hoje", cliente: "Marina Costa", telefone: "(11) 99812-3344", itens: [{ sku: "x", nome: "Golden Adultos 15kg", preco: 289.9, precoCompra: 200, qtd: 1 }], total: 289.9, pay: "Pix", statusPag: "Pago", status: "Concluída", whatsEnviado: true },
    { id: "V-1041", hora: "13:48", data: "hoje", cliente: "Júlia Ramos", telefone: "(11) 98011-2231", itens: [{ sku: "y", nome: "Petisco Natural 90g", preco: 24, precoCompra: 12, qtd: 2 }, { sku: "z", nome: "Brinquedo corda", preco: 39.9, precoCompra: 18, qtd: 1 }], total: 87.9, pay: "Cartão", statusPag: "Pago", status: "Concluída" },
    { id: "V-1040", hora: "12:10", data: "hoje", cliente: "Pedro Alves", telefone: "(11) 99423-7788", itens: [{ sku: "a", nome: "Areia Higiênica 4kg", preco: 35, precoCompra: 18, qtd: 1 }], total: 35, pay: "Dinheiro", statusPag: "Pendente", status: "Concluída" },
  ]);
  const [msgLog, setMsgLog] = useState<MsgLog[]>([
    { id: "m1", cliente: "Marina Costa", telefone: "(11) 99812-3344", quando: "14:33", preview: "Olá Marina 😊 seu pedido foi separado…", vendaId: "V-1042" },
  ]);

  const [cancelTarget, setCancelTarget] = useState<Venda | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState("");

  const subtotalFull = carrinho.reduce((s, i) => s + i.preco * i.qtd, 0);
  const custoFull = carrinho.reduce((s, i) => s + i.precoCompra * i.qtd, 0);
  const totalFull = Math.max(0, subtotalFull + frete - desconto);
  const lucro = totalFull - custoFull;
  const margem = totalFull > 0 ? (lucro / totalFull) * 100 : 0;
  const totalRapido = Number(valor.replace(",", ".")) || 0;
  const total = expandido ? totalFull : totalRapido;

  const clienteSel = useMemo(
    () => clientes.find((c) => c.nome.toLowerCase() === cliente.toLowerCase()),
    [cliente],
  );
  const sugestoes = useMemo(() => {
    const q = cliente.trim().toLowerCase();
    if (!q) return clientes.slice(0, 6);
    return clientes
      .filter((c) => c.nome.toLowerCase().includes(q) || c.telefone.replace(/\D/g, "").includes(q.replace(/\D/g, "")))
      .slice(0, 6);
  }, [cliente]);

  const construirMensagem = (v?: Partial<Venda>) => {
    const nome = v?.cliente || cliente || "cliente";
    const itens = expandido && carrinho.length
      ? carrinho.map((i) => `• ${i.qtd}× ${i.nome} — ${brl(i.preco * i.qtd)}`).join("\n")
      : v?.itens?.map((i) => `• ${i.qtd}× ${i.nome} — ${brl(i.preco * i.qtd)}`).join("\n") || "• Pedido avulso";
    const t = v?.total ?? total;
    const pagamento = v?.pay ?? pay;
    const sPag = v?.statusPag ?? statusPag;
    const c = clientes.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const endereco = c?.endereco ? `\n📍 ${c.endereco}${c.bairro ? `, ${c.bairro}` : ""}` : "";
    const obsLinha = (v?.obs ?? obs) ? `\n📝 ${v?.obs ?? obs}` : "";
    return `Olá ${nome.split(" ")[0]} 😊 seu pedido foi separado!\n\n${itens}\n\n💰 Total: ${brl(t)}\n💳 Pagamento: ${pagamento} · ${sPag === "Pago" ? "✅ Pago" : "⏳ Pagamento pendente"}${endereco}${obsLinha}\n\nQualquer dúvida estamos por aqui 🐾`;
  };

  const enviarWhats = (venda?: Venda) => {
    const nome = venda?.cliente || cliente;
    if (!nome) return;
    const c = clientes.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const fone = (venda?.telefone || c?.telefone || "").replace(/\D/g, "");
    const msg = construirMensagem(venda);
    const url = fone
      ? `https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setMsgLog((m) => [
      { id: `m${Date.now()}`, cliente: nome, telefone: c?.telefone || venda?.telefone || "", quando: "agora", preview: msg.slice(0, 64) + "…", vendaId: venda?.id },
      ...m,
    ].slice(0, 20));
  };

  const finalizar = (whats = false) => {
    const nome = cliente || "Avulso";
    const c = clientes.find((x) => x.nome.toLowerCase() === nome.toLowerCase());
    const itens = expandido ? [...carrinho] : [{ sku: "avulso", nome: obs || "Venda rápida", preco: totalRapido, precoCompra: 0, qtd: 1 }];
    const v: Venda = {
      id: `V-${1043 + vendas.length}`,
      hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      data: "hoje",
      cliente: nome,
      telefone: c?.telefone || "",
      itens,
      total,
      pay,
      statusPag,
      status: "Concluída",
      obs,
      whatsEnviado: whats,
    };
    setVendas((vs) => [v, ...vs]);
    if (whats) enviarWhats(v);
    setCliente(""); setValor(""); setObs(""); setCarrinho([]); setDesconto(0); setFrete(0);
  };

  const confirmarCancelamento = () => {
    if (!cancelTarget || !cancelMotivo.trim()) return;
    setVendas((vs) =>
      vs.map((v) =>
        v.id === cancelTarget.id
          ? {
              ...v,
              status: "Cancelada",
              motivoCancel: cancelMotivo,
              canceladoPor: "Operador (você)",
              canceladoEm: new Date().toLocaleString("pt-BR"),
            }
          : v,
      ),
    );
    setCancelTarget(null); setCancelMotivo("");
  };

  const add = (p: typeof produtos[number]) =>
    setCarrinho((c) => {
      const ex = c.find((i) => i.sku === p.sku);
      if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qtd: i.qtd + 1 } : i));
      return [...c, { sku: p.sku, nome: p.nome, preco: p.preco, precoCompra: p.precoCompra, qtd: 1 }];
    });
  const change = (sku: string, delta: number) =>
    setCarrinho((c) => c.flatMap((i) => (i.sku === sku ? (i.qtd + delta <= 0 ? [] : [{ ...i, qtd: i.qtd + delta }]) : [i])));

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
        <div className="card-soft p-5 max-w-2xl mx-auto space-y-4">
          {/* Cliente combobox */}
          <div className="relative">
            <Label icon={<User className="size-3.5" />}>Cliente</Label>
            <div className="relative">
              <input
                value={cliente}
                onChange={(e) => { setCliente(e.target.value); setShowClienteDD(true); }}
                onFocus={() => setShowClienteDD(true)}
                onBlur={() => setTimeout(() => setShowClienteDD(false), 150)}
                placeholder="Nome ou telefone…"
                className="w-full h-12 pl-4 pr-10 rounded-xl bg-secondary text-base outline-none focus:ring-2 ring-primary/30"
              />
              <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
            {showClienteDD && sugestoes.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 card-soft p-1 max-h-72 overflow-y-auto">
                {sugestoes.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => { e.preventDefault(); setCliente(c.nome); setShowClienteDD(false); }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left"
                  >
                    <div className="size-9 rounded-full bg-primary/15 text-primary grid place-items-center font-bold text-sm shrink-0">
                      {c.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{c.nome}</div>
                      <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                        <Phone className="size-3" /> {c.telefone}
                        {c.bairro && <><span>·</span><MapPin className="size-3" /> {c.bairro}</>}
                      </div>
                    </div>
                    {c.perfil === "VIP" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">VIP</span>}
                  </button>
                ))}
              </div>
            )}
            {clienteSel && (
              <div className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-2">
                <Check className="size-3 text-success" /> {clienteSel.telefone} · {clienteSel.bairro}
              </div>
            )}
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
            <Label>Status do pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setStatusPag("Pago")} className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pago" ? "bg-success text-success-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}>✅ Pago</button>
              <button onClick={() => setStatusPag("Pendente")} className={`h-10 rounded-xl text-sm font-semibold transition ${statusPag === "Pendente" ? "bg-warning text-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"}`}>⏳ Pendente</button>
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

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={() => finalizar(false)}
              disabled={!cliente || !totalRapido}
              className="h-14 rounded-xl bg-success text-success-foreground font-bold text-lg shadow hover:opacity-90 disabled:opacity-40 transition"
            >
              Finalizar · {brl(total)}
            </button>
            <button
              onClick={() => cliente && totalRapido ? finalizar(true) : enviarWhats()}
              disabled={!cliente}
              title="Enviar resumo no WhatsApp"
              className="h-14 px-5 rounded-xl bg-[#25D366] text-white font-semibold shadow hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-2"
            >
              <MessageCircle className="size-5" />
              <span className="hidden sm:inline">Enviar no WhatsApp</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-4">
          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input placeholder="Buscar produto ou ler código..." className="w-full h-11 pl-9 pr-3 rounded-xl bg-secondary text-sm outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {produtos.map((p) => (
                <button key={p.sku} onClick={() => add(p)} className="card-soft p-3 text-left hover:border-primary hover:shadow-md transition">
                  <div className="aspect-square rounded-xl bg-secondary grid place-items-center text-3xl">🐾</div>
                  <div className="text-[10px] text-muted-foreground mt-2 uppercase tracking-wide">{p.categoria}</div>
                  <div className="font-semibold text-xs leading-tight mt-0.5 line-clamp-2">{p.nome}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold text-sm text-primary">{brl(p.preco)}</span>
                    <span className={`text-[10px] font-bold ${p.estoque <= p.minimo ? "text-destructive" : "text-muted-foreground"}`}>{p.estoque} un</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card-soft flex flex-col overflow-hidden h-[calc(100vh-12rem)]">
            <div className="p-4 border-b border-border">
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                list="clientes-full"
                placeholder="Cliente…"
                className="w-full h-9 px-3 rounded-lg bg-secondary text-sm outline-none mb-2"
              />
              <datalist id="clientes-full">{clientes.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
              <h3 className="font-semibold">Carrinho</h3>
              <p className="text-xs text-muted-foreground">{carrinho.length} itens · margem {margem.toFixed(0)}%</p>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
              {carrinho.length === 0 && (<div className="text-center text-xs text-muted-foreground py-12">Adicione produtos ao carrinho</div>)}
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

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setStatusPag("Pago")} className={`h-9 rounded-lg text-xs font-semibold ${statusPag === "Pago" ? "bg-success text-success-foreground" : "bg-secondary"}`}>✅ Pago</button>
                <button onClick={() => setStatusPag("Pendente")} className={`h-9 rounded-lg text-xs font-semibold ${statusPag === "Pendente" ? "bg-warning text-foreground" : "bg-secondary"}`}>⏳ Pendente</button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button onClick={() => finalizar(false)} disabled={carrinho.length === 0} className="h-12 rounded-xl bg-success text-success-foreground font-bold text-base hover:opacity-90 disabled:opacity-40 transition">
                  Finalizar · {brl(totalFull)}
                </button>
                <button onClick={() => carrinho.length ? finalizar(true) : enviarWhats()} disabled={!cliente} className="h-12 px-4 rounded-xl bg-[#25D366] text-white font-semibold hover:opacity-90 disabled:opacity-40 transition inline-flex items-center gap-1.5">
                  <MessageCircle className="size-4" /> WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendas recentes + cancelamento */}
      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2"><History className="size-4 text-primary" /> Vendas recentes</h2>
            <p className="text-xs text-muted-foreground">Cancele, reenvie no WhatsApp ou consulte status</p>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground bg-secondary px-2 py-1 rounded-md">{vendas.length} vendas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-5 py-3">Pedido</th>
                <th className="font-medium px-5 py-3">Cliente</th>
                <th className="font-medium px-5 py-3">Itens</th>
                <th className="font-medium px-5 py-3 text-right">Total</th>
                <th className="font-medium px-5 py-3">Pagto</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className={`border-t border-border hover:bg-secondary/30 ${v.status === "Cancelada" ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3 font-mono text-xs font-bold">{v.id}<div className="text-[10px] text-muted-foreground font-sans">{v.hora}</div></td>
                  <td className="px-5 py-3">
                    <div className="font-semibold">{v.cliente}</div>
                    <div className="text-[11px] text-muted-foreground">{v.telefone}</div>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs truncate">{v.itens.map((i) => `${i.qtd}× ${i.nome}`).join(" · ")}</td>
                  <td className="px-5 py-3 text-right font-bold tabular-nums">{brl(v.total)}</td>
                  <td className="px-5 py-3 text-xs">
                    <div>{v.pay}</div>
                    <span className={`text-[10px] font-bold ${v.statusPag === "Pago" ? "text-success" : "text-warning"}`}>{v.statusPag}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                      v.status === "Concluída" ? "bg-success/15 text-success" :
                      v.status === "Cancelada" ? "bg-destructive/10 text-destructive" :
                      "bg-warning/15 text-warning"
                    }`}>{v.status}</span>
                    {v.motivoCancel && <div className="text-[10px] text-muted-foreground mt-1 max-w-[160px] truncate" title={v.motivoCancel}>↳ {v.motivoCancel}</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => enviarWhats(v)} title="Reenviar WhatsApp" className="p-1.5 rounded-lg hover:bg-secondary text-[#25D366]"><Send className="size-3.5" /></button>
                      {v.status === "Concluída" && (
                        <button onClick={() => setCancelTarget(v)} title="Cancelar venda" className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"><RotateCcw className="size-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Histórico WhatsApp */}
      <section className="card-soft p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2"><MessageCircle className="size-4 text-[#25D366]" /> Mensagens enviadas</h2>
            <p className="text-xs text-muted-foreground">Histórico recente · últimas {msgLog.length}</p>
          </div>
        </div>
        <div className="space-y-2">
          {msgLog.length === 0 && <div className="text-center text-xs text-muted-foreground py-6">Nenhuma mensagem enviada ainda</div>}
          {msgLog.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
              <div className="size-9 rounded-full bg-[#25D366]/15 text-[#25D366] grid place-items-center"><MessageCircle className="size-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{m.cliente}</span>
                  {m.vendaId && <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-card border border-border">{m.vendaId}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{m.preview}</div>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{m.quando}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Modal cancelamento */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40" onClick={() => setCancelTarget(null)}>
          <div className="card-soft p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2"><RotateCcw className="size-4 text-destructive" /> Cancelar venda</h3>
                <p className="text-xs text-muted-foreground">{cancelTarget.id} · {cancelTarget.cliente} · {brl(cancelTarget.total)}</p>
              </div>
              <button onClick={() => setCancelTarget(null)} className="p-1 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-xs space-y-1">
              <div className="font-semibold text-warning">Ao confirmar:</div>
              <div className="text-muted-foreground">↺ Produtos retornam ao estoque</div>
              <div className="text-muted-foreground">↺ Financeiro é estornado</div>
              <div className="text-muted-foreground">↺ Histórico registrado com data e operador</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Motivo do cancelamento</label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: cliente desistiu, produto em falta…"
                className="mt-1 w-full p-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelTarget(null)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/70">Voltar</button>
              <button onClick={confirmarCancelamento} disabled={!cancelMotivo.trim()} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90">
                Confirmar cancelamento
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
      <input type="number" value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)} placeholder="0" className="w-full h-9 px-3 rounded-lg bg-card border border-border text-sm outline-none focus:ring-2 ring-primary/30" />
    </div>
  );
}
function Row({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: "success" }) {
  return (
    <div className={`flex justify-between items-baseline ${bold ? "font-bold text-base pt-1.5 border-t border-border" : "text-xs"} ${muted ? "text-muted-foreground" : ""} ${accent === "success" ? "text-success font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
function PayBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}>
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}
