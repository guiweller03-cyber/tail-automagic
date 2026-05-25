import { recomprasPrevistas, produtosPrevistos, demandaBairros, iaRecompraAlertas, type RecompraPrevista, type RecompraStatus, type ComportamentoIA, type TendenciaIA } from "@/lib/mock";
import { useMemo, useState } from "react";
import {
  MessageCircle, ShoppingBag, Bell, CheckCheck, ArrowRightLeft,
  AlertTriangle, TrendingUp, Search, MapPin, Sparkles,
  Package, BarChart3, Boxes, Target, Users, Flame,
  Brain, Activity, Lock, LockOpen, X, TrendingDown, Minus, Settings2,
  Truck, Map as MapIcon, ShoppingCart,
} from "lucide-react";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusMap: Record<RecompraStatus, { label: string; cls: string; dot: string }> = {
  ok:        { label: "OK",       cls: "bg-success/10 text-success border-success/30",         dot: "bg-success" },
  semana:    { label: "Semana",   cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",   dot: "bg-amber-500" },
  urgente:   { label: "Urgente",  cls: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
  atrasado:  { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/40", dot: "bg-destructive" },
};

type Filtro =
  | "Todos" | "Hoje" | "3 dias" | "7 dias" | "15 dias" | "Atrasados"
  | "VIP" | "Premium" | "Econômico" | "Cachorro" | "Gato";

const filtros: Filtro[] = [
  "Todos", "Hoje", "3 dias", "7 dias", "15 dias", "Atrasados",
  "VIP", "Premium", "Econômico", "Cachorro", "Gato",
];

export function RecompraPrevista() {
  const [items, setItems] = useState<RecompraPrevista[]>(recomprasPrevistas);
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");
  const [cidade, setCidade] = useState("Todas");
  const [bairro, setBairro] = useState("Todos");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [semana, setSemana] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 = todas
  const [showConfig, setShowConfig] = useState(false);
  const [iaConfig, setIaConfig] = useState({
    sensibilidade: 70,
    minCompras: 3,
    pesoRecente: 60,
    ajusteAuto: true,
  });

  const cidades = useMemo(() => ["Todas", ...Array.from(new Set(items.map((r) => r.cidade)))], [items]);
  const bairros = useMemo(() => ["Todos", ...Array.from(new Set(items.map((r) => r.bairro)))], [items]);

  const filtrados = useMemo(() => {
    return items.filter((r) => {
      if (busca && !`${r.cliente} ${r.pet} ${r.racao}`.toLowerCase().includes(busca.toLowerCase())) return false;
      if (cidade !== "Todas" && r.cidade !== cidade) return false;
      if (bairro !== "Todos" && r.bairro !== bairro) return false;
      switch (filtro) {
        case "Hoje":      return r.diasRestantes <= 0 && r.diasRestantes >= -1;
        case "3 dias":    return r.diasRestantes >= 0 && r.diasRestantes <= 3;
        case "7 dias":    return r.diasRestantes >= 0 && r.diasRestantes <= 7;
        case "15 dias":   return r.diasRestantes >= 0 && r.diasRestantes <= 15;
        case "Atrasados": return r.diasRestantes < 0;
        case "VIP":       return r.perfil === "VIP";
        case "Premium":   return r.perfil === "Premium";
        case "Econômico": return r.perfil === "Econômico";
        case "Cachorro":  return r.especie === "cachorro";
        case "Gato":      return r.especie === "gato";
        default:          return true;
      }
    });
  }, [items, filtro, busca, cidade, bairro]);

  // KPIs do topo
  const valorPrevistoProdutos = produtosPrevistos.reduce(
    (s, p) => s + p.unidadesPrevistas * p.precoUnit * (p.taxaRecompra / 100), 0
  );
  const clientesEmRecompra = items.length;
  const taxaPrevista = Math.round(
    produtosPrevistos.reduce((s, p) => s + p.taxaRecompra, 0) / produtosPrevistos.length
  );
  const atrasados = items.filter((r) => r.diasRestantes < 0).length;
  const urgentes = items.filter((r) => r.diasRestantes >= 0 && r.diasRestantes <= 3).length;

  const maxUnidades = Math.max(...produtosPrevistos.map((p) => p.unidadesPrevistas));

  function marcarContatado(id: string) {
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, contatado: !r.contatado } : r)));
  }
  function toggleTravado(id: string) {
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, travado: !r.travado } : r)));
  }

  // ── IA stats ──
  const antecipando = items.filter((r) => r.comportamento === "antecipado").length;
  const atrasando   = items.filter((r) => r.comportamento === "atrasado").length;
  const instaveis   = items.filter((r) => r.comportamento === "instavel").length;
  const previsiveis = items.filter((r) => r.precisaoIA >= 85).length;
  const precisaoMedia = Math.round(items.reduce((s, r) => s + r.precisaoIA, 0) / items.length);

  const drawerItem = items.find((i) => i.id === drawerId) || null;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="size-6 text-primary" /> Recompra Prevista
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Painel de vendas futuras · previsão de produtos, estoque e clientes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig((v) => !v)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold hover:bg-secondary/70"
          >
            <Settings2 className="size-3.5" /> Config IA
          </button>
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
            <Sparkles className="size-3.5" /> Disparar todos via IA
          </button>
        </div>
      </div>

      {/* RESUMO SUPERIOR */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label="Valor previsto"
          value={brl(valorPrevistoProdutos)}
          sub="próximas recompras"
          tone="primary"
        />
        <Kpi
          icon={<Users className="size-4" />}
          label="Clientes em recompra"
          value={String(clientesEmRecompra)}
          sub="ativos no funil"
        />
        <Kpi
          icon={<Target className="size-4" />}
          label="Taxa prevista"
          value={`${taxaPrevista}%`}
          sub="histórico + comportamento"
          tone="success"
        />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          label="Atrasados"
          value={String(atrasados)}
          sub="ação urgente"
          tone="destructive"
        />
        <Kpi
          icon={<Flame className="size-4" />}
          label="Urgentes"
          value={String(urgentes)}
          sub="próx. 3 dias"
          tone="amber"
        />
      </div>

      {/* IA ADAPTATIVA — DASHBOARD */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
            <Brain className="size-4 text-accent" /> IA adaptativa por cliente
          </h2>
          <span className="text-[11px] text-muted-foreground">
            aprende o ciclo real de cada cliente · ajustes automáticos
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={<TrendingUp className="size-4" />} label="Antecipando"      value={String(antecipando)} sub="recompra mais cedo" tone="success" />
          <Kpi icon={<TrendingDown className="size-4" />} label="Atrasando"       value={String(atrasando)}   sub="ciclo aumentando"   tone="destructive" />
          <Kpi icon={<Activity className="size-4" />} label="Instáveis"           value={String(instaveis)}   sub="padrão irregular"   tone="amber" />
          <Kpi icon={<Target className="size-4" />} label="Altamente previsíveis" value={String(previsiveis)} sub="precisão ≥ 85%"     tone="primary" />
          <Kpi icon={<Brain className="size-4" />} label="Precisão IA média"      value={`${precisaoMedia}%`} sub="todos os clientes"  tone="primary" />
        </div>

        {/* Alertas IA */}
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="size-3 text-accent" /> Alertas da IA
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {iaRecompraAlertas.map((a, i) => {
              const tone =
                a.tipo === "antecipou"  ? "border-success/30 bg-success/5 text-success" :
                a.tipo === "atrasou"    ? "border-destructive/30 bg-destructive/5 text-destructive" :
                a.tipo === "instavel"   ? "border-amber-500/30 bg-amber-500/5 text-amber-600" :
                                          "border-primary/30 bg-primary/5 text-primary";
              return (
                <div key={i} className={`rounded-lg border px-3 py-2 text-[11px] flex items-start gap-2 ${tone}`}>
                  <Sparkles className="size-3.5 shrink-0 mt-0.5" />
                  <div className="text-foreground/90">
                    <b>{a.cliente}</b> <span className="opacity-80">{a.msg}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showConfig && (
          <div className="card-soft p-4 space-y-3 border border-accent/30">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-2">
                <Settings2 className="size-4 text-accent" /> Configurações da IA de recompra
              </div>
              <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ConfigSlider label="Sensibilidade do aprendizado" value={iaConfig.sensibilidade} onChange={(v) => setIaConfig({ ...iaConfig, sensibilidade: v })} hint="quão rápido a IA muda a previsão" />
              <ConfigSlider label="Peso do histórico recente"    value={iaConfig.pesoRecente}    onChange={(v) => setIaConfig({ ...iaConfig, pesoRecente: v })}    hint="prioriza últimas compras vs média geral" />
              <ConfigNumber label="Mínimo de compras p/ aprender" value={iaConfig.minCompras} onChange={(v) => setIaConfig({ ...iaConfig, minCompras: v })} />
              <label className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold">Ajuste automático</div>
                  <div className="text-[10px] text-muted-foreground">aplicar correção sem confirmação</div>
                </div>
                <input
                  type="checkbox"
                  checked={iaConfig.ajusteAuto}
                  onChange={(e) => setIaConfig({ ...iaConfig, ajusteAuto: e.target.checked })}
                  className="size-4 accent-accent"
                />
              </label>
            </div>
          </div>
        )}
      </section>


      {/* PRODUTOS PREVISTOS — PAINEL OPERACIONAL */}
      <PrevisaoProdutos semana={semana} setSemana={setSemana} />

      {/* LOGÍSTICA + COMPRAS */}
      <PrevisaoLogistica semana={semana} />

      {/* AUTOMAÇÕES POR CATEGORIA DE PRODUTO */}
      <AutomacoesCategoria />

      {/* FILTROS */}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Users className="size-4 text-primary" /> Clientes em recompra
        </h2>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, pet ou ração..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
          <select value={cidade} onChange={(e) => setCidade(e.target.value)}
            className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold outline-none">
            {cidades.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={bairro} onChange={(e) => setBairro(e.target.value)}
            className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold outline-none">
            {bairros.map((b) => <option key={b}>{b}</option>)}
          </select>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filtros.map((f) => {
              const on = filtro === f;
              return (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    on ? "bg-foreground text-background border-foreground"
                       : "bg-card border-border hover:border-foreground/30"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabela */}
        <div className="card-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                  <th className="text-left font-semibold px-3 py-2.5">Cliente</th>
                  <th className="text-left font-semibold px-3 py-2.5">Pet</th>
                  <th className="text-left font-semibold px-3 py-2.5">Ração atual</th>
                  <th className="text-center font-semibold px-3 py-2.5" title="Média real do cliente">Média IA</th>
                  <th className="text-left font-semibold px-3 py-2.5">Comportamento</th>
                  <th className="text-center font-semibold px-3 py-2.5">Precisão</th>
                  <th className="text-left font-semibold px-3 py-2.5">Tendência</th>
                  <th className="text-center font-semibold px-3 py-2.5">Dias</th>
                  <th className="text-left font-semibold px-3 py-2.5">Prevista</th>
                  <th className="text-right font-semibold px-3 py-2.5">Estimado</th>
                  <th className="text-center font-semibold px-3 py-2.5">Status</th>
                  <th className="text-right font-semibold px-3 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const st = statusMap[r.status];
                  const wpp = `https://wa.me/55${r.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Oi ${r.cliente.split(" ")[0]}! 🐾 A ${r.racao} do ${r.pet} deve estar acabando essa semana. Posso já separar?`
                  )}`;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setDrawerId(r.id)}
                      className={`border-t border-border hover:bg-secondary/40 transition cursor-pointer ${
                        r.contatado ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-xs">{r.cliente}</div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3" /> {r.cidade} · {r.bairro}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <SpeciePill especie={r.especie} compact />
                          <span className="font-semibold text-xs">{r.pet}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.racao}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          última {r.ultimaCompra} · {(r.consumoDiaKg * 1000).toFixed(0)}g/dia
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="font-bold text-sm tabular-nums">{r.mediaRecompra}d</div>
                        <div className="text-[10px] text-muted-foreground">base {r.previsaoBase}d</div>
                      </td>
                      <td className="px-3 py-3"><ComportamentoPill c={r.comportamento} /></td>
                      <td className="px-3 py-3">
                        <PrecisaoBar v={r.precisaoIA} />
                      </td>
                      <td className="px-3 py-3"><TendenciaPill t={r.tendencia} /></td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold text-sm ${
                          r.diasRestantes < 0 ? "text-destructive" :
                          r.diasRestantes <= 3 ? "text-destructive" :
                          r.diasRestantes <= 7 ? "text-amber-600" : "text-foreground"
                        }`}>
                          {r.diasRestantes < 0 ? `${Math.abs(r.diasRestantes)}d atraso` : `${r.diasRestantes}d`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          {r.dataPrevista}
                          {r.travado && <Lock className="size-3 text-accent" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-xs">{brl(r.valorEstimado)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border ${st.cls}`}>
                          <span className={`size-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={wpp} target="_blank" rel="noreferrer"
                            title="Abrir WhatsApp"
                            className="size-8 grid place-items-center rounded-lg bg-success/15 text-success hover:bg-success/25 transition"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                          <button title="Gerar pedido" className="size-8 grid place-items-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition">
                            <ShoppingBag className="size-4" />
                          </button>
                          <button title="Lembrete IA" className="size-8 grid place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition">
                            <Sparkles className="size-4" />
                          </button>
                          <button title="Follow-up" className="size-8 grid place-items-center rounded-lg bg-secondary hover:bg-secondary/70 transition">
                            <Bell className="size-4" />
                          </button>
                          <button
                            title={r.travado ? "Destravar previsão" : "Travar previsão"}
                            onClick={() => toggleTravado(r.id)}
                            className={`size-8 grid place-items-center rounded-lg transition ${
                              r.travado ? "bg-accent text-accent-foreground" : "bg-secondary hover:bg-secondary/70"
                            }`}
                          >
                            {r.travado ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
                          </button>
                          <button
                            title="Marcar contatado"
                            onClick={() => marcarContatado(r.id)}
                            className={`size-8 grid place-items-center rounded-lg transition ${
                              r.contatado
                                ? "bg-success text-success-foreground"
                                : "bg-secondary hover:bg-secondary/70"
                            }`}
                          >
                            <CheckCheck className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Nenhum cliente neste filtro.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {drawerItem && <ClienteDrawer item={drawerItem} onClose={() => setDrawerId(null)} />}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone?: "primary" | "success" | "destructive" | "amber";
}) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
        <span className={toneCls}>{icon}</span> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: "success" | "danger" }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-xs mt-0.5 ${
        accent === "success" ? "text-success" : accent === "danger" ? "text-destructive" : ""
      }`}>{value}</div>
    </div>
  );
}

function ConfigSlider({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>{label}</span><span className="tabular-nums text-accent">{value}%</span>
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mb-1.5">{hint}</div>}
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-accent" />
    </div>
  );
}

function ConfigNumber({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2.5">
      <div className="text-xs font-semibold">{label}</div>
      <input type="number" min={1} max={20} value={value} onChange={(e) => onChange(+e.target.value)}
        className="w-16 h-7 px-2 rounded-md bg-background text-xs font-bold text-right outline-none ring-1 ring-border focus:ring-accent" />
    </label>
  );
}

function ComportamentoPill({ c }: { c: ComportamentoIA }) {
  const map: Record<ComportamentoIA, { label: string; cls: string; icon: React.ReactNode }> = {
    antecipado: { label: "Antecipado", cls: "bg-success/15 text-success border-success/30",       icon: <TrendingUp className="size-3" /> },
    pontual:    { label: "Pontual",    cls: "bg-primary/15 text-primary border-primary/30",       icon: <Target className="size-3" /> },
    atrasado:   { label: "Atrasado",   cls: "bg-destructive/15 text-destructive border-destructive/30", icon: <TrendingDown className="size-3" /> },
    instavel:   { label: "Instável",   cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: <Activity className="size-3" /> },
  };
  const x = map[c];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${x.cls}`}>
      {x.icon}{x.label}
    </span>
  );
}

function TendenciaPill({ t }: { t: TendenciaIA }) {
  const map: Record<TendenciaIA, { label: string; cls: string; icon: React.ReactNode }> = {
    acelerando:    { label: "Comprando antes",   cls: "text-success",      icon: <TrendingUp className="size-3" /> },
    estavel:       { label: "Estável",            cls: "text-muted-foreground", icon: <Minus className="size-3" /> },
    desacelerando: { label: "Comprando depois",  cls: "text-destructive",  icon: <TrendingDown className="size-3" /> },
  };
  const x = map[t];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${x.cls}`}>
      {x.icon}{x.label}
    </span>
  );
}

function PrecisaoBar({ v }: { v: number }) {
  const tone = v >= 85 ? "bg-success" : v >= 70 ? "bg-primary" : v >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="flex items-center gap-1.5 min-w-[70px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums">{v}%</span>
    </div>
  );
}

function ClienteDrawer({ item, onClose }: { item: RecompraPrevista; onClose: () => void }) {
  const hist = item.historicoDias;
  const max = Math.max(...hist);
  const min = Math.min(...hist);
  const delta = hist.length > 1 ? hist[hist.length - 1] - hist[0] : 0;
  const insight =
    delta < -1 ? "Consumo aumentando · ciclo encurtando" :
    delta > 1  ? "Consumo diminuindo · ciclo aumentando" :
                 "Padrão estável · alta previsibilidade";
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-md bg-card border-l border-border shadow-2xl overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Brain className="size-3 text-accent" /> Perfil IA · {item.pet}
            </div>
            <h3 className="text-lg font-bold mt-0.5">{item.cliente}</h3>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="size-3" /> {item.cidade} · {item.bairro}
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg bg-secondary hover:bg-secondary/70">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Mini label="Média real" value={`${item.mediaRecompra}d`} accent="success" />
          <Mini label="Previsão base" value={`${item.previsaoBase}d`} />
          <Mini label="Precisão IA" value={`${item.precisaoIA}%`} accent={item.precisaoIA >= 85 ? "success" : undefined} />
          <Mini label="Compras analisadas" value={`${item.historicoDias.length}`} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ComportamentoPill c={item.comportamento} />
          <TendenciaPill t={item.tendencia} />
          {item.travado && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border border-accent/30 bg-accent/10 text-accent">
              <Lock className="size-3" /> Travado
            </span>
          )}
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5 text-[11px] flex items-start gap-2">
          <Sparkles className="size-3.5 text-accent shrink-0 mt-0.5" />
          <div><b className="text-accent">IA:</b> {insight}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2">Histórico de ciclos</div>
          <div className="space-y-1.5">
            {hist.map((d, i) => {
              const w = ((d - min) / Math.max(1, max - min)) * 100;
              const isLast = i === hist.length - 1;
              return (
                <div key={i} className="grid grid-cols-[60px_1fr_40px] items-center gap-2">
                  <div className="text-[11px] text-muted-foreground">Compra {i + 1}</div>
                  <div className="h-5 rounded-md bg-secondary/60 overflow-hidden">
                    <div className={`h-full ${isLast ? "bg-gradient-to-r from-primary to-accent" : "bg-primary/40"}`} style={{ width: `${30 + w * 0.7}%` }} />
                  </div>
                  <div className="text-[11px] font-bold text-right tabular-nums">{d}d</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">
            mín {min}d · máx {max}d · variação {max - min}d
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2">Próxima recompra</div>
          <div className="rounded-lg bg-secondary/60 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Previsão ajustada IA</div>
              <div className="text-lg font-bold">{item.dataPrevista}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Estimado</div>
              <div className="text-lg font-bold text-success">{item.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="h-9 rounded-lg bg-success/15 text-success text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-success/25">
            <MessageCircle className="size-3.5" /> WhatsApp
          </button>
          <button className="h-9 rounded-lg bg-primary/15 text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-primary/25">
            <ShoppingBag className="size-3.5" /> Gerar pedido
          </button>
          <button className="h-9 rounded-lg bg-accent/15 text-accent text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-accent/25">
            <Sparkles className="size-3.5" /> Lembrete IA
          </button>
          <button className="h-9 rounded-lg bg-secondary text-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70">
            <Bell className="size-3.5" /> Follow-up
          </button>
        </div>
      </div>
    </div>
  );
}


export function SpeciePill({ especie, compact }: { especie: "cachorro" | "gato"; compact?: boolean }) {
  const isDog = especie === "cachorro";
  const cls = isDog
    ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"
    : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}>
      {isDog ? "🐶" : "🐱"} {!compact && (isDog ? "Cachorro" : "Gato")}
    </span>
  );
}

// ───────────────────────── PRODUTOS PREVISTOS ─────────────────────────
const SEMANAS = ["Todas semanas", "Semana 1", "Semana 2", "Semana 3", "Semana 4"] as const;

function brl2(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function unidadesNaSemana(p: typeof produtosPrevistos[number], s: 0 | 1 | 2 | 3 | 4) {
  return s === 0 ? p.semanas.reduce((a, b) => a + b, 0) : p.semanas[s - 1];
}

function PrevisaoProdutos({ semana, setSemana }: { semana: 0 | 1 | 2 | 3 | 4; setSemana: (s: 0 | 1 | 2 | 3 | 4) => void }) {
  const totals = useMemo(() => {
    let unidades = 0, receita = 0, custo = 0, necessario = 0;
    produtosPrevistos.forEach((p) => {
      const u = unidadesNaSemana(p, semana);
      unidades += u;
      receita  += u * p.precoUnit * (p.taxaRecompra / 100);
      custo    += u * p.custoUnit;
      const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
      necessario += Math.max(0, u - livre);
    });
    return { unidades, receita, margem: receita - custo, necessario };
  }, [semana]);

  const rupturas = produtosPrevistos.filter((p) => p.rupturaSemana && (semana === 0 || p.rupturaSemana <= semana));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Package className="size-4 text-primary" /> Previsão por semana — produtos
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SEMANAS.map((label, i) => {
            const on = semana === i;
            return (
              <button key={label} onClick={() => setSemana(i as 0 | 1 | 2 | 3 | 4)}
                className={`px-3 h-8 rounded-full text-[11px] font-bold border transition ${
                  on ? "bg-primary text-primary-foreground border-primary"
                     : "bg-card border-border hover:border-foreground/30"
                }`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs do período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Boxes className="size-4" />}        label="Unidades previstas" value={`${totals.unidades} un`} sub={semana === 0 ? "4 semanas" : `Semana ${semana}`} tone="primary" />
        <Kpi icon={<TrendingUp className="size-4" />}   label="Receita prevista"   value={brl2(totals.receita)}    sub="recompra ponderada"                                tone="success" />
        <Kpi icon={<Target className="size-4" />}       label="Margem prevista"    value={brl2(totals.margem)}     sub="receita − custo"                                   tone="success" />
        <Kpi icon={<ShoppingCart className="size-4" />} label="Estoque a comprar"  value={`+${totals.necessario}`} sub="cobrir o período"                                  tone="destructive" />
      </div>

      {/* Alertas logísticos */}
      {rupturas.length > 0 && (
        <div className="card-soft p-3">
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="size-3 text-destructive" /> Alertas logísticos da IA
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {rupturas.map((p) => (
              <div key={p.id} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] flex items-start gap-2">
                <AlertTriangle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                <div><b className="text-destructive">{p.nome}</b> · pode faltar antes da semana {p.rupturaSemana}</div>
              </div>
            ))}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] flex items-start gap-2">
              <Truck className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div><b className="text-amber-600">Bairro Rau</b> · alta concentração de entregas previstas</div>
            </div>
          </div>
        </div>
      )}

      {/* TABELA COMPLETA */}
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                <th className="text-left   font-semibold px-3 py-2.5">Produto</th>
                <th className="text-left   font-semibold px-3 py-2.5">Categoria</th>
                <th className="text-center font-semibold px-3 py-2.5">S1</th>
                <th className="text-center font-semibold px-3 py-2.5">S2</th>
                <th className="text-center font-semibold px-3 py-2.5">S3</th>
                <th className="text-center font-semibold px-3 py-2.5">S4</th>
                <th className="text-center font-semibold px-3 py-2.5">Total</th>
                <th className="text-center font-semibold px-3 py-2.5">Estoque</th>
                <th className="text-center font-semibold px-3 py-2.5">Reservado</th>
                <th className="text-center font-semibold px-3 py-2.5">Necessário</th>
                <th className="text-left   font-semibold px-3 py-2.5">Ruptura</th>
                <th className="text-right  font-semibold px-3 py-2.5">Receita</th>
                <th className="text-right  font-semibold px-3 py-2.5">Margem</th>
                <th className="text-center font-semibold px-3 py-2.5">Recompra</th>
              </tr>
            </thead>
            <tbody>
              {produtosPrevistos.map((p) => {
                const total = unidadesNaSemana(p, semana);
                const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
                const necessario = Math.max(0, total - livre);
                const receita = total * p.precoUnit * (p.taxaRecompra / 100);
                const margem = total * (p.precoUnit - p.custoUnit) * (p.taxaRecompra / 100);
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-3 py-3 text-xs font-semibold">{p.nome}</td>
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">{p.categoria}</td>
                    {p.semanas.map((u, i) => (
                      <td key={i} className={`px-3 py-3 text-center text-xs tabular-nums ${semana === i + 1 ? "font-bold text-primary" : ""}`}>{u}</td>
                    ))}
                    <td className="px-3 py-3 text-center text-xs font-bold tabular-nums">{total}</td>
                    <td className="px-3 py-3 text-center text-xs tabular-nums">{p.estoqueAtual}</td>
                    <td className="px-3 py-3 text-center text-xs tabular-nums text-muted-foreground">{p.estoqueReservado}</td>
                    <td className="px-3 py-3 text-center">
                      {necessario > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-destructive/15 text-destructive">+{necessario}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">ok</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[11px]">
                      {p.rupturaSemana ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                          <AlertTriangle className="size-3" /> S{p.rupturaSemana}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-bold text-success tabular-nums">{brl2(receita)}</td>
                    <td className="px-3 py-3 text-right text-xs tabular-nums">{brl2(margem)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-success/15 text-success">{p.taxaRecompra}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* GRÁFICO BARRAS POR SEMANA + SUGESTÃO COMPRA */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="card-soft p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> Demanda por semana
            </h3>
            <span className="text-[11px] text-muted-foreground">unidades previstas</span>
          </div>
          <DemandaSemanas />
        </div>

        <div className="card-soft p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" /> Sugestão de compra · fornecedor
            </h3>
          </div>
          <div className="space-y-2">
            {produtosPrevistos
              .map((p) => {
                const total = unidadesNaSemana(p, semana);
                const livre = Math.max(0, p.estoqueAtual - p.estoqueReservado);
                return { p, faltam: Math.max(0, total - livre) };
              })
              .filter((x) => x.faltam > 0)
              .sort((a, b) => b.faltam - a.faltam)
              .map(({ p, faltam }) => (
                <div key={p.id} className="rounded-lg border border-border p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{p.nome}</div>
                    <div className="text-[10px] text-muted-foreground">custo unit {brl2(p.custoUnit)} · total {brl2(faltam * p.custoUnit)}</div>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-md bg-primary/15 text-primary">+{faltam}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DemandaSemanas() {
  const totals: [number, number, number, number] = [0, 0, 0, 0];
  produtosPrevistos.forEach((p) => p.semanas.forEach((u, i) => (totals[i] += u)));
  const max = Math.max(...totals);
  return (
    <div className="space-y-2">
      {totals.map((u, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_44px] items-center gap-2">
          <div className="text-xs font-medium">Semana {i + 1}</div>
          <div className="h-6 rounded-md bg-secondary/60 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${(u / max) * 100}%` }} />
          </div>
          <div className="text-xs font-bold text-right tabular-nums">{u}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── LOGÍSTICA / DEMANDA ─────────────────────────
function PrevisaoLogistica({ semana }: { semana: 0 | 1 | 2 | 3 | 4 }) {
  const bairros = useMemo(() => {
    return demandaBairros
      .map((b) => {
        const entregas = semana === 0 ? b.entregasPrevistas : b.semanas[semana - 1];
        return { ...b, entregas, faturamento: entregas * b.ticketMedio };
      })
      .sort((a, b) => b.entregas - a.entregas);
  }, [semana]);

  const totalEntregas = bairros.reduce((s, b) => s + b.entregas, 0);
  const totalFat = bairros.reduce((s, b) => s + b.faturamento, 0);
  const ticketMed = totalEntregas ? Math.round(totalFat / totalEntregas) : 0;
  const max = Math.max(...bairros.map((b) => b.entregas), 1);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
        <Truck className="size-4 text-primary" /> Previsão de entregas e demanda por bairro
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Truck className="size-4" />}      label="Entregas previstas"  value={String(totalEntregas)} sub={semana === 0 ? "4 semanas" : `Semana ${semana}`} tone="primary" />
        <Kpi icon={<MapIcon className="size-4" />}    label="Bairros ativos"      value={String(bairros.filter((b) => b.entregas > 0).length)} sub="com pedidos previstos" />
        <Kpi icon={<Target className="size-4" />}     label="Ticket médio"        value={brl2(ticketMed)} sub="esperado no período" />
        <Kpi icon={<TrendingUp className="size-4" />} label="Faturamento previsto" value={brl2(totalFat)} sub="entregas × ticket" tone="success" />
      </div>

      <div className="card-soft p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <MapIcon className="size-4 text-primary" /> Mapa de demanda por bairro
          </h3>
          <span className="text-[11px] text-muted-foreground">entregas previstas</span>
        </div>
        <div className="space-y-2">
          {bairros.map((b) => (
            <div key={b.bairro} className="grid grid-cols-[170px_1fr_60px_90px] items-center gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{b.bairro}</div>
                <div className="text-[10px] text-muted-foreground truncate">{b.cidade}</div>
              </div>
              <div className="h-6 rounded-md bg-secondary/60 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${(b.entregas / max) * 100}%` }} />
              </div>
              <div className="text-xs font-bold text-right tabular-nums">{b.entregas}</div>
              <div className="text-[11px] font-semibold text-success text-right tabular-nums">{brl2(b.faturamento)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
