import { useId, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { conversaCorrespondeBusca } from "@/lib/conversa-search";

type Contato = { id?: string; cliente: string; telefone: string };

export function SelecionarContato({
  contatos,
  value,
  onChange,
  permitirManual = false,
}: {
  contatos: Contato[];
  value: Contato | null;
  onChange: (contato: Contato | null) => void;
  permitirManual?: boolean;
}) {
  const id = useId();
  const [busca, setBusca] = useState("");
  const [manual, setManual] = useState(false);
  const opcoes = useMemo(() => {
    const unicos = new Map<string, Contato>();
    for (const contato of contatos) {
      const telefone = contato.telefone.replace(/\D/g, "");
      if (!telefone) continue;
      const chave = telefone.replace(/^55(?=\d{10,11}$)/, "");
      const anterior = unicos.get(chave);
      if (!anterior || (!anterior.cliente.trim() && contato.cliente.trim())) {
        unicos.set(chave, contato);
      }
    }
    return [...unicos.values()].filter((contato) => conversaCorrespondeBusca(contato, busca));
  }, [contatos, busca]);
  const campo =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-2">
      <span className="block text-xs font-semibold">Contato do WhatsApp</span>
      {manual ? (
        <>
          <label className="block text-xs font-medium">
            Nome
            <input
              required
              maxLength={160}
              value={value?.cliente ?? ""}
              onChange={(event) =>
                onChange({ cliente: event.target.value, telefone: value?.telefone ?? "" })
              }
              className={`${campo} mt-1`}
              placeholder="Nome do contato"
            />
          </label>
          <label className="block text-xs font-medium">
            Telefone
            <input
              required
              type="tel"
              maxLength={25}
              value={value?.telefone ?? ""}
              onChange={(event) =>
                onChange({ cliente: value?.cliente ?? "", telefone: event.target.value })
              }
              className={`${campo} mt-1`}
              placeholder="DDD + telefone"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setManual(false);
              onChange(null);
            }}
            className="text-xs font-semibold underline"
          >
            Selecionar um contato da lista
          </button>
        </>
      ) : value ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-background p-3">
          <Check className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold">{value.cliente || value.telefone}</p>
            <p className="text-xs text-muted-foreground">{value.telefone}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBusca("");
              onChange(null);
            }}
            className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-secondary"
          >
            Trocar
          </button>
          {permitirManual && (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-secondary"
            >
              Editar
            </button>
          )}
        </div>
      ) : (
        <>
          <label htmlFor={`${id}-busca`} className="sr-only">
            Buscar contato por nome ou telefone
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id={`${id}-busca`}
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className={`${campo} pl-9`}
              placeholder="Buscar nome ou número"
              autoComplete="off"
            />
          </div>
          <ul
            aria-label="Contatos disponíveis"
            className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-1"
          >
            {opcoes.slice(0, 20).map((contato) => (
              <li key={contato.telefone}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...contato, cliente: contato.cliente.trim() || contato.telefone });
                    setBusca("");
                  }}
                  className="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-secondary focus-visible:bg-secondary"
                >
                  <span className="w-full truncate text-sm font-semibold">
                    {contato.cliente || "Sem nome"}
                  </span>
                  <span className="text-xs text-muted-foreground">{contato.telefone}</span>
                </button>
              </li>
            ))}
            {opcoes.length === 0 && (
              <li className="p-3 text-xs text-muted-foreground">
                {busca.trim() ? "Nenhum contato encontrado." : "Nenhum contato disponível."}
              </li>
            )}
          </ul>
          {opcoes.length > 20 && (
            <p className="text-[11px] text-muted-foreground">
              Mostrando 20 contatos. Busque pelo nome ou número para encontrar os demais.
            </p>
          )}
          {permitirManual && (
            <button
              type="button"
              onClick={() => setManual(true)}
              className="text-xs font-semibold underline"
            >
              Digitar outro número
            </button>
          )}
        </>
      )}
    </div>
  );
}
