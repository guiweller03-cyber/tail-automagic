import { entregas } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { MapPin, Navigation, Phone, CheckCircle2, Truck } from "lucide-react";

export function Entregas() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Entregas de hoje</h1>
          <p className="text-sm text-muted-foreground">{entregas.length} paradas · rota otimizada por bairro</p>
        </div>
        <button className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold inline-flex items-center gap-2">
          <Navigation className="size-4" /> Iniciar rota
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="card-soft p-0 overflow-hidden">
          {/* Mapa stub */}
          <div className="relative h-72 bg-gradient-to-br from-primary/15 via-secondary to-accent/10">
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <div className="text-center">
                <Truck className="size-10 mx-auto mb-2 text-primary" />
                <p className="text-sm font-semibold">Mapa da rota · Google Maps</p>
                <p className="text-xs">4 paradas · 18 km · ~1h 25min</p>
              </div>
            </div>
            {[
              { top: "20%", left: "30%" },
              { top: "55%", left: "55%" },
              { top: "35%", left: "70%" },
              { top: "70%", left: "25%" },
            ].map((pos, i) => (
              <div key={i} className="absolute" style={pos}>
                <div className="size-7 rounded-full bg-accent text-accent-foreground font-bold text-xs grid place-items-center shadow-lg ring-4 ring-background">{i+1}</div>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border">
            {entregas.map((e, i) => (
              <div key={e.id} className="p-4 flex items-start gap-3">
                <div className="size-9 rounded-full bg-accent text-accent-foreground font-bold text-sm grid place-items-center shrink-0">{i+1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{e.cliente}</span>
                    <StatusBadge value={e.status} />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="size-3" /> {e.endereco} · {e.bairro}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pedido <span className="font-mono font-semibold text-foreground">{e.id}</span> · ETA {e.eta}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5" /> Entregue
                    </button>
                    <button className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" /> Ligar
                    </button>
                    <button className="h-9 px-3 rounded-lg bg-secondary text-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                      <Navigation className="size-3.5" /> Navegar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-soft p-5">
            <h3 className="font-semibold mb-3">Resumo da rota</h3>
            <ul className="space-y-2.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Distância</span><span className="font-semibold">18 km</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Tempo estimado</span><span className="font-semibold">1h 25min</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Combustível</span><span className="font-semibold">R$ 14,30</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Receita prevista</span><span className="font-semibold text-success">R$ 1.116,60</span></li>
            </ul>
          </div>
          <div className="card-soft p-5 bg-success/5 border-success/30">
            <p className="text-xs font-semibold text-success uppercase">Mensagens automáticas</p>
            <p className="text-sm mt-2">Os clientes serão notificados a cada etapa: saída, "faltam 15 min" e entrega concluída ❤️</p>
          </div>
        </div>
      </div>
    </div>
  );
}
