import { produtosProcurados } from "@/lib/mock";
import { Search, MessageCircle, Flame, Package2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

export function ProdutosProcurados() {
  const [busca, setBusca] = useState("");
  const navigate = useNavigate();
  const list = produtosProcurados.filter((p) =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) || p.cliente.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produtos Procurados</h1>
        <p className="text-sm text-muted-foreground">
          Itens pedidos pelos clientes que <b>não existem no estoque</b> — registrados automaticamente pela IA.
        </p>
      </div>

      <div className="card-soft overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              placeholder="Buscar produto ou cliente..."
            />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {list.length} produtos · {list.reduce((s, p) => s + p.vezes, 0)} pedidos perdidos
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground text-left">
                <th className="font-semibold px-4 py-3">Produto procurado</th>
                <th className="font-semibold px-4 py-3">Cliente</th>
                <th className="font-semibold px-4 py-3 hidden md:table-cell">Telefone</th>
                <th className="font-semibold px-4 py-3 hidden lg:table-cell">Data</th>
                <th className="font-semibold px-4 py-3 hidden lg:table-cell">Hora</th>
                <th className="font-semibold px-4 py-3 text-center">Pedidos</th>
                <th className="font-semibold px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const altaDemanda = p.vezes >= 5;
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/30 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="size-9 rounded-lg bg-secondary grid place-items-center shrink-0">
                          <Package2 className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight">{p.nome}</div>
                          <div className="text-[11px] text-muted-foreground">{p.categoria}</div>
                          {altaDemanda && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                              <Flame className="size-2.5" /> Alta demanda detectada
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{p.cliente}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground font-mono text-xs">{p.telefone}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{p.data}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{p.hora}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex size-7 items-center justify-center rounded-full font-bold text-xs ${
                        altaDemanda ? "bg-destructive/10 text-destructive" : "bg-secondary text-foreground"
                      }`}>
                        {p.vezes}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => navigate({ to: "/conversas" })}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold hover:opacity-90"
                      >
                        <MessageCircle className="size-3.5" /> Abrir conversa
                      </button>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
