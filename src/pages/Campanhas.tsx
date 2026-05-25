import { Megaphone, TrendingUp, Users } from "lucide-react";

const campanhas: {
  nome: string;
  origem: string;
  investimento: number;
  leads: number;
  conv: number;
  roi: string;
  status: string;
}[] = [];

export function Campanhas() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Campanhas</h1>
        <p className="text-sm text-muted-foreground">Tracking de origem, conversao e ROI</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card icon={<Megaphone className="size-5" />} label="Campanhas ativas" value="0" />
        <Card icon={<Users className="size-5" />} label="Novos leads (30d)" value="0" />
        <Card icon={<TrendingUp className="size-5" />} label="ROI medio" value="0x" />
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
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Conversoes</th>
                <th className="font-medium px-4 py-3">ROI</th>
                <th className="font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {campanhas.map((campanha) => (
                <tr key={campanha.nome} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold">{campanha.nome}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {campanha.origem}
                  </td>
                  <td className="px-4 py-3">R$ {campanha.investimento.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{campanha.leads}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{campanha.conv}</td>
                  <td className="px-4 py-3 font-bold text-success">{campanha.roi}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-secondary text-muted-foreground">
                      {campanha.status}
                    </span>
                  </td>
                </tr>
              ))}
              {campanhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma campanha cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card-soft p-4 flex items-center gap-4">
      <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center">
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}
