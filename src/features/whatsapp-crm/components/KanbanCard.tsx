import { motion } from "framer-motion";
import { Flame, AlertTriangle, MessageCircle, Sparkles, Tag } from "lucide-react";
import type { LeadCard } from "../types";
import { calculateLeadCost, intentColor, priorityRing } from "../services";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function KanbanCardItem({
  lead, onOpen, onDragStart, aiEnabled,
}: {
  lead: LeadCard;
  onOpen: (lead: LeadCard) => void;
  onDragStart: (id: string) => void;
  aiEnabled: boolean;
}) {
  const cost = calculateLeadCost(lead);
  const hot = lead.intent === "quente" || lead.intent === "comprando";
  const risk = lead.churnRisk >= 65;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      whileHover={{ y: -2 }}
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onClick={() => onOpen(lead)}
      className={`relative cursor-grab active:cursor-grabbing rounded-xl bg-card border border-border p-3 hover:border-foreground/20 transition ${priorityRing(lead.priority)}`}
    >
      {hot && (
        <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-accent text-accent-foreground shadow">
          <Flame className="size-2.5" /> QUENTE
        </span>
      )}
      {risk && !hot && (
        <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-destructive text-destructive-foreground shadow">
          <AlertTriangle className="size-2.5" /> RISCO
        </span>
      )}

      <div className="flex items-center gap-2">
        <div className="size-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center text-[10px] font-bold">
          {lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold truncate">{lead.nome}</div>
          <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            <MessageCircle className="size-2.5" /> {lead.ultimaInteracao} · {lead.tags[0] ?? "Sem tag"}
          </div>
        </div>
      </div>

      <div className={`mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${intentColor(lead.intent)}`}>
        {lead.intent === "comprando" && <Sparkles className="size-2.5" />}
        {lead.intent.toUpperCase()}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground min-w-0">
          <span className="block font-semibold text-foreground">
            CAC {lead.custoLead > 0 ? cost.cac.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "orgânico"}
          </span>
          <span className="opacity-70 truncate block">{lead.origem}{lead.cupom ? ` · ${lead.cupom}` : ""}</span>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] text-muted-foreground uppercase">LTV</div>
          <div className="text-[11px] font-bold text-success">{brl(lead.ticketMedio * lead.comprasRealizadas)}</div>
        </div>
      </div>

      {aiEnabled && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[9px]">
          <span className="inline-flex items-center gap-1 text-primary font-semibold">
            <Sparkles className="size-2.5" /> IA monitorando
          </span>
          {lead.cupom && (
            <span className="inline-flex items-center gap-0.5 text-accent font-semibold">
              <Tag className="size-2.5" /> {lead.cupom}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
