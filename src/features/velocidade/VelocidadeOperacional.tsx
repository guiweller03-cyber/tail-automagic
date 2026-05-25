import { useMemo, useState } from "react";
import {
  Bot, Zap, Timer, Truck, MessageSquare, CheckCircle2, Route,
  AlertTriangle, TrendingUp, TrendingDown, Sparkles, Trophy, Activity, PackageCheck,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";

// ---------- Tipos ----------
type Jornada = {
  id: string;
  cliente: string;
  produto: string;
  atendente: string;
  regiao: "Centro" | "Zona Sul" | "Zona Norte" | "Zona Leste" | "Zona Oeste";
  pagamento: "Pix" | "Cartão" | "Dinheiro";
  hora: number; // hora do dia (0-23) do primeiro atendimento
  diaIdx: number; // 0 = hoje, 1 = ontem...
  tAtendimentoMin: number;   // 1º contato → orçamento
  tConfirmacaoMin: number;   // orçamento → cliente confirma
  tPagamentoMin: number;     // confirma → pagamento
  tSeparacaoMin: number;     // pagamento → separação concluída
  tEntregaMin: number;       // saída → entregue
  respostaWppMin: number;    // tempo médio resposta no WhatsApp
};

// ---------- Mock determinístico ----------
const ATENDENTES = ["Ana", "Bruno", "Carla", "Diego"];
const PRODUTOS = ["Golden 15kg", "Areia 4kg", "Petisco Natural", "Royal Canin", "Premier Cat"];
const REGIOES: Jornada["regiao"][] = ["Centro", "Zona Sul", "Zona Norte", "Zona Leste", "Zona Oeste"];
const PAGS: Jornada["pagamento"][] = ["Pix", "Cartão", "Dinheiro"];

function seedJornadas(): Jornada[] {
  const arr: Jornada[] = [];
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let d = 0; d < 30; d++) {
    const n = 4 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const hora = 8 + Math.floor(rnd() * 12);
      arr.push({
        id: `J-${d}-${i}`,
        cliente: ["Marina Costa","Pedro Alves","Júlia Ramos","Lucas Pereira","Helena Souza","Roberto Lima","Sofia Almeida"][Math.floor(rnd() * 7)],
        produto: PRODUTOS[Math.floor(rnd() * PRODUTOS.length)],
        atendente: ATENDENTES[Math.floor(rnd() * ATENDENTES.length)],
        regiao: REGIOES[Math.floor(rnd() * REGIOES.length)],
        pagamento: PAGS[Math.floor(rnd() * PAGS.length)],
        hora, diaIdx: d,
        tAtendimentoMin: Math.round(2 + rnd() * 18),
        tConfirmacaoMin: Math.round(3 + rnd() * 40),
        tPagamentoMin: Math.round(1 + rnd() * 25),
        tSeparacaoMin: Math.round(5 + rnd() * 30),
        tEntregaMin: Math.round(20 + rnd() * 90),
        respostaWppMin: Math.round(1 + rnd() * 14),
      });
    }
  }
  return arr;
}

const fmtMin = (m: number) => {
  if (!isFinite(m) || m <= 0) return "—";
  if (m < 60) return `${m.toFixed(0)}min`;
  const h = Math.floor(m / 60); const r = Math.round(m % 60);
  return r ? `${h}h${r}m` : `${h}h`;
};
const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
const jornadaTotal = (j: Jornada) =>
  j.tAtendimentoMin + j.tConfirmacaoMin + j.tPagamentoMin + j.tSeparacaoMin + j.tEntregaMin;

// ---------- Componente ----------
export function VelocidadeOperacional() {
  const [periodo, setPeriodo] = useState<"dia" | "semana" | "mes">("dia");
  const todas = useMemo(seedJornadas, []);

  const periodoDias = periodo === "dia" ? 1 : periodo === "semana" ? 7 : 30;
  const atuais = useMemo(() => todas.filter(j => j.diaIdx < periodoDias), [todas, periodoDias]);
  const anteriores = useMemo(
    () => todas.filter(j => j.diaIdx >= periodoDias && j.diaIdx < periodoDias * 2),
    [todas, periodoDias],
  );

  const m = useMemo(() => ({
    atendimento: avg(atuais.map(j => j.tAtendimentoMin)),
    confirmacao: avg(atuais.map(j => j.tConfirmacaoMin)),
    pagamento:   avg(atuais.map(j => j.tPagamentoMin)),
    separacao:   avg(atuais.map(j => j.tSeparacaoMin)),
    entrega:     avg(atuais.map(j => j.tEntregaMin)),
    wpp:         avg(atuais.map(j => j.respostaWppMin)),
    primContPag: avg(atuais.map(j => j.tAtendimentoMin + j.tConfirmacaoMin + j.tPagamentoMin)),
    pedEntrega:  avg(atuais.map(j => j.tSeparacaoMin + j.tEntregaMin)),
    total:       avg(atuais.map(jornadaTotal)),
  }), [atuais]);

  const mAnt = useMemo(() => ({
    total:       avg(anteriores.map(jornadaTotal)),
    entrega:     avg(anteriores.map(j => j.tEntregaMin)),
    wpp:         avg(anteriores.map(j => j.respostaWppMin)),
    primContPag: avg(anteriores.map(j => j.tAtendimentoMin + j.tConfirmacaoMin + j.tPagamentoMin)),
  }), [anteriores]);

  const deltaPct = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : 0;

  // Funil
  const funil = useMemo(() => {
    const base = atuais.length || 1;
    const orc = Math.round(base * 0.92);
    const aguard = Math.round(base * 0.78);
    const pago = Math.round(base * 0.61);
    void Math.round(base * 0.58); // sep (não exibido)
    const saiu = Math.round(base * 0.55);
    const entregue = Math.round(base * 0.52);
    return [
      { etapa: "Conversa iniciada (IA)", v: base },
      { etapa: "Proposta enviada pela IA", v: orc },
      { etapa: "Aguardando cliente", v: aguard },
      { etapa: "Venda fechada pela IA", v: pago },
      { etapa: "Pagamento confirmado", v: Math.round(base * 0.6) },
      { etapa: "Saiu para entrega", v: saiu },
      { etapa: "Entrega concluída", v: entregue },
    ];

  }, [atuais]);

  // Evolução (linha) — média total por diaIdx
  const evolucao = useMemo(() => {
    const buckets: Record<number, number[]> = {};
    todas.forEach(j => {
      if (j.diaIdx < 14) (buckets[j.diaIdx] ||= []).push(jornadaTotal(j));
    });
    return Object.keys(buckets)
      .map(k => ({ dia: `D-${k}`, min: Math.round(avg(buckets[+k])) }))
      .sort((a, b) => +a.dia.slice(2) - +b.dia.slice(2))
      .reverse();
  }, [todas]);

  // Eficiência por hora (conversão = quanto da jornada % é pré-pagamento)
  const eficienciaHora = useMemo(() => {
    const buckets: Record<number, number[]> = {};
    atuais.forEach(j => (buckets[j.hora] ||= []).push(j.tAtendimentoMin + j.tConfirmacaoMin + j.tPagamentoMin));
    return Array.from({ length: 13 }, (_, i) => {
      const h = 8 + i;
      return { hora: `${h}h`, min: buckets[h] ? Math.round(avg(buckets[h])) : 0 };
    });
  }, [atuais]);

  // Rankings
  const ordenado = (k: (j: Jornada) => number, asc = true) =>
    [...atuais].sort((a, b) => asc ? k(a) - k(b) : k(b) - k(a));

  const maisRapidos = ordenado(jornadaTotal, true).slice(0, 5);
  const maisLentos  = ordenado(jornadaTotal, false).slice(0, 5);
  const entregasTop = ordenado(j => j.tEntregaMin, true).slice(0, 5);

  // IA — por atendente / região / pagamento
  const porAtendente = useMemo(() =>
    ATENDENTES.map(a => {
      const list = atuais.filter(j => j.atendente === a);
      return { atendente: a, total: avg(list.map(jornadaTotal)), n: list.length };
    }).sort((a, b) => a.total - b.total), [atuais]);

  const porRegiao = useMemo(() =>
    REGIOES.map(r => {
      const list = atuais.filter(j => j.regiao === r);
      return { regiao: r, entrega: avg(list.map(j => j.tEntregaMin)) };
    }).sort((a, b) => a.entrega - b.entrega), [atuais]);

  const porPagamento = useMemo(() =>
    PAGS.map(p => {
      const list = atuais.filter(j => j.pagamento === p);
      return { pag: p, ate_pag: avg(list.map(j => j.tAtendimentoMin + j.tConfirmacaoMin + j.tPagamentoMin)) };
    }).sort((a, b) => a.ate_pag - b.ate_pag), [atuais]);

  const horarioConverte = useMemo(() => {
    const ord = [...eficienciaHora].filter(h => h.min > 0).sort((a, b) => a.min - b.min);
    return ord[0]?.hora ?? "—";
  }, [eficienciaHora]);

  const produtoRapido = useMemo(() => {
    const map: Record<string, number[]> = {};
    atuais.forEach(j => (map[j.produto] ||= []).push(jornadaTotal(j)));
    return Object.entries(map).map(([p, xs]) => ({ p, t: avg(xs) }))
      .sort((a, b) => a.t - b.t)[0];
  }, [atuais]);

  // Alertas dinâmicos
  const alertas = useMemo(() => {
    const list: { tipo: "warning" | "destructive" | "primary"; titulo: string; desc: string }[] = [];
    const lentos = atuais.filter(j => jornadaTotal(j) > m.total * 1.5).length;
    if (lentos > 0) list.push({ tipo: "destructive", titulo: `${lentos} pedidos acima da média`, desc: `Jornada total > ${fmtMin(m.total * 1.5)} (média ${fmtMin(m.total)}).` });
    if (m.wpp > 8) list.push({ tipo: "warning", titulo: "Atendimento lento no WhatsApp", desc: `Resposta média ${fmtMin(m.wpp)} — ideal abaixo de 8min.` });
    const atrasos = atuais.filter(j => j.tEntregaMin > 90).length;
    if (atrasos > 0) list.push({ tipo: "destructive", titulo: `${atrasos} entregas atrasadas`, desc: `Tempo de entrega > 1h30min.` });
    const semConf = atuais.filter(j => j.tConfirmacaoMin > 30).length;
    if (semConf > 0) list.push({ tipo: "warning", titulo: `${semConf} clientes demorando para confirmar`, desc: `Confirmação acima de 30min — risco de abandono.` });
    if (m.total < mAnt.total && mAnt.total > 0) list.push({ tipo: "primary", titulo: "Operação ficou mais rápida", desc: `Jornada total reduziu ${Math.abs(deltaPct(m.total, mAnt.total)).toFixed(0)}% vs período anterior.` });
    return list;
  }, [atuais, m, mAnt]);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3 px-1">
        <div>
          <h2 className="text-xs uppercase font-bold tracking-wider text-muted-foreground inline-flex items-center gap-2">
            <Activity className="size-3.5" /> Velocidade operacional
          </h2>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">métricas inteligentes em tempo real · jornada do cliente ponta a ponta</p>
        </div>
        <div className="inline-flex rounded-xl border border-border overflow-hidden text-xs">
          {(["dia", "semana", "mes"] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`h-8 px-3 font-semibold transition ${periodo === p ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}>
              {p === "dia" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs de tempo — atendimento 100% IA no WhatsApp */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <TempoKpi icon={<Bot />}           label="Resposta da IA no WhatsApp" value={fmtMin(m.wpp)} delta={deltaPct(m.wpp, mAnt.wpp)} invert />
        <TempoKpi icon={<CheckCircle2 />}  label="Conversa → fechamento" value={fmtMin(m.atendimento + m.confirmacao)} />
        <TempoKpi icon={<Zap />}           label="Conversa → pagamento" value={fmtMin(m.primContPag)} delta={deltaPct(m.primContPag, mAnt.primContPag)} invert />
        <TempoKpi icon={<Truck />}         label="Pagamento → entrega" value={fmtMin(m.pedEntrega)} delta={deltaPct(m.entrega, mAnt.entrega)} invert />
        <TempoKpi icon={<Route />}         label="Jornada total do pedido" value={fmtMin(m.total)} delta={deltaPct(m.total, mAnt.total)} invert highlight />
      </div>

      <div className="card-soft p-3 flex items-center gap-3 text-xs">
        <div className="size-8 rounded-lg grid place-items-center bg-primary/10 text-primary"><Bot className="size-4" /></div>
        <div className="flex-1">
          <p className="font-semibold leading-tight">IA registra os marcos automaticamente</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">início da conversa · fechamento da venda · pagamento · saída para entrega · entrega concluída — atualizado em tempo real</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-success">
          <span className="size-1.5 rounded-full bg-success animate-pulse" /> AO VIVO
        </span>
      </div>


      {/* Funil + Alertas */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-semibold">Funil da jornada</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Atendimento → Entregue · {atuais.length} pedidos no período</p>
          <div className="mt-4 space-y-2">
            {funil.map((f, i) => {
              const w = (f.v / funil[0].v) * 100;
              const taxa = ((f.v / funil[0].v) * 100).toFixed(0);
              const prev = i === 0 ? f.v : funil[i - 1].v;
              const step = i === 0 ? null : ((f.v / prev) * 100).toFixed(0);
              return (
                <div key={f.etapa}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold">{f.etapa}</span>
                    <span className="text-muted-foreground">
                      <b className="text-foreground">{f.v}</b> · {taxa}%
                      {step && <span className="text-success ml-1">↳ {step}%</span>}
                    </span>
                  </div>
                  <div className="h-6 rounded-lg bg-secondary overflow-hidden">
                    <div className="h-full rounded-lg bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold inline-flex items-center gap-2"><AlertTriangle className="size-4 text-accent" /> Alertas inteligentes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">gargalos detectados pela IA</p>
          <ul className="mt-3 space-y-2">
            {alertas.length === 0 && <li className="text-xs text-muted-foreground p-3 rounded-lg bg-secondary/40">Operação saudável ✅</li>}
            {alertas.map((a, i) => {
              const tone = a.tipo === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30"
                : a.tipo === "warning" ? "bg-accent/15 text-accent border-accent/30"
                : "bg-primary/10 text-primary border-primary/30";
              return (
                <li key={i} className={`p-2.5 rounded-xl border ${tone}`}>
                  <p className="text-xs font-bold leading-tight">{a.titulo}</p>
                  <p className="text-[11px] opacity-90 mt-0.5">{a.desc}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card-soft p-5">
          <h3 className="font-semibold">Evolução da velocidade · 14 dias</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Jornada total média (min)</p>
          <div className="h-48 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => `${v} min`} />
                <Line type="monotone" dataKey="min" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold">Eficiência por horário</h3>
          <p className="text-xs text-muted-foreground mt-0.5">1º contato → pagamento (min)</p>
          <div className="h-48 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eficienciaHora}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="hora" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => `${v} min`} />
                <Bar dataKey="min" radius={[6, 6, 0, 0]}>
                  {eficienciaHora.map((e, i) => (
                    <Cell key={i} fill={e.min === 0 ? "var(--color-secondary)" : "var(--color-accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* IA Insights */}
      <div className="card-soft p-5">
        <h3 className="font-semibold inline-flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Insights da IA</h3>
        <p className="text-xs text-muted-foreground mt-0.5">padrões detectados na operação</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
          <Insight label="Horário que mais converte rápido" value={horarioConverte} hint="menor tempo 1º contato → pago" />
          <Insight label="Produto que fecha mais rápido" value={produtoRapido?.p ?? "—"} hint={produtoRapido ? `média ${fmtMin(produtoRapido.t)}` : ""} />
          <Insight label="Melhor atendente" value={porAtendente[0]?.atendente ?? "—"} hint={porAtendente[0] ? `jornada ${fmtMin(porAtendente[0].total)}` : ""} />
          <Insight label="Pagamento mais ágil" value={porPagamento[0]?.pag ?? "—"} hint={porPagamento[0] ? `até pago ${fmtMin(porPagamento[0].ate_pag)}` : ""} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <MiniTable title="Tempo médio por região" rows={porRegiao.map(r => ({ a: r.regiao, b: fmtMin(r.entrega) }))} />
          <MiniTable title="Performance por atendente" rows={porAtendente.map(a => ({ a: a.atendente, b: `${fmtMin(a.total)} · ${a.n} pedidos` }))} />
        </div>
      </div>

      {/* Rankings */}
      <div className="grid lg:grid-cols-3 gap-4">
        <RankCard icon={<Trophy className="text-success" />} title="Pedidos mais rápidos" rows={maisRapidos.map(j => ({ a: j.cliente, b: fmtMin(jornadaTotal(j)) }))} tone="success" />
        <RankCard icon={<TrendingDown className="text-destructive" />} title="Pedidos mais demorados" rows={maisLentos.map(j => ({ a: j.cliente, b: fmtMin(jornadaTotal(j)) }))} tone="destructive" />
        <RankCard icon={<Truck className="text-primary" />} title="Entregas mais rápidas" rows={entregasTop.map(j => ({ a: `${j.cliente} · ${j.regiao}`, b: fmtMin(j.tEntregaMin) }))} tone="primary" />
      </div>
    </section>
  );
}

// ---------- Sub-componentes ----------
function TempoKpi({ icon, label, value, delta, invert, highlight }: {
  icon: React.ReactNode; label: string; value: string; delta?: number; invert?: boolean; highlight?: boolean;
}) {
  const showDelta = typeof delta === "number" && isFinite(delta) && Math.abs(delta) >= 1;
  const isGood = showDelta ? (invert ? delta! < 0 : delta! > 0) : false;
  const deltaColor = !showDelta ? "" : isGood ? "text-success" : "text-destructive";
  const Trend = !showDelta ? null : (invert ? (delta! < 0 ? TrendingDown : TrendingUp) : (delta! > 0 ? TrendingUp : TrendingDown));
  return (
    <div className={`card-soft p-4 ${highlight ? "ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="size-8 rounded-lg grid place-items-center bg-primary/10 text-primary [&_svg]:size-4">{icon}</div>
        {showDelta && Trend && (
          <span className={`text-[10px] font-bold inline-flex items-center gap-0.5 ${deltaColor}`}>
            <Trend className="size-3" /> {Math.abs(delta!).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-lg lg:text-xl font-bold mt-0.5 tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function Insight({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-xl border border-border bg-secondary/30">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{label}</p>
      <p className="text-base font-bold mt-1">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: { a: string; b: string }[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</h4>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between text-xs p-2 rounded-lg bg-secondary/40">
            <span className="font-medium">{r.a}</span>
            <span className="tabular-nums text-muted-foreground">{r.b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankCard({ icon, title, rows, tone }: {
  icon: React.ReactNode; title: string; rows: { a: string; b: string }[];
  tone: "success" | "destructive" | "primary";
}) {
  const bg = tone === "success" ? "bg-success/10" : tone === "destructive" ? "bg-destructive/10" : "bg-primary/10";
  return (
    <div className="card-soft p-5">
      <h3 className="font-semibold inline-flex items-center gap-2 [&_svg]:size-4">{icon} {title}</h3>
      <ol className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 text-xs p-2 rounded-lg hover:bg-secondary/40">
            <span className={`size-6 rounded-md grid place-items-center font-bold text-[10px] ${bg}`}>{i + 1}</span>
            <span className="flex-1 font-medium truncate">{r.a}</span>
            <span className="tabular-nums font-semibold">{r.b}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
