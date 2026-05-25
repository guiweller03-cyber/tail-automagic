import { Search, MessageCircle, Flame, Package2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

type ProdutoProcurado = {
  id: string;
  termo: string;
  telefone: string | null;
  nome_cliente: string | null;
  contexto: string | null;
  vezes: number;
  criado_em: string;
  atualizado_em: string;
};

export function ProdutosProcurados() {
  const [busca, setBusca] = useState("");
  const [produtos, setProdutos] = useState<ProdutoProcurado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const navigate = useNavigate();
  const list = produtos.filter(
    (produto) =>
      produto.termo.toLowerCase().includes(busca.toLowerCase()) ||
      produto.nome_cliente?.toLowerCase().includes(busca.toLowerCase()),
  );

  useEffect(() => {
    async function carregarProdutosProcurados() {
      try {
        const response = await fetch("/api/crm/produtos-procurados", { cache: "no-store" });
        const data = (await response.json()) as ProdutoProcurado[] | { erro?: string };
        if (!response.ok) {
          throw new Error("erro" in data ? data.erro : "Erro ao carregar produtos procurados");
        }

        setProdutos(data as ProdutoProcurado[]);
      } catch (error) {
        setErro(error instanceof Error ? error.message : "Erro desconhecido");
      }
    }

    void carregarProdutosProcurados();
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produtos Procurados</h1>
        <p className="text-sm text-muted-foreground">
          Itens pedidos pelos clientes que <b>nao existem no estoque</b> e foram registrados pelo
          atendimento IA.
        </p>
      </div>

      {erro && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              placeholder="Buscar produto ou cliente..."
            />
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {list.length} produtos - {list.reduce((total, produto) => total + produto.vezes, 0)}{" "}
            pedidos perdidos
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
                <th className="font-semibold px-4 py-3 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {list.map((produto) => {
                const altaDemanda = produto.vezes >= 5;
                const registradoEm = new Date(produto.atualizado_em || produto.criado_em);

                return (
                  <tr
                    key={produto.id}
                    className="border-t border-border hover:bg-secondary/30 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="size-9 rounded-lg bg-secondary grid place-items-center shrink-0">
                          <Package2 className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold leading-tight">{produto.termo}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {produto.contexto || "Registrado pelo atendimento IA"}
                          </div>
                          {altaDemanda && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                              <Flame className="size-2.5" /> Alta demanda detectada
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">{produto.nome_cliente || "Cliente"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground font-mono text-xs">
                      {produto.telefone || "-"}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {registradoEm.toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                      {registradoEm.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex size-7 items-center justify-center rounded-full font-bold text-xs ${
                          altaDemanda
                            ? "bg-destructive/10 text-destructive"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {produto.vezes}
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
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum produto encontrado.
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
