import { clientes } from "@/lib/mock";
import { useMemo, useState } from "react";
import {
  Gift, Trophy, Users, Sparkles, Plus, Share2, Crown, Medal, Award,
  PawPrint, Flame, Target, Check, Percent, Settings2, Clock, Wallet,
} from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Recompensa = { id: string; nome: string; custo: number; tipo: "desconto" | "produto" | "brinde"; emoji: string };
type Indicacao = { clienteId: string; indicado: string; status: "pendente" | "convertido"; data: string; pontos: number };
type Campanha = { id: string; titulo: string; regra: string; bonus: number; ativo: boolean; participantes: number };

const recompensasIniciais: Recompensa[] = [
  { id: "r1", nome: "10% OFF próxima compra", custo: 50, tipo: "desconto", emoji: "🏷️" },
  { id: "r2", nome: "Petisco Natural 90g grátis", custo: 80, tipo: "brinde", emoji: "🦴" },
  { id: "r3", nome: "Banho cortesia", custo: 120, tipo: "produto", emoji: "🛁" },
  { id: "r4", nome: "Frete grátis por 30 dias", custo: 150, tipo: "desconto", emoji: "🚚" },
  { id: "r5", nome: "Brinquedo de corda", custo: 200, tipo: "brinde", emoji: "🧸" },
  { id: "r6", nome: "Saco de ração 3kg", custo: 450, tipo: "produto", emoji: "🥣" },
];

const campanhasIniciais: Campanha[] = [
  { id: "c1", titulo: "Indique 3 amigos", regra: "Ganhe 60 pontos extras ao 3º amigo cadastrado", bonus: 60, ativo: true, participantes: 14 },
  { id: "c2", titulo: "Compra acima de R$ 100", regra: "Ganhe 20 pontos extras na próxima compra", bonus: 20, ativo: true, participantes: 32 },
  { id: "c3", titulo: "Maio do Pet", regra: "Pontos em dobro em todo o mês de maio", bonus: 0, ativo: false, participantes: 0 },
];

// Pontuação calculada a partir do mock (1pt a cada R$10 + 20pt por indicação)
function calcularRanking() {
  return clientes.map((c, idx) => {
    const indicacoes = c.origem === "Indicação" ? 1 : Math.max(0, (idx + 1) % 4);
    const pontosCompra = Math.floor(c.totalGasto / 10);
    const pontosIndicacao = indicacoes * 20;
    const total = pontosCompra + pontosIndicacao;
    return { ...c, indicacoes, pontosCompra, pontosIndicacao, pontos: total };
  }).sort((a, b) => b.pontos - a.pontos);
}

export function Indicacoes() {
  const ranking = useMemo(calcularRanking, []);
  const [recompensas] = useState(recompensasIniciais);
  const [campanhas, setCampanhas] = useState(campanhasIniciais);
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([
    { clienteId: "1", indicado: "Letícia Prado", status: "convertido", data: "há 2 dias", pontos: 20 },
    { clienteId: "4", indicado: "Bruno Tavares", status: "convertido", data: "há 5 dias", pontos: 20 },
    { clienteId: "1", indicado: "Mateus Lima", status: "pendente", data: "há 1 dia", pontos: 0 },
    { clienteId: "3", indicado: "Renata Souza", status: "convertido", data: "há 8 dias", pontos: 20 },
    { clienteId: "5", indicado: "Diego Costa", status: "pendente", data: "há 3 dias", pontos: 0 },
  ]);
  const [novoModal, setNovoModal] = useState(false);
  const [novoCliente, setNovoCliente] = useState("");
  const [novoIndicado, setNovoIndicado] = useState("");

  const totalPontos = ranking.reduce((s, c) => s + c.pontos, 0);
  const totalIndicacoes = indicacoes.length;
  const convertidas = indicacoes.filter(i => i.status === "convertido").length;
  const taxaConv = totalIndicacoes ? (convertidas / totalIndicacoes) * 100 : 0;

  const adicionarIndicacao = () => {
    if (!novoCliente || !novoIndicado) return;
    const c = clientes.find(c => c.nome === novoCliente);
    if (!c) return;
    setIndicacoes(prev => [{ clienteId: c.id, indicado: novoIndicado, status: "pendente", data: "agora", pontos: 0 }, ...prev]);
    setNovoCliente(""); setNovoIndicado(""); setNovoModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Gift className="size-6 text-primary" /> Indicações & Fidelidade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quem traz amigo ganha pontos · clientes felizes que viram divulgadores
          </p>
        </div>
        <button
          onClick={() => setNovoModal(true)}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 transition"
        >
          <Plus className="size-4" /> Nova indicação
        </button>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Users className="size-4" />} label="Indicações totais" value={String(totalIndicacoes)} sub={`${convertidas} convertidas`} tone="primary" />
        <Kpi icon={<Target className="size-4" />} label="Taxa de conversão" value={`${taxaConv.toFixed(0)}%`} sub="amigos que viram clientes" tone="success" />
        <Kpi icon={<Sparkles className="size-4" />} label="Pontos circulando" value={totalPontos.toLocaleString("pt-BR")} sub={`${ranking.length} clientes ativos`} tone="accent" />
        <Kpi icon={<Trophy className="size-4" />} label="Top divulgador" value={ranking[0]?.nome.split(" ")[0] || "—"} sub={`${ranking[0]?.pontos || 0} pts`} tone="warn" />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        {/* Ranking */}
        <section className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold inline-flex items-center gap-2"><Crown className="size-4 text-warning" /> Ranking de fidelidade</h2>
              <p className="text-xs text-muted-foreground">Top clientes por pontos · compras + indicações</p>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground bg-secondary px-2 py-1 rounded-md">Mês atual</span>
          </div>
          <div className="space-y-2">
            {ranking.slice(0, 7).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary transition">
                <div className={`size-9 rounded-xl grid place-items-center font-bold text-sm shrink-0 ${
                  i === 0 ? "bg-warning/20 text-warning" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-accent/20 text-accent" : "bg-card border border-border text-muted-foreground"
                }`}>
                  {i < 3 ? (i === 0 ? <Crown className="size-4" /> : i === 1 ? <Medal className="size-4" /> : <Award className="size-4" />) : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{c.nome}</span>
                    {c.perfil === "VIP" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">VIP</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
                    <PawPrint className="size-3" /> {c.pets.join(", ")} · {c.indicacoes} indicações
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm tabular-nums">{c.pontos.toLocaleString("pt-BR")} <span className="text-[10px] text-muted-foreground font-medium">pts</span></div>
                  <div className="text-[10px] text-muted-foreground">{brl(c.totalGasto)} gastos</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recompensas */}
        <section className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold inline-flex items-center gap-2"><Gift className="size-4 text-accent" /> Catálogo de recompensas</h2>
              <p className="text-xs text-muted-foreground">O que pode ser trocado pelos pontos</p>
            </div>
          </div>
          <div className="space-y-2">
            {recompensas.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40 hover:bg-secondary transition">
                <div className="size-10 rounded-xl bg-card border border-border grid place-items-center text-xl">{r.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{r.nome}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{r.tipo}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-primary tabular-nums">{r.custo}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide">pontos</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Campanhas */}
      <section className="card-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2"><Flame className="size-4 text-destructive" /> Campanhas de bônus</h2>
            <p className="text-xs text-muted-foreground">Multiplicadores e metas que aumentam o engajamento</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {campanhas.map((c) => (
            <div key={c.id} className={`p-4 rounded-xl border transition ${c.ativo ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30 opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-sm">{c.titulo}</div>
                <button
                  onClick={() => setCampanhas(cs => cs.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x))}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition ${c.ativo ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}
                >
                  {c.ativo ? "Ativa" : "Pausada"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{c.regra}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground">{c.participantes} participantes</span>
                {c.bonus > 0 && <span className="text-[11px] font-bold text-primary">+{c.bonus} pts</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Histórico */}
      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-semibold inline-flex items-center gap-2"><Share2 className="size-4 text-primary" /> Histórico de indicações</h2>
          <p className="text-xs text-muted-foreground">Quem indicou, quem foi indicado e o status</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-5 py-3">Indicador</th>
                <th className="font-medium px-5 py-3">Amigo indicado</th>
                <th className="font-medium px-5 py-3">Quando</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {indicacoes.map((i, idx) => {
                const c = clientes.find(c => c.id === i.clienteId);
                return (
                  <tr key={idx} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-5 py-3 font-semibold">{c?.nome || "—"}</td>
                    <td className="px-5 py-3">{i.indicado}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{i.data}</td>
                    <td className="px-5 py-3">
                      {i.status === "convertido" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-success/15 text-success">
                          <Check className="size-3" /> Convertido
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-warning/15 text-warning">Pendente</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums">{i.pontos > 0 ? `+${i.pontos}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal nova indicação */}
      {novoModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40" onClick={() => setNovoModal(false)}>
          <div className="card-soft p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-semibold inline-flex items-center gap-2"><Plus className="size-4" /> Nova indicação</h3>
              <p className="text-xs text-muted-foreground">Registre quem indicou e quem foi indicado</p>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Cliente que indicou</label>
              <input
                list="ind-clientes"
                value={novoCliente}
                onChange={(e) => setNovoCliente(e.target.value)}
                placeholder="Buscar cliente…"
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
              <datalist id="ind-clientes">
                {clientes.map(c => <option key={c.id} value={c.nome} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Nome do amigo indicado</label>
              <input
                value={novoIndicado}
                onChange={(e) => setNovoIndicado(e.target.value)}
                placeholder="Ex: João Silva"
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setNovoModal(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold hover:bg-secondary/70">Cancelar</button>
              <button
                onClick={adicionarIndicacao}
                disabled={!novoCliente || !novoIndicado}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:opacity-90"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "primary" | "success" | "accent" | "warn" }) {
  const cls = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    accent: "bg-accent/15 text-accent",
    warn: "bg-warning/15 text-warning",
  }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-3">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{label}</div>
        <div className="text-lg font-bold leading-tight truncate">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  );
}
