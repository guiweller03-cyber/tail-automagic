import { automacoes } from "@/lib/mock";
import { Zap, Play, Pause } from "lucide-react";
import { useState } from "react";

export function Automacoes() {
  const [items, setItems] = useState(automacoes);
  const toggle = (i: number) =>
    setItems((arr) => arr.map((a, idx) => (idx === i ? { ...a, ativo: !a.ativo } : a)));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-sm text-muted-foreground">Fluxos n8n + WhatsApp + IA executando em segundo plano</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((a, i) => (
          <div key={a.nome} className="card-soft p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
                <Zap className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{a.nome}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
              </div>
              <button
                onClick={() => toggle(i)}
                className={`relative w-11 h-6 rounded-full transition shrink-0 ${a.ativo ? "bg-success" : "bg-border"}`}
                aria-label="toggle"
              >
                <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${a.ativo ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-xs">
              <span className="text-muted-foreground">Execuções hoje</span>
              <span className="font-bold">{a.execHoje}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 h-9 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70">
                {a.ativo ? <><Pause className="size-3.5" /> Pausar</> : <><Play className="size-3.5" /> Ativar</>}
              </button>
              <button className="flex-1 h-9 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70">Editar fluxo</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
