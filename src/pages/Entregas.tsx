import { useEffect, useMemo, useState } from "react";
import {
  MapPin, Navigation, Phone, CheckCircle2, Truck, MessageCircle,
  X, Send, Route as RouteIcon, AlertTriangle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";

type Mensagem = { hora: string; texto: string; enviado: boolean };
type StatusEntrega = "aguardando" | "em rota" | "concluída" | "problema";
type PedidoEntrega = {
  id: string;
  cliente: string;
  telefone: string;
  pet: string;
  bairro: string;
  total: number;
  hora: string;
  status: "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";
  observacao?: string;
};
type EntregaAtiva = {
  id: string; cliente: string; telefone: string;
  endereco: string; bairro: string; eta: string;
  status: StatusEntrega; pedido: string; total: number;
  itens: string[]; ordem: number;
  historicoMensagens: Mensagem[];
};

const entregasIniciais: EntregaAtiva[] = [];

const ETAS = ["15 min", "30 min", "50 min", "1h 10min", "1h 30min", "1h 50min"];
const POSITIONS = [
  { top: "20%", left: "25%" }, { top: "55%", left: "55%" },
  { top: "35%", left: "70%" }, { top: "70%", left: "25%" },
  { top: "45%", left: "40%" }, { top: "25%", left: "60%" },
];

const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const primeiroNome = (n: string) => n.split(" ")[0];
const waOpen = (tel: string, msg: string) =>
  window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`, "_blank");

export function Entregas() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [rotaConfigurada, setRotaConfigurada] = useState(false);
  const [listaEntregas, setListaEntregas] = useState<EntregaAtiva[]>(entregasIniciais);
  const [conversaAberta, setConversaAberta] = useState<EntregaAtiva | null>(null);
  const [avisoAberto, setAvisoAberto] = useState<EntregaAtiva | null>(null);
  const [avisoAuto, setAvisoAuto] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadEntregas() {
      const res = await fetch("/api/crm/pedidos", { cache: "no-store" });
      if (!alive) return;
      if (!res.ok) {
        setListaEntregas([]);
        return;
      }
      const pedidos = (await res.json()) as PedidoEntrega[];
      setListaEntregas(pedidos
        .filter((pedido) => pedido.status !== "cancelado" && pedido.status !== "entregue")
        .map((pedido, index) => ({
          id: pedido.id,
          cliente: pedido.cliente,
          telefone: pedido.telefone,
          endereco: pedido.bairro || "Endereco a confirmar",
          bairro: pedido.bairro || "A confirmar",
          eta: ETAS[index] ?? `${30 + index * 18}min`,
          status: pedido.status === "em rota" ? "em rota" : "aguardando",
          pedido: pedido.id,
          total: pedido.total,
          itens: [pedido.pet || pedido.observacao || "Pedido registrado"],
          ordem: index + 1,
          historicoMensagens: [],
        })));
    }
    void loadEntregas();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("avisos_auto") : null;
    if (v) setAvisoAuto(v === "1");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("avisos_auto", avisoAuto ? "1" : "0");
  }, [avisoAuto]);

  // Escape fecha drawer/modal
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (avisoAberto) setAvisoAberto(null);
      else if (conversaAberta) setConversaAberta(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [avisoAberto, conversaAberta]);

  // Sincroniza conversaAberta quando o objeto mudar na lista
  useEffect(() => {
    if (!conversaAberta) return;
    const atual = listaEntregas.find(e => e.id === conversaAberta.id);
    if (atual && atual !== conversaAberta) setConversaAberta(atual);
  }, [listaEntregas, conversaAberta]);

  const entregasOrdenadas = useMemo(
    () => [...listaEntregas].sort((a, b) => a.ordem - b.ordem),
    [listaEntregas],
  );

  const concluidas = listaEntregas.filter(e => e.status === "concluída").length;
  const distanciaTotal = listaEntregas.length * 4.5;
  const minutosTotal = listaEntregas.length * 18;
  const horas = Math.floor(minutosTotal / 60);
  const minutos = minutosTotal % 60;
  const tempoStr = horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
  const custoComb = distanciaTotal * 0.79;
  const receitaPrevista = listaEntregas.filter(e => e.status !== "concluída").reduce((s, e) => s + e.total, 0);

  const linkGoogleMapsRota = useMemo(() => {
    const paradas = entregasOrdenadas.map(e => `${e.endereco}, ${e.bairro}`);
    const all = [origem, ...paradas, destino].filter(Boolean).map(encodeURIComponent).join("/");
    return `https://www.google.com/maps/dir/${all}`;
  }, [origem, destino, entregasOrdenadas]);

  function otimizarRota() {
    const ordenadas = [...listaEntregas].sort((a, b) => a.bairro.localeCompare(b.bairro));
    const novas = ordenadas.map((e, i) => ({
      ...e, ordem: i + 1, eta: ETAS[i] ?? `${30 + i * 18}min`,
    }));
    setListaEntregas(novas);
    setRotaConfigurada(true);
    toast.success(`Rota otimizada! ${novas.length} paradas organizadas por bairro ✅`);
  }

  function marcarEntregue(e: EntregaAtiva) {
    const msg = `✅ Entrega concluída! Obrigado ${primeiroNome(e.cliente)}! Qualquer dúvida estamos aqui 🐾`;
    setListaEntregas(prev => prev.map(x => x.id === e.id ? {
      ...x, status: "concluída",
      historicoMensagens: [...x.historicoMensagens, { hora: horaAgora(), texto: msg, enviado: true }],
    } : x));
    waOpen(e.telefone, msg);
    toast.success(`Entrega ${e.id} concluída`);
  }

  function navegar(e: EntregaAtiva) {
    const dest = encodeURIComponent(`${e.endereco}, ${e.bairro}`);
    let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    if (e.ordem === 1 && origem) url += `&origin=${encodeURIComponent(origem)}`;
    window.open(url, "_blank");
  }

  function enviarAviso(e: EntregaAtiva, texto: string) {
    setListaEntregas(prev => prev.map(x => x.id === e.id ? {
      ...x, historicoMensagens: [...x.historicoMensagens, { hora: horaAgora(), texto, enviado: true }],
    } : x));
    waOpen(e.telefone, texto);
    setAvisoAberto(null);
    toast.success("Mensagem enviada no WhatsApp");
  }

  function iniciarRota() {
    if (!rotaConfigurada) {
      document.getElementById("config-rota")?.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("Configure a rota primeiro", { description: "Preencha origem e destino" });
      return;
    }
    window.open(linkGoogleMapsRota, "_blank");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Entregas de hoje</h1>
          <p className="text-sm text-muted-foreground">{listaEntregas.length} paradas · {concluidas} concluídas</p>
        </div>
        <button onClick={iniciarRota} className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2">
          <Navigation className="size-4" /> Iniciar rota
        </button>
      </div>

      {/* Configurar rota */}
      <div id="config-rota" className="card-soft p-5">
        {!rotaConfigurada ? (
          <>
            <h3 className="font-semibold mb-3 inline-flex items-center gap-2"><RouteIcon className="size-4" /> Configurar rota do dia</h3>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground mb-1 block">Ponto de partida</span>
                <input value={origem} onChange={e=>setOrigem(e.target.value)} placeholder="Loja — R. Principal, 100, Tijucas" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground mb-1 block">Ponto de chegada</span>
                <input value={destino} onChange={e=>setDestino(e.target.value)} placeholder="Voltar para loja" className="h-10 w-full px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30" />
              </label>
            </div>
            <button onClick={otimizarRota} className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2">
              <RouteIcon className="size-4" /> Otimizar rota
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <RouteIcon className="size-4 text-primary" />
              <span className="font-semibold">{origem || "Loja"}</span>
              <span className="text-muted-foreground">→ {listaEntregas.length} paradas →</span>
              <span className="font-semibold">{destino || "Loja"}</span>
            </div>
            <button onClick={()=>setRotaConfigurada(false)} className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold">Reconfigurar</button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {/* Mapa */}
          <div className="card-soft p-0 overflow-hidden">
            <div className="relative h-72 bg-gradient-to-br from-primary/15 via-secondary to-accent/10">
              <div className="absolute inset-0 grid place-items-center text-muted-foreground pointer-events-none">
                <div className="text-center">
                  <Truck className="size-10 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-semibold">Mapa da rota</p>
                  <p className="text-xs">{listaEntregas.length} paradas · ~{distanciaTotal.toFixed(0)} km · {tempoStr}</p>
                </div>
              </div>
              {entregasOrdenadas.map((e, i) => {
                const pos = POSITIONS[i % POSITIONS.length];
                return (
                  <button
                    key={e.id}
                    style={pos}
                    onClick={() => setConversaAberta(e)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 size-8 rounded-full bg-accent text-accent-foreground font-bold text-xs grid place-items-center shadow-lg ring-4 ring-background hover:scale-110 transition cursor-pointer"
                    title={`${e.cliente} · ${e.bairro}`}
                  >
                    {e.ordem}
                  </button>
                );
              })}
              <a
                href={linkGoogleMapsRota}
                target="_blank"
                rel="noreferrer"
                className="absolute top-3 right-3 h-9 px-3 rounded-lg bg-background text-xs font-semibold inline-flex items-center gap-1.5 shadow"
              >
                <ExternalLink className="size-3.5" /> Abrir no Google Maps
              </a>
            </div>
            <div className="px-4 py-3 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{distanciaTotal.toFixed(0)} km</strong> distância</span>
              <span><strong className="text-foreground">{tempoStr}</strong> estimado</span>
              <span><strong className="text-foreground">{custoComb.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong> combustível</span>
            </div>
          </div>

          {/* Lista entregas */}
          <div className="card-soft p-0 overflow-hidden">
            <div className="divide-y divide-border">
              {entregasOrdenadas.map((e) => {
                const isConcluida = e.status === "concluída";
                return (
                  <div key={e.id} className={`p-4 flex items-start gap-3 ${isConcluida ? "bg-success/5" : ""}`}>
                    <div className="size-9 rounded-full bg-accent text-accent-foreground font-bold text-sm grid place-items-center shrink-0">{e.ordem}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <button onClick={()=>setConversaAberta(e)} className="font-semibold hover:text-primary text-left">{e.cliente}</button>
                        <StatusBadge value={isConcluida ? "entregue" : e.status === "em rota" ? "em rota" : e.status === "problema" ? "cancelado" : "pago"} />
                      </div>
                      <div className={`text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ${isConcluida ? "line-through" : ""}`}>
                        <MapPin className="size-3" /> {e.endereco} · {e.bairro}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Pedido <span className="font-mono font-semibold text-foreground">{e.id}</span> · ETA {e.eta} · {e.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
                      </div>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <button onClick={()=>marcarEntregue(e)} disabled={isConcluida} className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                          <CheckCircle2 className="size-3.5" /> {isConcluida ? "Entregue" : "Marcar entregue"}
                        </button>
                        <button onClick={()=>setAvisoAberto(e)} className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                          <MessageCircle className="size-3.5" /> Avisar cliente
                        </button>
                        <button onClick={()=>navegar(e)} className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                          <Navigation className="size-3.5" /> Navegar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          <div className="card-soft p-5">
            <h3 className="font-semibold mb-3">Resumo da rota</h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Distância</span><span className="font-semibold">{distanciaTotal.toFixed(0)} km</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-semibold">{tempoStr}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Combustível</span><span className="font-semibold">{custoComb.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Receita prevista</span><span className="font-semibold text-success">{receitaPrevista.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></li>
            </ul>
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Entregas concluídas</span>
                <span className="font-semibold">{concluidas} de {listaEntregas.length}</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-success transition-all" style={{ width: `${listaEntregas.length ? (concluidas/listaEntregas.length)*100 : 0}%` }} />
              </div>
            </div>
          </div>

          <div className="card-soft p-5 bg-success/5 border-success/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-success uppercase">Mensagens automáticas</p>
              <button
                onClick={()=>setAvisoAuto(v=>!v)}
                className={`relative w-10 h-5 rounded-full transition ${avisoAuto ? "bg-success" : "bg-muted"}`}
                aria-pressed={avisoAuto}
              >
                <span className={`absolute top-0.5 size-4 bg-background rounded-full transition ${avisoAuto ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <p className="text-sm">
              {avisoAuto
                ? "Clientes serão avisados quando você marcar a entrega anterior como concluída ❤️"
                : "Ative para enviar avisos automáticos a cada etapa da rota."}
            </p>
          </div>
        </div>
      </div>

      {/* Modal de aviso rápido */}
      {avisoAberto && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60" onClick={()=>setAvisoAberto(null)}>
          <div className="card-soft bg-background w-full max-w-md p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Avisar {primeiroNome(avisoAberto.cliente)}</h3>
              <button onClick={()=>setAvisoAberto(null)} className="size-8 rounded-lg grid place-items-center hover:bg-secondary"><X className="size-4" /></button>
            </div>
            <div className="space-y-2.5">
              {[
                { titulo: "Saindo agora 🚗", msg: `Olá ${primeiroNome(avisoAberto.cliente)}! Estou saindo agora para sua entrega. Chego em aproximadamente ${avisoAberto.eta} 🐾` },
                { titulo: "Chegando em 10 min ⏰", msg: `Olá ${primeiroNome(avisoAberto.cliente)}! Estou a 10 minutinhos aí! Pode deixar alguém para receber? 🚗` },
                { titulo: "Problema na entrega ⚠️", msg: `Olá ${primeiroNome(avisoAberto.cliente)}! Tivemos um imprevisto na entrega do seu pedido. Vou te ligar em breve para alinhar, ok?` },
              ].map(opt => (
                <div key={opt.titulo} className="rounded-xl border border-border p-3">
                  <div className="text-sm font-semibold mb-1">{opt.titulo}</div>
                  <p className="text-xs text-muted-foreground mb-2">{opt.msg}</p>
                  <button onClick={()=>enviarAviso(avisoAberto, opt.msg)} className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-bold inline-flex items-center gap-1.5">
                    <Send className="size-3.5" /> Enviar no WhatsApp
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drawer conversa */}
      {conversaAberta && (
        <ConversaDrawer
          entrega={conversaAberta}
          onClose={()=>setConversaAberta(null)}
          onEnviar={(texto) => {
            setListaEntregas(prev => prev.map(x => x.id === conversaAberta.id ? {
              ...x, historicoMensagens: [...x.historicoMensagens, { hora: horaAgora(), texto, enviado: true }],
            } : x));
            waOpen(conversaAberta.telefone, texto);
          }}
          onNavegar={()=>navegar(conversaAberta)}
        />
      )}
    </div>
  );
}

function ConversaDrawer({ entrega, onClose, onEnviar, onNavegar }: {
  entrega: EntregaAtiva; onClose: () => void; onEnviar: (t: string) => void; onNavegar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const rapidas = ["Saindo agora 🚗", "Chegando em 10 min ⏰", "Pedido separado ✅"];

  function enviar() {
    if (!texto.trim()) return;
    onEnviar(texto.trim());
    setTexto("");
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[400px] bg-background border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold truncate">{entrega.cliente}</div>
              <div className="text-xs text-muted-foreground font-mono">{entrega.pedido}</div>
            </div>
            <button onClick={onClose} className="size-8 rounded-lg grid place-items-center hover:bg-secondary shrink-0"><X className="size-4" /></button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge value={entrega.status === "concluída" ? "entregue" : entrega.status === "em rota" ? "em rota" : entrega.status === "problema" ? "cancelado" : "pago"} />
            <a href={`tel:+55${entrega.telefone}`} className="h-8 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-1.5"><Phone className="size-3.5" /> Ligar</a>
            <button onClick={()=>waOpen(entrega.telefone, "")} className="h-8 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" /> WhatsApp</button>
          </div>
        </div>

        {/* Info entrega */}
        <div className="p-4 border-b border-border space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{entrega.endereco} · {entrega.bairro}</span>
          </div>
          <div className="text-xs text-muted-foreground">ETA: <span className="font-semibold text-foreground">{entrega.eta}</span></div>
          <ul className="text-xs text-muted-foreground list-disc list-inside">
            {entrega.itens.map(i => <li key={i}>{i}</li>)}
          </ul>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-bold">{entrega.total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span>
          </div>
          <button onClick={onNavegar} className="w-full h-9 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-1.5">
            <Navigation className="size-3.5" /> Navegar até o cliente
          </button>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-secondary/30">
          {entrega.historicoMensagens.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">
              <AlertTriangle className="size-5 mx-auto mb-2 opacity-50" />
              Nenhuma mensagem ainda
            </div>
          )}
          {entrega.historicoMensagens.map((m, i) => (
            <div key={i} className={`flex ${m.enviado ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.enviado ? "bg-success text-success-foreground rounded-br-sm" : "bg-background rounded-bl-sm border border-border"}`}>
                <div>{m.texto}</div>
                <div className={`text-[10px] mt-1 ${m.enviado ? "text-success-foreground/70" : "text-muted-foreground"} text-right`}>{m.hora}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {rapidas.map(r => (
              <button key={r} onClick={()=>setTexto(r)} className="h-7 px-2.5 rounded-full bg-secondary text-[11px] font-medium hover:bg-accent hover:text-accent-foreground">
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={texto}
              onChange={e=>setTexto(e.target.value)}
              onKeyDown={e=>{ if (e.key === "Enter") enviar(); }}
              placeholder="Escreva uma mensagem..."
              className="flex-1 h-10 px-3 rounded-lg bg-secondary outline-none focus:ring-2 ring-primary/30 text-sm"
            />
            <button onClick={enviar} className="h-10 px-4 rounded-lg bg-success text-success-foreground text-sm font-bold inline-flex items-center gap-1.5">
              <Send className="size-4" /> Enviar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
