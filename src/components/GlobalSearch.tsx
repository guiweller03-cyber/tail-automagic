import { onCrmReload } from "@/lib/crm-refresh";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useGlobalSearch } from "@/lib/global-search";
import { clienteCorrespondeBusca, correspondeBusca } from "@/lib/crm-search";
import { conversaCorrespondeBusca } from "@/lib/conversa-search";
import type { Cliente, Pedido } from "@/lib/crm-types";

type ConversaResumo = { id: string; nome_cliente: string; telefone: string };

async function carregar<T>(endpoint: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(endpoint, { signal, credentials: "include" });
  if (!response.ok) throw new Error("Não foi possível carregar a busca");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Resposta inválida da busca");
  return data as T[];
}

export function GlobalSearch() {
  const { query, setQuery } = useGlobalSearch();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      onCrmReload(() => {
        void queryClient.invalidateQueries({ queryKey: ["busca-global"] });
      }),
    [queryClient],
  );
  const [aberta, setAberta] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const enabled = aberta && query.trim().length > 0;
  const clientes = useQuery({
    queryKey: ["busca-global", "clientes"],
    queryFn: ({ signal }) => carregar<Cliente>("/api/crm/clientes", signal),
    enabled,
    staleTime: 60_000,
  });
  const conversas = useQuery({
    queryKey: ["busca-global", "conversas"],
    queryFn: ({ signal }) => carregar<ConversaResumo>("/api/crm/conversas", signal),
    enabled,
    staleTime: 60_000,
  });
  const pedidos = useQuery({
    queryKey: ["busca-global", "pedidos"],
    queryFn: ({ signal }) => carregar<Pedido>("/api/crm/pedidos", signal),
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    setAberta(false);
    setQuery("");
  }, [location.pathname, setQuery]);
  useEffect(() => {
    const fechar = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setAberta(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, []);

  const resultados = useMemo(() => {
    const fichas = clientes.data ?? [];
    return {
      clientes: fichas.filter((cliente) => clienteCorrespondeBusca(cliente, query)).slice(0, 6),
      pets: fichas
        .flatMap((cliente) => {
          const nomes = [
            ...new Set(
              [
                ...(cliente.pets ?? []),
                ...(cliente.petsDetalhes ?? []).map((pet) => pet.nome),
              ].filter(Boolean),
            ),
          ];
          return nomes
            .filter((nome) => correspondeBusca(query, [nome, cliente.nome], [cliente.telefone]))
            .map((nome) => ({ nome, cliente }));
        })
        .slice(0, 6),
      conversas: (conversas.data ?? [])
        .filter((conversa) =>
          conversaCorrespondeBusca(
            { cliente: conversa.nome_cliente, telefone: conversa.telefone },
            query,
          ),
        )
        .slice(0, 6),
      pedidos: (pedidos.data ?? [])
        .filter((pedido) =>
          correspondeBusca(
            query,
            [pedido.id, pedido.cliente, pedido.pet, pedido.bairro],
            [pedido.telefone],
          ),
        )
        .slice(0, 6),
    };
  }, [clientes.data, conversas.data, pedidos.data, query]);
  const carregando = clientes.isFetching || conversas.isFetching || pedidos.isFetching;
  const erro = clientes.isError || conversas.isError || pedidos.isError;
  const total = Object.values(resultados).reduce((sum, rows) => sum + rows.length, 0);
  const linkClass =
    "block rounded-lg px-3 py-2 text-sm hover:bg-secondary focus:bg-secondary outline-none";
  const tituloClass = "px-3 pt-3 pb-1 text-xs font-semibold text-muted-foreground";
  const escolher = () => {
    setAberta(false);
    setQuery("");
  };

  return (
    <div
      ref={container}
      className="relative w-full"
      onKeyDown={(event) => {
        if (event.key === "Escape") setAberta(false);
        if (event.key === "ArrowDown" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          container.current?.querySelector<HTMLAnchorElement>("a")?.focus();
        }
      }}
    >
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onFocus={() => setAberta(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setAberta(true);
        }}
        aria-label="Busca global"
        aria-expanded={enabled}
        aria-controls="resultados-busca-global"
        placeholder="Buscar cliente, pet, telefone, pedido…"
        className="h-10 w-full rounded-xl border border-border bg-secondary/70 pl-9 pr-9 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:bg-card focus:ring-2 focus:ring-primary/10"
      />
      {query && (
        <button
          type="button"
          aria-label="Limpar busca global"
          onClick={escolher}
          className="absolute right-2 top-2 p-1 rounded hover:bg-card"
        >
          <X className="size-4" />
        </button>
      )}
      {enabled && (
        <div
          id="resultados-busca-global"
          aria-label="Resultados da busca global"
          className="absolute top-full mt-2 w-full max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-xl"
        >
          {carregando && (
            <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
              Buscando…
            </p>
          )}
          {erro && (
            <div role="alert" className="px-3 py-2 text-xs text-destructive">
              Parte dos resultados não pôde ser carregada.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  void clientes.refetch();
                  void conversas.refetch();
                  void pedidos.refetch();
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {!carregando && !erro && total === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado encontrado.</p>
          )}
          {resultados.clientes.length > 0 && <p className={tituloClass}>Clientes</p>}
          {resultados.clientes.map((cliente) => (
            <Link
              key={cliente.id}
              to="/clientes"
              search={{ busca: cliente.telefone || cliente.nome }}
              onClick={escolher}
              className={linkClass}
            >
              {cliente.nome}
              <span className="block text-xs text-muted-foreground">{cliente.telefone}</span>
            </Link>
          ))}
          {resultados.pets.length > 0 && <p className={tituloClass}>Pets</p>}
          {resultados.pets.map(({ nome, cliente }) => (
            <Link
              key={`${cliente.id}:${nome}`}
              to="/pets"
              search={{ busca: `${nome} ${cliente.nome}` }}
              onClick={escolher}
              className={linkClass}
            >
              {nome}
              <span className="block text-xs text-muted-foreground">Tutor: {cliente.nome}</span>
            </Link>
          ))}
          {resultados.conversas.length > 0 && <p className={tituloClass}>WhatsApp IA</p>}
          {resultados.conversas.map((conversa) => (
            <Link
              key={conversa.id}
              to="/conversas"
              search={{ telefone: conversa.telefone }}
              onClick={escolher}
              className={linkClass}
            >
              {conversa.nome_cliente || conversa.telefone}
              <span className="block text-xs text-muted-foreground">{conversa.telefone}</span>
            </Link>
          ))}
          {resultados.pedidos.length > 0 && <p className={tituloClass}>Pedidos</p>}
          {resultados.pedidos.map((pedido) => (
            <Link
              key={pedido.id}
              to="/pedidos"
              search={{ busca: pedido.id }}
              onClick={escolher}
              className={linkClass}
            >
              {pedido.cliente}
              <span className="block text-xs text-muted-foreground">
                {pedido.id} · {pedido.pet}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
