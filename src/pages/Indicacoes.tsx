import { clientes } from "@/lib/mock";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Gift, Trophy, Users, Plus, Share2, Crown, Medal, Award,
  PawPrint, Flame, Target, Check, Percent, Settings2, Clock, Wallet,
  ChevronRight, X, ShieldAlert, Tag, Sparkles, TrendingUp, Phone, BadgeCheck,
} from "lucide-react";
import {
  brl, categoriasIniciais, campanhasIniciais, comprasIniciais,
  pontosCompra, pontosPorCategoria, totalCompra,
  type CategoriaRegra, type CompraIndicado, type CampanhaTemp,
} from "@/features/indicacoes/data";
import {
  validateReferralPhone, formatPhone, applyReferralDiscount, normalizePhone, findClienteByPhone,
} from "@/features/indicacoes/phone-referrals";

type Recompensa = { id: string; nome: string; custo: number; tipo: "desconto" | "produto" | "brinde" | "cashback"; emoji: string };

const recompensasIniciais: Recompensa[] = [
  { id: "r1", nome: "10% OFF próxima compra",   custo: 50,  tipo: "desconto", emoji: "🏷️" },
  { id: "r2", nome: "Petisco Natural 90g grátis", custo: 80, tipo: "brinde",  emoji: "🦴" },
  { id: "r3", nome: "Banho cortesia",            custo: 120, tipo: "produto", emoji: "🛁" },
  { id: "r4", nome: "R$ 20 de cashback",         custo: 200, tipo: "cashback", emoji: "💸" },
  { id: "r5", nome: "Antipulgas Bravecto",        custo: 380, tipo: "produto", emoji: "💊" },
  { id: "r6", nome: "Saco de ração 3kg",          custo: 450, tipo: "produto", emoji: "🥣" },
];

export function Indicacoes() {
  const [categorias, setCategorias] = useState<CategoriaRegra[]>(categoriasIniciais);
  const [compras, setCompras] = useState<CompraIndicado[]>(comprasIniciais);
  const [campanhas, setCampanhas] = useState<CampanhaTemp[]>(campanhasIniciais);
  const [recompensas] = useState(recompensasIniciais);
  const [novaConversaoId, setNovaConversaoId] = useState<string | null>(null);

  // Modal: nova indicação por telefone
  const [novoModal, setNovoModal] = useState(false);
  const [telIndicador, setTelIndicador] = useState("");
  const [telIndicado, setTelIndicado] = useState("");
  const [nomeIndicado, setNomeIndicado] = useState("");
  const [valorPrimeiraCompra, setValorPrimeiraCompra] = useState<number>(0);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  const [detalheCompra, setDetalheCompra] = useState<CompraIndicado | null>(null);
  const [indicadorAberto, setIndicadorAberto] = useState<string | null>(null);

  // Resolução em tempo real do indicador pelo telefone
  const indicadorEncontrado = useMemo(
    () => (normalizePhone(telIndicador).length >= 8 ? findClienteByPhone(telIndicador) : null),
    [telIndicador],
  );
  const previewDesconto = useMemo(() => applyReferralDiscount(valorPrimeiraCompra || 0), [valorPrimeiraCompra]);

  // ─── Agregações ───
  const indicadores = useMemo(() => {
    const map = new Map<string, { cliente: typeof clientes[number]; compras: CompraIndicado[]; total: number; pontos: number }>();
    for (const c of compras) {
      const cli = clientes.find((x) => x.id === c.indicadorId);
      if (!cli) continue;
      const cur = map.get(c.indicadorId) ?? { cliente: cli, compras: [], total: 0, pontos: 0 };
      cur.compras.push(c);
      cur.total += totalCompra(c);
      cur.pontos += pontosCompra(c, categorias);
      map.set(c.indicadorId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.pontos - a.pontos);
  }, [compras, categorias]);

  const totalIndicacoes = compras.length;
  const convertidas = compras.filter((c) => c.itens.length > 0).length;
  const taxaConv = totalIndicacoes ? (convertidas / totalIndicacoes) * 100 : 0;
  const totalGerado = compras.reduce((s, c) => s + totalCompra(c), 0);
  const totalPontos = compras.reduce((s, c) => s + pontosCompra(c, categorias), 0);
  const top = indicadores[0];

  useEffect(() => {
    if (!novaConversaoId) return;
    const t = setTimeout(() => setNovaConversaoId(null), 4000);
    return () => clearTimeout(t);
  }, [novaConversaoId]);

  const resetModal = () => {
    setTelIndicador(""); setTelIndicado(""); setNomeIndicado("");
    setValorPrimeiraCompra(0); setErroNovo(null); setNovoModal(false);
  };

  const registrarIndicacao = () => {
    setErroNovo(null);
    const v = validateReferralPhone({
      telefoneIndicador: telIndicador,
      telefoneIndicado: telIndicado,
      nomeIndicado,
      comprasExistentes: compras,
    });
    if (!v.ok) { setErroNovo(v.message); return; }
    if (!nomeIndicado.trim()) { setErroNovo("Informe o nome do indicado."); return; }

    const id = `c${Date.now()}`;
    const nova: CompraIndicado = {
      id,
      indicadorId: v.indicador.id,
      indicadoNome: nomeIndicado.trim(),
      indicadoTelefone: telIndicado || undefined,
      data: "agora",
      descontoAplicado: true,
      primeiraCompra: true,
      dataDesconto: new Date().toLocaleDateString("pt-BR"),
      itens: valorPrimeiraCompra > 0
        ? [{ produto: "1ª compra (indicação)", categoriaId: "rac", qtd: 1, preco: valorPrimeiraCompra }]
        : [],
    };
    setCompras((prev) => [nova, ...prev]);
    setNovaConversaoId(id);
    toast.success(`🎁 10% OFF aplicado para ${nova.indicadoNome}`, {
      description: `Indicado por ${v.indicador.nome} · pontos liberados em tempo real`,
    });
    resetModal();
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
            Painel de comissões por categoria · cada cliente vira um divulgador
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={<Users className="size-4" />} label="Indicações" value={String(totalIndicacoes)} sub={`${convertidas} convertidas`} tone="primary" />
        <Kpi icon={<Target className="size-4" />} label="Conversão" value={`${taxaConv.toFixed(0)}%`} sub="amigos que compraram" tone="success" />
        <Kpi icon={<Wallet className="size-4" />} label="Total movimentado" value={brl(totalGerado)} sub="vendas via indicação" tone="accent" />
        <Kpi icon={<Sparkles className="size-4" />} label="Pontos gerados" value={Math.round(totalPontos).toLocaleString("pt-BR")} sub="distribuídos a divulgadores" tone="warn" />
        <Kpi icon={<Trophy className="size-4" />} label="Top divulgador" value={top?.cliente.nome.split(" ")[0] || "—"} sub={`${Math.round(top?.pontos || 0)} pts · ${brl(top?.total || 0)}`} tone="primary" />
      </div>

      {/* Regras por categoria */}
      <section className="card-soft p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2"><Settings2 className="size-4 text-primary" /> Comissão por categoria</h2>
            <p className="text-xs text-muted-foreground">Cada categoria paga uma % diferente em pontos para quem indicou</p>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground bg-secondary px-2 py-1 rounded-md">Atualiza em tempo real</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categorias.map((cat) => (
            <CategoriaCard key={cat.id} cat={cat} onChange={(next) => setCategorias((cs) => cs.map((c) => c.id === cat.id ? next : c))} />
          ))}
        </div>
      </section>

      {/* Indicadores (estilo painel de vendedor / comissões) */}
      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold inline-flex items-center gap-2"><Crown className="size-4 text-warning" /> Painel de divulgadores</h2>
            <p className="text-xs text-muted-foreground">Quem indicou, quanto cada amigo comprou e a comissão em pontos</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {indicadores.map((ind, i) => {
            const aberto = indicadorAberto === ind.cliente.id;
            return (
              <div key={ind.cliente.id}>
                <button
                  onClick={() => setIndicadorAberto(aberto ? null : ind.cliente.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/30 transition text-left"
                >
                  <div className={`size-10 rounded-xl grid place-items-center font-bold text-sm shrink-0 ${
                    i === 0 ? "bg-warning/20 text-warning" : i === 1 ? "bg-muted text-foreground" : i === 2 ? "bg-accent/20 text-accent" : "bg-card border border-border text-muted-foreground"
                  }`}>
                    {i < 3 ? (i === 0 ? <Crown className="size-4" /> : i === 1 ? <Medal className="size-4" /> : <Award className="size-4" />) : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{ind.cliente.nome}</span>
                      {ind.cliente.perfil === "VIP" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">VIP</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 mt-0.5">
                      <PawPrint className="size-3" /> {ind.cliente.pets.join(", ")} · {ind.compras.length} amigo{ind.compras.length !== 1 && "s"} indicado{ind.compras.length !== 1 && "s"}
                    </div>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Movimentado</div>
                    <div className="font-semibold text-sm tabular-nums">{brl(ind.total)}</div>
                  </div>
                  <div className="text-right shrink-0 min-w-[90px]">
                    <div className="text-[10px] uppercase tracking-wide text-success font-bold">Pontos</div>
                    <div className="font-bold text-sm tabular-nums text-success">+{Math.round(ind.pontos)}</div>
                  </div>
                  <ChevronRight className={`size-4 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`} />
                </button>

                {aberto && (
                  <div className="bg-secondary/30 px-5 py-4 space-y-2">
                    {ind.compras.map((c) => {
                      const tot = totalCompra(c);
                      const pts = pontosCompra(c, categorias);
                      const pendente = c.itens.length === 0;
                      return (
                        <button
                          key={c.id}
                          onClick={() => !pendente && setDetalheCompra(c)}
                          disabled={pendente}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/40 transition text-left disabled:opacity-60 disabled:cursor-default"
                        >
                          <div className="size-9 rounded-xl bg-secondary grid place-items-center text-sm font-bold text-muted-foreground shrink-0">
                            {c.indicadoNome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm truncate">{c.indicadoNome}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {pendente ? "Aguardando 1ª compra" : `${c.itens.length} item(ns) · ${c.data}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-sm tabular-nums">{brl(tot)}</div>
                            <div className="text-[11px] text-success font-bold tabular-nums">+{Math.round(pts)} pts</div>
                          </div>
                          {!pendente && <ChevronRight className="size-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        {/* Recompensas */}
        <section className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold inline-flex items-center gap-2"><Gift className="size-4 text-accent" /> Catálogo de recompensas</h2>
              <p className="text-xs text-muted-foreground">Trocas: descontos · brindes · cashback · produtos</p>
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

        {/* Campanhas */}
        <section className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold inline-flex items-center gap-2"><Flame className="size-4 text-destructive" /> Campanhas temporárias</h2>
              <p className="text-xs text-muted-foreground">Multiplicadores e metas que aceleram o engajamento</p>
            </div>
          </div>
          <div className="space-y-2">
            {campanhas.map((c) => (
              <div key={c.id} className={`p-3 rounded-xl border transition ${c.ativo ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm">{c.titulo}</div>
                  <button
                    onClick={() => setCampanhas((cs) => cs.map((x) => x.id === c.id ? { ...x, ativo: !x.ativo } : x))}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md transition ${c.ativo ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {c.ativo ? "Ativa" : "Pausada"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.regra}</p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">{c.participantes} participantes</span>
                  {c.bonus > 0 && <span className="text-[11px] font-bold text-primary">+{c.bonus} pts</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Histórico completo */}
      <section className="card-soft overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-semibold inline-flex items-center gap-2"><Share2 className="size-4 text-primary" /> Histórico completo de compras indicadas</h2>
          <p className="text-xs text-muted-foreground">Quem indicou, quem comprou, o que comprou, categoria, valor e pontos</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-5 py-3">Indicador</th>
                <th className="font-medium px-5 py-3">Amigo</th>
                <th className="font-medium px-5 py-3">Categorias</th>
                <th className="font-medium px-5 py-3">Quando</th>
                <th className="font-medium px-5 py-3 text-right">Comprou</th>
                <th className="font-medium px-5 py-3 text-right">Pontos</th>
                <th className="font-medium px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const cli = clientes.find((x) => x.id === c.indicadorId);
                const tot = totalCompra(c);
                const pts = pontosCompra(c, categorias);
                const pendente = c.itens.length === 0;
                const cats = Array.from(new Set(c.itens.map((i) => i.categoriaId)))
                  .map((id) => categorias.find((k) => k.id === id))
                  .filter(Boolean) as CategoriaRegra[];
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={() => !pendente && setDetalheCompra(c)}>
                    <td className="px-5 py-3 font-semibold">{cli?.nome || "—"}</td>
                    <td className="px-5 py-3">{c.indicadoNome}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {pendente
                          ? <span className="text-xs text-muted-foreground">—</span>
                          : cats.map((k) => (
                              <span key={k.id} className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary border border-border">
                                <span>{k.emoji}</span>{k.nome}
                              </span>
                            ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{c.data}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{pendente ? "—" : brl(tot)}</td>
                    <td className="px-5 py-3 text-right">
                      {pts > 0
                        ? <span className="font-bold tabular-nums text-success">+{Math.round(pts)}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ${pendente ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                        {pendente ? "Aguardando 1ª compra" : <><Check className="size-3" /> Pontos liberados</>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal detalhe da compra */}
      {detalheCompra && (
        <DetalheCompraModal
          compra={detalheCompra}
          categorias={categorias}
          indicador={clientes.find((c) => c.id === detalheCompra.indicadorId)?.nome || "—"}
          onClose={() => setDetalheCompra(null)}
        />
      )}

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
                {clientes.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Nome do amigo</label>
              <input
                value={novoIndicado}
                onChange={(e) => setNovoIndicado(e.target.value)}
                placeholder="Ex: João Silva"
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Telefone do amigo (opcional)</label>
              <input
                value={novoTel}
                onChange={(e) => setNovoTel(e.target.value)}
                placeholder="(11) 9 0000-0000"
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              />
            </div>
            {erroNovo && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <ShieldAlert className="size-3.5" /> {erroNovo}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5">
              <ShieldAlert className="size-3" /> Auto-indicação e indicações duplicadas são bloqueadas automaticamente.
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

// ─── Sub-componentes ───

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

function CategoriaCard({ cat, onChange }: { cat: CategoriaRegra; onChange: (next: CategoriaRegra) => void }) {
  return (
    <div className={`p-4 rounded-xl border transition ${cat.ativo ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30 opacity-70"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="text-2xl leading-none">{cat.emoji}</span>
          <span className="font-semibold text-sm">{cat.nome}</span>
        </div>
        <button
          onClick={() => onChange({ ...cat, ativo: !cat.ativo })}
          className={`text-[10px] font-bold px-2 py-1 rounded-md ${cat.ativo ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}
        >
          {cat.ativo ? "Ativa" : "Inativa"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <MiniField icon={<Percent className="size-3" />} suffix="%" value={cat.percentual} onChange={(v) => onChange({ ...cat, percentual: v })} />
        <MiniField icon={<Wallet className="size-3" />} prefix="R$" value={cat.limiteMax} onChange={(v) => onChange({ ...cat, limiteMax: v })} />
        <MiniField icon={<Clock className="size-3" />} suffix="d" value={cat.validadeDias} onChange={(v) => onChange({ ...cat, validadeDias: v })} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 inline-flex items-center gap-1">
        <TrendingUp className="size-3" /> Ex: amigo gasta {brl(100)} → indicador ganha <b className="text-success">{Math.round(Math.min(cat.limiteMax || Infinity, cat.ativo ? cat.percentual : 0))} pts</b>
      </div>
    </div>
  );
}

function MiniField({ icon, value, onChange, prefix, suffix }: { icon: React.ReactNode; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-card border border-border px-2 py-1.5">
      <div className="text-[9px] uppercase font-bold tracking-wide text-muted-foreground inline-flex items-center gap-1">{icon}</div>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-[10px] font-semibold text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-sm font-bold tabular-nums outline-none"
        />
        {suffix && <span className="text-[10px] font-semibold text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function DetalheCompraModal({
  compra, categorias, indicador, onClose,
}: { compra: CompraIndicado; categorias: CategoriaRegra[]; indicador: string; onClose: () => void }) {
  const tot = totalCompra(compra);
  const pts = pontosCompra(compra, categorias);
  const porCat = pontosPorCategoria(compra, categorias);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/40" onClick={onClose}>
      <div className="card-soft p-0 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 sticky top-0 bg-card z-10">
          <div>
            <h3 className="font-semibold inline-flex items-center gap-2"><Tag className="size-4 text-primary" /> Compra de {compra.indicadoNome}</h3>
            <p className="text-xs text-muted-foreground">Indicado por <b className="text-foreground">{indicador}</b> · {compra.data}</p>
          </div>
          <button onClick={onClose} className="size-8 rounded-lg grid place-items-center hover:bg-secondary"><X className="size-4" /></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-3 gap-3">
          <MiniStat label="Total da compra" value={brl(tot)} tone="primary" />
          <MiniStat label="Pontos liberados" value={`+${Math.round(pts)}`} tone="success" />
          <MiniStat label="Itens" value={String(compra.itens.reduce((s, i) => s + i.qtd, 0))} tone="accent" />
        </div>

        <div className="px-5 pb-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Produtos</h4>
          <div className="space-y-2">
            {compra.itens.map((i, idx) => {
              const cat = categorias.find((k) => k.id === i.categoriaId);
              const subtotal = i.qtd * i.preco;
              const ptsItem = cat?.ativo ? Math.min(cat.limiteMax || Infinity, (subtotal * cat.percentual) / 100) : 0;
              return (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/40">
                  <div className="size-10 rounded-xl bg-card border border-border grid place-items-center text-xl">{cat?.emoji || "📦"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{i.produto}</div>
                    <div className="text-[11px] text-muted-foreground">{cat?.nome || "Sem categoria"} · {i.qtd}x {brl(i.preco)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm tabular-nums">{brl(subtotal)}</div>
                    <div className="text-[11px] text-success font-bold">+{Math.round(ptsItem)} pts</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-5">
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Margem por categoria</h4>
          <div className="space-y-1.5">
            {porCat.map(({ categoria, valor, pontos }) => (
              <div key={categoria.id} className="flex items-center gap-3 text-sm">
                <span className="text-base">{categoria.emoji}</span>
                <span className="flex-1 truncate">{categoria.nome} <span className="text-[10px] text-muted-foreground">· {categoria.percentual}%</span></span>
                <span className="text-xs text-muted-foreground tabular-nums">{brl(valor)}</span>
                <span className="text-xs font-bold text-success tabular-nums w-16 text-right">+{Math.round(pontos)} pts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "accent" }) {
  const cls = {
    primary: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-success border-success/20",
    accent: "bg-accent/10 text-accent border-accent/20",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${cls}`}>
      <div className="text-[10px] uppercase font-bold tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
    </div>
  );
}
