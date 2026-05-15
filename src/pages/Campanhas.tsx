import { origemLeads, gruposCampanhas as seedGrupos, clientes, produtos, type GrupoCampanha } from "@/lib/mock";
import { Plus, Megaphone, Users, TrendingUp, Image as ImageIcon, Calendar, Sparkles, X, Copy, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const campanhas = [
  { nome: "Black Pet · Novembro", origem: "Instagram Ads", investimento: 1200, leads: 87, conv: 24, roi: "3.4x", status: "ativa" },
  { nome: "Indica & Ganha", origem: "Indicação", investimento: 0, leads: 142, conv: 58, roi: "∞", status: "ativa" },
  { nome: "Influencer @petlovers", origem: "Influenciador", investimento: 800, leads: 42, conv: 11, roi: "2.1x", status: "ativa" },
  { nome: "Aniversário Mundo Pet", origem: "Orgânico", investimento: 0, leads: 31, conv: 9, roi: "—", status: "encerrada" },
];

const CANAL_EMOJI: Record<string, string> = {
  "Instagram Orgânico": "📸", "Meta Ads": "📘", "Influenciadora Gabi Pets": "⭐",
  "Influenciador": "⭐", "Indicação": "🤝", "Google Ads": "🔍", "TikTok": "🎵", "WhatsApp direto": "💬",
};

function emojiCanal(c: string) {
  return CANAL_EMOJI[c] ?? "📊";
}

function emojiCategoria(cat: string) {
  if (/ração|racao|petisco/i.test(cat)) return "🥩";
  if (/higiene|areia|shampoo/i.test(cat)) return "🧼";
  if (/saúde|saude|antipulga/i.test(cat)) return "💊";
  if (/brinquedo/i.test(cat)) return "🎾";
  return "🐾";
}

function beneficiosCategoria(cat: string): [string, string] {
  if (/ração|racao/i.test(cat)) return ["Frete grátis acima de R$ 150", "Pet bem nutrido por mais tempo"];
  if (/petisco/i.test(cat)) return ["Receita 100% natural", "Sem corantes ou conservantes"];
  if (/higiene/i.test(cat)) return ["Casa cheirosa e limpa", "Rende mais que a concorrência"];
  if (/saúde|saude/i.test(cat)) return ["Recomendado por veterinários", "Proteção até 30 dias"];
  if (/brinquedo/i.test(cat)) return ["Estimula o pet o dia todo", "Material super resistente"];
  return ["Qualidade garantida Mundo Pet", "Entrega rápida na sua porta"];
}

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
}

export function Campanhas() {
  const [grupos, setGrupos] = useState<GrupoCampanha[]>(seedGrupos);
  const [showIA, setShowIA] = useState(false);
  const [skuSel, setSkuSel] = useState(produtos[0].sku);
  const [pct, setPct] = useState(15);
  const [validade, setValidade] = useState(plusDays(7));
  const [contexto, setContexto] = useState("");
  const [preview, setPreview] = useState("");

  const roiPorCanal = useMemo(() => {
    const m = new Map<string, { canal: string; invest: number; clientes: number; receita: number; lucro: number; cacSum: number }>();
    clientes.forEach(c => {
      const k = c.origem;
      const cur = m.get(k) || { canal: k, invest: 0, clientes: 0, receita: 0, lucro: 0, cacSum: 0 };
      cur.invest += c.campanhaCusto || 0;
      cur.clientes += 1;
      cur.receita += c.totalGasto;
      cur.lucro += c.lucroLiquido;
      cur.cacSum += c.cac;
      m.set(k, cur);
    });
    return Array.from(m.values()).map(r => ({
      ...r,
      cacMedio: r.clientes ? r.cacSum / r.clientes : 0,
      ltv: r.clientes ? r.receita / r.clientes : 0,
      roi: r.invest > 0 ? r.lucro / r.invest : Infinity,
    })).sort((a,b) => (b.roi === Infinity ? 1 : a.roi === Infinity ? -1 : b.roi - a.roi));
  }, []);

  const produtoSel = produtos.find(p => p.sku === skuSel)!;

  function gerarPreview() {
    const precoCom = produtoSel.preco * (1 - pct/100);
    const [b1, b2] = beneficiosCategoria(produtoSel.categoria);
    const ctxLine = contexto ? `\n💡 ${contexto}` : "";
    const msg = `🐾 OFERTA ESPECIAL — Mundo Pet\n${emojiCategoria(produtoSel.categoria)} ${produtoSel.nome}\nDe ${brl(produtoSel.preco)} por apenas ${brl(precoCom)}\n✅ ${b1}\n✅ ${b2}\n⏰ Válido até ${validade}${ctxLine}\n📲 Responda QUERO para garantir o seu!`;
    setPreview(msg);
  }

  function adicionarFila() {
    if (!preview) { toast.error("Gere a prévia primeiro"); return; }
    const precoCom = produtoSel.preco * (1 - pct/100);
    const novo: GrupoCampanha = {
      id: `g${Date.now()}`,
      dia: new Date().toLocaleDateString("pt-BR", { weekday: "long" }),
      produto: produtoSel.nome,
      preco: Number(precoCom.toFixed(2)),
      precoOriginal: produtoSel.preco,
      validade,
      status: "agendado",
    };
    setGrupos(g => [novo, ...g]);
    toast.success("Adicionado à fila ✅");
    setShowIA(false); setPreview("");
  }

  async function copiar() {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
      toast.success("Copiado ✅");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Tracking de origem, conversão e ROI</p>
        </div>
        <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Nova campanha
        </button>
      </div>

      {/* ROI POR CANAL */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-xs uppercase font-bold tracking-wider text-muted-foreground">ROI por canal</h2>
          <span className="text-[10px] text-muted-foreground/70">cruzamento real com base de clientes</span>
        </div>
        <div className="grid lg:grid-cols-[1fr_280px] gap-4">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {roiPorCanal.map(r => {
              const tone = r.roi === Infinity || r.roi > 2 ? "text-success" : r.roi >= 1 ? "text-accent" : "text-destructive";
              const roiLabel = r.roi === Infinity ? "∞" : `${r.roi.toFixed(1)}x`;
              return (
                <div key={r.canal} className="card-soft p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{emojiCanal(r.canal)}</span>
                    <div className="font-semibold text-sm leading-tight">{r.canal}</div>
                  </div>
                  <div className={`text-3xl font-bold tabular-nums ${tone}`}>{roiLabel}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">ROI</div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-3 text-[11px]">
                    <span className="text-muted-foreground">Investido</span><span className="font-semibold tabular-nums text-right">{brl(r.invest)}</span>
                    <span className="text-muted-foreground">Clientes</span><span className="font-semibold tabular-nums text-right">{r.clientes}</span>
                    <span className="text-muted-foreground">Receita</span><span className="font-semibold tabular-nums text-right">{brl(r.receita)}</span>
                    <span className="text-muted-foreground">Lucro</span><span className="font-semibold tabular-nums text-right text-success">{brl(r.lucro)}</span>
                    <span className="text-muted-foreground">CAC médio</span><span className="font-semibold tabular-nums text-right">{brl(r.cacMedio)}</span>
                    <span className="text-muted-foreground">LTV</span><span className="font-semibold tabular-nums text-right">{brl(r.ltv)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="card-soft p-4">
            <h3 className="font-semibold text-sm inline-flex items-center gap-2"><Trophy className="size-4 text-accent" /> Ranking por ROI</h3>
            <ol className="mt-3 space-y-2">
              {roiPorCanal.map((r, i) => (
                <li key={r.canal} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40">
                  <span className="size-6 rounded-md grid place-items-center text-xs font-bold bg-foreground text-background">{i+1}</span>
                  <span className="text-base">{emojiCanal(r.canal)}</span>
                  <span className="flex-1 text-xs font-semibold truncate">{r.canal}</span>
                  <span className={`text-xs font-bold tabular-nums ${r.roi===Infinity||r.roi>2?"text-success":r.roi>=1?"text-accent":"text-destructive"}`}>{r.roi===Infinity?"∞":`${r.roi.toFixed(1)}x`}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card icon={<Megaphone className="size-5" />} label="Campanhas ativas" value="3" />
        <Card icon={<Users className="size-5" />} label="Novos leads (30d)" value="302" />
        <Card icon={<TrendingUp className="size-5" />} label="ROI médio" value="2.8x" />
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Campanha</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Origem</th>
                <th className="font-medium px-4 py-3">Invest.</th>
                <th className="font-medium px-4 py-3">Leads</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Conversões</th>
                <th className="font-medium px-4 py-3">ROI</th>
                <th className="font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map((c) => (
                <tr key={c.nome} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold">{c.nome}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{c.origem}</td>
                  <td className="px-4 py-3">R$ {c.investimento.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{c.leads}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{c.conv}</td>
                  <td className="px-4 py-3 font-bold text-success">{c.roi}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md ${c.status === "ativa" ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Megaphone className="size-4 text-accent" /> Grupo WhatsApp · Ofertas da semana</h3>
              <p className="text-xs text-muted-foreground mt-0.5">A IA escolhe produtos, gera imagem e legenda — você só aprova.</p>
            </div>
            <button onClick={()=>setShowIA(true)} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> Gerar com IA</button>
          </div>
          <div className="space-y-2">
            {grupos.map(g => {
              const tone = g.status === "enviado" ? "bg-success/15 text-success" : g.status === "agendado" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground";
              return (
                <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center text-foreground/60"><ImageIcon className="size-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{g.dia}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md capitalize ${tone}`}>{g.status}</span>
                    </div>
                    <div className="font-semibold text-sm truncate">{g.produto}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-bold text-success">R$ {g.preco.toFixed(2)}</span>
                      <span className="line-through ml-1.5">R$ {g.precoOriginal.toFixed(2)}</span>
                      <span className="ml-2">· val. {g.validade}</span>
                      {g.alcance && <span className="ml-2">· {g.alcance} views</span>}
                    </div>
                  </div>
                  <button className="h-8 px-3 rounded-lg bg-card border border-border text-xs font-semibold inline-flex items-center gap-1.5"><Calendar className="size-3.5" /> Editar</button>
                </div>
              );
            })}
          </div>
          <div className="mt-3 p-3 rounded-xl bg-accent/5 border border-accent/20 text-xs">
            <b>Automação inteligente:</b> 1 oferta/dia em horários distintos (10h, 14h, 18h) para evitar spam. A IA evita repetir categorias.
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-semibold mb-3">Distribuição de origens</h3>
          <div className="space-y-2.5">
            {origemLeads.map((o) => (
              <div key={o.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-muted-foreground">{o.value}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${o.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showIA && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-foreground/50" onClick={()=>setShowIA(false)}>
          <div className="card-soft p-5 w-full max-w-lg space-y-4 max-h-[92vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold inline-flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Gerar oferta com IA</h3>
                <p className="text-xs text-muted-foreground">Monte uma mensagem pronta para o grupo</p>
              </div>
              <button onClick={()=>setShowIA(false)} className="p-1 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Produto</Label>
                <select value={skuSel} onChange={e=>setSkuSel(e.target.value)} className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none">
                  {produtos.map(p => <option key={p.sku} value={p.sku}>{p.nome} · {brl(p.preco)}</option>)}
                </select>
              </div>
              <div>
                <Label>Desconto (%)</Label>
                <input type="number" value={pct} onChange={e=>setPct(Number(e.target.value)||0)} className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none" />
              </div>
              <div>
                <Label>Validade</Label>
                <input value={validade} onChange={e=>setValidade(e.target.value)} placeholder="dd/mm" className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none" />
              </div>
              <div className="col-span-2">
                <Label>Contexto adicional (opcional)</Label>
                <input value={contexto} onChange={e=>setContexto(e.target.value)} placeholder="Ex: foco em clientes VIP" className="w-full h-10 px-3 rounded-lg bg-secondary text-sm outline-none" />
              </div>
            </div>

            <button onClick={gerarPreview} className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"><Sparkles className="size-4" /> Gerar prévia</button>

            {preview && (
              <div className="rounded-2xl bg-[#075E54] text-white p-4 text-sm whitespace-pre-line shadow-inner">
                {preview}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={copiar} disabled={!preview} className="flex-1 h-10 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"><Copy className="size-4" /> Copiar mensagem</button>
              <button onClick={adicionarFila} disabled={!preview} className="flex-1 h-10 rounded-xl bg-success text-success-foreground text-sm font-semibold disabled:opacity-40">Adicionar à fila</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">{children}</div>;
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
