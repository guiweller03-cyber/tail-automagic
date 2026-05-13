import { origemLeads, gruposCampanhas } from "@/lib/mock";
import { Plus, Megaphone, Users, TrendingUp, Image as ImageIcon, Calendar, Sparkles } from "lucide-react";

const campanhas = [
  { nome: "Black Pet · Novembro", origem: "Instagram Ads", investimento: 1200, leads: 87, conv: 24, roi: "3.4x", status: "ativa" },
  { nome: "Indica & Ganha", origem: "Indicação", investimento: 0, leads: 142, conv: 58, roi: "∞", status: "ativa" },
  { nome: "Influencer @petlovers", origem: "Influenciador", investimento: 800, leads: 42, conv: 11, roi: "2.1x", status: "ativa" },
  { nome: "Aniversário Mundo Pet", origem: "Orgânico", investimento: 0, leads: 31, conv: 9, roi: "—", status: "encerrada" },
];

export function Campanhas() {
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
            <button className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> Gerar com IA</button>
          </div>
          <div className="space-y-2">
            {gruposCampanhas.map(g => {
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
    </div>
  );
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
