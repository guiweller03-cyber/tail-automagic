import { clientes } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, MessageCircle, Phone } from "lucide-react";

export function Clientes() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} tutores · 9 pets cadastrados</p>
        </div>
        <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo cliente
        </button>
      </div>

      <div className="card-soft p-3 flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none" placeholder="Buscar por nome, pet ou telefone..." />
        </div>
        {["Todos", "VIP", "Premium", "Econômico", "Risco"].map((f, i) => (
          <button key={f} className={`h-10 px-3.5 rounded-lg text-sm font-medium ${i === 0 ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/70"}`}>{f}</button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Cliente</th>
                <th className="font-medium px-4 py-3">Pets</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Bairro</th>
                <th className="font-medium px-4 py-3">Ticket</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Última compra</th>
                <th className="font-medium px-4 py-3">Perfil</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-primary/15 text-primary font-semibold text-xs grid place-items-center">
                        {c.nome.split(" ").map(n=>n[0]).slice(0,2).join("")}
                      </div>
                      <div>
                        <div className="font-semibold">{c.nome}</div>
                        <div className="text-xs text-muted-foreground">{c.telefone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.pets.map(p=>"🐾 "+p).join(", ")}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{c.bairro}</td>
                  <td className="px-4 py-3 font-semibold">R$ {c.ticket.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{c.ultima}</td>
                  <td className="px-4 py-3"><StatusBadge value={c.perfil} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="p-2 rounded-lg hover:bg-success/10 text-success"><MessageCircle className="size-4" /></button>
                      <button className="p-2 rounded-lg hover:bg-secondary text-muted-foreground"><Phone className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
