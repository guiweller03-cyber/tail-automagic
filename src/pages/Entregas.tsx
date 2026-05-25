import { StatusBadge } from "@/components/StatusBadge";
import { clientes as clientesMock, entregas, type Entrega } from "@/lib/mock";
import { onCrmReload } from "@/lib/crm-refresh";
import { CheckCircle2, ExternalLink, MapPin, Navigation, Phone, Route, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ClienteApi = {
  id: string;
  nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  ticket: number;
  proxRecompra: string;
  cidade?: string;
};

type EntregaPrevista = Entrega & {
  telefone?: string;
  cidade?: string;
  valorPrevisto?: number;
};

const origemRota = "Mundo Pet Delivery";

function enderecoCompleto(entrega: EntregaPrevista): string {
  return [entrega.endereco, entrega.bairro, entrega.cidade ?? "Sao Paulo"]
    .filter(Boolean)
    .join(", ");
}

function mapsSearchUrl(entrega: EntregaPrevista): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(entrega))}`;
}

function mapsEmbedUrl(entrega: EntregaPrevista): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(enderecoCompleto(entrega))}&z=15&output=embed`;
}

function mapsRouteUrl(paradas: EntregaPrevista[]): string {
  const enderecos = paradas.map(enderecoCompleto).filter(Boolean);

  if (enderecos.length === 0) return "https://www.google.com/maps";
  if (enderecos.length === 1) return mapsSearchUrl(paradas[0]);

  const [destino, ...restanteInvertido] = [...enderecos].reverse();
  const waypoints = restanteInvertido.reverse();
  const params = new URLSearchParams({
    api: "1",
    origin: origemRota,
    destination: destino,
    travelmode: "driving",
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function entregaFromCliente(cliente: ClienteApi, index: number): EntregaPrevista | null {
  if (!cliente.endereco && !cliente.bairro) return null;

  return {
    id: `PREV-${String(index + 1).padStart(3, "0")}`,
    cliente: cliente.nome,
    endereco: cliente.endereco || cliente.bairro,
    bairro: cliente.bairro,
    eta: `${String(10 + index * 2).padStart(2, "0")}:30`,
    status: index === 0 ? "em rota" : "aguardando",
    telefone: cliente.telefone,
    cidade: cliente.cidade,
    valorPrevisto: cliente.ticket,
  };
}

export function Entregas() {
  const [clientes, setClientes] = useState<ClienteApi[]>(clientesMock);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function carregarClientes() {
      try {
        const response = await fetch("/api/crm/clientes", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as ClienteApi[];
        if (!ignore) setClientes(data);
      } catch (error) {
        console.error("Erro ao carregar clientes para entregas:", error);
      }
    }

    void carregarClientes();
    const offCrmReload = onCrmReload(() => void carregarClientes());

    return () => {
      ignore = true;
      offCrmReload();
    };
  }, []);

  const entregasPrevistas = useMemo<EntregaPrevista[]>(() => {
    if (entregas.length > 0) return entregas;

    return clientes
      .map(entregaFromCliente)
      .filter((entrega): entrega is EntregaPrevista => Boolean(entrega))
      .slice(0, 8);
  }, [clientes]);

  const activeEntrega =
    entregasPrevistas.find((entrega) => entrega.id === activeId) ?? entregasPrevistas[0];
  const rotaUrl = mapsRouteUrl(entregasPrevistas);
  const bairros = new Set(entregasPrevistas.map((entrega) => entrega.bairro).filter(Boolean)).size;
  const receitaPrevista = entregasPrevistas.reduce(
    (total, entrega) => total + (entrega.valorPrevisto ?? 0),
    0,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Entregas de hoje</h1>
          <p className="text-sm text-muted-foreground">
            {entregasPrevistas.length} paradas previstas · rota otimizada por bairro
          </p>
        </div>
        <a
          href={rotaUrl}
          target="_blank"
          rel="noreferrer"
          className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2"
        >
          <Navigation className="size-4" /> Iniciar rota
        </a>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="card-soft p-0 overflow-hidden">
          <div className="relative h-80 bg-secondary">
            {activeEntrega ? (
              <>
                <iframe
                  title={`Mapa da entrega ${activeEntrega.id}`}
                  src={mapsEmbedUrl(activeEntrega)}
                  className="absolute inset-0 h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <Route className="size-3.5" /> Parada selecionada
                  </div>
                  <div className="mt-1 text-sm font-semibold">{activeEntrega.cliente}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {enderecoCompleto(activeEntrega)}
                  </div>
                </div>
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                <div className="text-center">
                  <Truck className="size-10 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-semibold">Nenhuma entrega prevista com endereço</p>
                  <p className="text-xs">
                    Cadastre endereço ou bairro nos clientes para montar o mapa.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="divide-y divide-border">
            {entregasPrevistas.map((entrega, index) => (
              <button
                key={entrega.id}
                onClick={() => setActiveId(entrega.id)}
                className={`w-full p-4 flex items-start gap-3 text-left transition hover:bg-secondary/40 ${
                  activeEntrega?.id === entrega.id ? "bg-primary/5" : ""
                }`}
              >
                <div className="size-9 rounded-full bg-accent text-accent-foreground font-bold text-sm grid place-items-center shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold truncate">{entrega.cliente}</span>
                    <StatusBadge value={entrega.status} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="size-3" /> {entrega.endereco} · {entrega.bairro}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pedido{" "}
                    <span className="font-mono font-semibold text-foreground">{entrega.id}</span> ·
                    ETA {entrega.eta}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5" /> Entregue
                    </span>
                    <a
                      href={entrega.telefone ? `tel:${entrega.telefone}` : undefined}
                      onClick={(event) => event.stopPropagation()}
                      className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Phone className="size-3.5" /> Ligar
                    </a>
                    <a
                      href={mapsSearchUrl(entrega)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Navigation className="size-3.5" /> Navegar
                    </a>
                  </div>
                </div>
              </button>
            ))}
            {entregasPrevistas.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">
                Nenhuma entrega prevista encontrada. O mapa será preenchido quando houver clientes
                com endereço ou bairro.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-soft p-5">
            <h3 className="font-semibold mb-3">Resumo da rota</h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex justify-between">
                <span className="text-muted-foreground">Paradas</span>
                <span className="font-semibold">{entregasPrevistas.length}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Bairros</span>
                <span className="font-semibold">{bairros}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Primeira parada</span>
                <span className="font-semibold">{entregasPrevistas[0]?.eta ?? "-"}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-muted-foreground">Receita prevista</span>
                <span className="font-semibold text-success">
                  {receitaPrevista.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </li>
            </ul>
            <a
              href={rotaUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 h-10 w-full rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="size-3.5" /> Abrir rota completa no Maps
            </a>
          </div>
          <div className="card-soft p-5 bg-success/5 border-success/30">
            <p className="text-xs font-semibold text-success uppercase">Mensagens automáticas</p>
            <p className="text-sm mt-2">
              Os clientes serão notificados a cada etapa: saída, "faltam 15 min" e entrega
              concluída.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
