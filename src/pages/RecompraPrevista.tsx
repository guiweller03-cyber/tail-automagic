import { recomprasPrevistas, type RecompraPrevista, type RecompraStatus } from "@/lib/mock";
import { useMemo, useState } from "react";
import {
  MessageCircle, ShoppingBag, Bell, CheckCheck, ArrowRightLeft,
  AlertTriangle, Calendar, TrendingUp, Search, MapPin, Sparkles,
} from "lucide-react";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusMap: Record<RecompraStatus, { label: string; cls: string; dot: string }> = {
  ok:        { label: "OK",       cls: "bg-success/10 text-success border-success/30",         dot: "bg-success" },
  semana:    { label: "Semana",   cls: "bg-amber-500/10 text-amber-600 border-amber-500/30",   dot: "bg-amber-500" },
  urgente:   { label: "Urgente",  cls: "bg-destructive/10 text-destructive border-destructive/30", dot: "bg-destructive" },
  atrasado:  { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/40", dot: "bg-destructive" },
};

type Filtro =
  | "Todos" | "Hoje" | "3 dias" | "7 dias" | "Atrasados"
  | "VIP" | "Premium" | "Econômico" | "Cachorro" | "Gato";

const filtros: Filtro[] = [
  "Todos", "Hoje", "3 dias", "7 dias", "Atrasados",
  "VIP", "Premium", "Econômico", "Cachorro", "Gato",
];

export function RecompraPrevista() {
  const [items, setItems] = useState<RecompraPrevista[]>(recomprasPrevistas);
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    return items.filter((r) => {
      if (busca && !`${r.cliente} ${r.pet} ${r.racao}`.toLowerCase().includes(busca.toLowerCase())) return false;
      switch (filtro) {
        case "Hoje":      return r.diasRestantes <= 0 && r.diasRestantes >= -1;
        case "3 dias":    return r.diasRestantes >= 0 && r.diasRestantes <= 3;
        case "7 dias":    return r.diasRestantes >= 0 && r.diasRestantes <= 7;
        case "Atrasados": return r.diasRestantes < 0;
        case "VIP":       return r.perfil === "VIP";
        case "Premium":   return r.perfil === "Premium";
        case "Econômico": return r.perfil === "Econômico";
        case "Cachorro":  return r.especie === "cachorro";
        case "Gato":      return r.especie === "gato";
        default:          return true;
      }
    });
  }, [items, filtro, busca]);

  const valorPrevisto = items.reduce((s, r) => s + r.valorEstimado, 0);
  const atrasados = items.filter((r) => r.diasRestantes < 0).length;
  const semana = items.filter((r) => r.diasRestantes >= 0 && r.diasRestantes <= 7).length;
  const conversaoSemana = 64;

  function marcarContatado(id: string) {
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, contatado: !r.contatado } : r)));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="size-6 text-primary" /> Recompra Prevista
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Previsão por consumo médio do pet · alertas 4 dias antes do fim do produto
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
          <Sparkles className="size-3.5" /> Disparar todos via IA
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<TrendingUp className="size-4" />} label="Valor previsto" value={brl(valorPrevisto)} tone="primary" />
        <Kpi icon={<Calendar className="size-4" />} label="Em recompra" value={String(items.length)} sub={`${semana} nos próx. 7d`} />
        <Kpi icon={<AlertTriangle className="size-4" />} label="Atrasados" value={String(atrasados)} tone="destructive" sub="ação urgente" />
        <Kpi icon={<CheckCheck className="size-4" />} label="Conversão semana" value={`${conversaoSemana}%`} tone="success" sub="+8 pp vs semana ant." />
      </div>

      {/* Filtros + busca */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, pet ou ração..."
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filtros.map((f) => {
            const on = filtro === f;
            return (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  on ? "bg-foreground text-background border-foreground"
                     : "bg-card border-border hover:border-foreground/30"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela */}
      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
                <th className="text-left font-semibold px-3 py-2.5">Cliente</th>
                <th className="text-left font-semibold px-3 py-2.5">Pet</th>
                <th className="text-left font-semibold px-3 py-2.5">Ração atual</th>
                <th className="text-left font-semibold px-3 py-2.5">Última</th>
                <th className="text-center font-semibold px-3 py-2.5">Dias</th>
                <th className="text-left font-semibold px-3 py-2.5">Prevista</th>
                <th className="text-right font-semibold px-3 py-2.5">Estimado</th>
                <th className="text-center font-semibold px-3 py-2.5">Status</th>
                <th className="text-right font-semibold px-3 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => {
                const st = statusMap[r.status];
                const wpp = `https://wa.me/55${r.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Oi ${r.cliente.split(" ")[0]}! 🐾 A ${r.racao} do ${r.pet} deve estar acabando essa semana. Posso já separar?`
                )}`;
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-secondary/40 transition ${
                      r.contatado ? "opacity-60" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-xs">{r.cliente}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="size-3" /> {r.cidade} · {r.bairro}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <SpeciePill especie={r.especie} compact />
                        <span className="font-semibold text-xs">{r.pet}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">{r.racao}
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {r.pesoKg}kg · {(r.consumoDiaKg * 1000).toFixed(0)}g/dia
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{r.ultimaCompra}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`font-bold text-sm ${
                        r.diasRestantes < 0 ? "text-destructive" :
                        r.diasRestantes <= 3 ? "text-destructive" :
                        r.diasRestantes <= 7 ? "text-amber-600" : "text-foreground"
                      }`}>
                        {r.diasRestantes < 0 ? `${Math.abs(r.diasRestantes)}d atraso` : `${r.diasRestantes}d`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">{r.dataPrevista}</td>
                    <td className="px-3 py-3 text-right font-bold text-xs">{brl(r.valorEstimado)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold border ${st.cls}`}>
                        <span className={`size-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={wpp} target="_blank" rel="noreferrer"
                          title="Abrir WhatsApp"
                          className="size-8 grid place-items-center rounded-lg bg-success/15 text-success hover:bg-success/25 transition"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                        <button title="Gerar pedido" className="size-8 grid place-items-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition">
                          <ShoppingBag className="size-4" />
                        </button>
                        <button title="Lembrete IA" className="size-8 grid place-items-center rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition">
                          <Sparkles className="size-4" />
                        </button>
                        <button title="Follow-up" className="size-8 grid place-items-center rounded-lg bg-secondary hover:bg-secondary/70 transition">
                          <Bell className="size-4" />
                        </button>
                        <button
                          title="Marcar contatado"
                          onClick={() => marcarContatado(r.id)}
                          className={`size-8 grid place-items-center rounded-lg transition ${
                            r.contatado
                              ? "bg-success text-success-foreground"
                              : "bg-secondary hover:bg-secondary/70"
                          }`}
                        >
                          <CheckCheck className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Nenhum cliente neste filtro.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  tone?: "primary" | "success" | "destructive";
}) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
        <span className={toneCls}>{icon}</span> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function SpeciePill({ especie, compact }: { especie: "cachorro" | "gato"; compact?: boolean }) {
  const isDog = especie === "cachorro";
  const cls = isDog
    ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"
    : "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cls}`}>
      {isDog ? "🐶" : "🐱"} {!compact && (isDog ? "Cachorro" : "Gato")}
    </span>
  );
}
