import { origemLeads } from "@/lib/mock";
import { Plus, Megaphone, Users, TrendingUp } from "lucide-react";

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
