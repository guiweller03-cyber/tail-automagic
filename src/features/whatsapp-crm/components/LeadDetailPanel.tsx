import { motion, AnimatePresence } from "framer-motion";
import {
  X, Phone, MessageCircle, Tag, Target, DollarSign, Sparkles,
  TrendingUp, Gift, Megaphone, Clock, AlertTriangle,
} from "lucide-react";
import type { LeadCard } from "../types";
import { calculateLeadCost, detectLeadSource } from "../services";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function LeadDetailPanel({ lead, onClose }: { lead: LeadCard | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div
            className="fixed inset-0 bg-foreground/30 z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            <Header lead={lead} onClose={onClose} />
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
              <CostBlock lead={lead} />
              <OriginBlock lead={lead} />
              <FinanceBlock lead={lead} />
              <RelationshipBlock lead={lead} />
              <CampaignsBlock lead={lead} />
              <HistoryBlock lead={lead} />
            </div>
            <Footer lead={lead} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Header({ lead, onClose }: { lead: LeadCard; onClose: () => void }) {
  return (
    <div className="p-4 border-b border-border bg-gradient-to-br from-primary/10 to-accent/10 flex items-start gap-3">
      <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center font-bold text-primary-foreground">
        {lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{lead.nome}</div>
        <div className="text-[11px] text-muted-foreground">{lead.telefone}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {lead.tags.map((t) => (
            <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-secondary">{t}</span>
          ))}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
            lead.intent === "comprando" ? "bg-success/20 text-success" :
            lead.intent === "quente" ? "bg-accent/20 text-accent" :
            lead.intent === "morno" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}>{lead.intent.toUpperCase()}</span>
        </div>
      </div>
      <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5 px-1">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

/** Mostra apenas o custo individual — nunca o total da campanha. */
function CostBlock({ lead }: { lead: LeadCard }) {
  const cost = calculateLeadCost(lead);
  return (
    <Section icon={<DollarSign className="size-3" />} title="Custo deste lead">
      <div className="rounded-xl border border-border p-3 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="text-[10px] uppercase tracking-wide text-primary font-bold">CAC individual</div>
        <div className="text-2xl font-bold text-primary mt-0.5">
          {lead.custoLead > 0 ? brl(lead.custoLead) : "Orgânico"}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">{cost.pretty}</div>
      </div>
    </Section>
  );
}

function OriginBlock({ lead }: { lead: LeadCard }) {
  return (
    <Section icon={<Target className="size-3" />} title="Origem do lead">
      <div className="rounded-xl border border-border p-2.5 space-y-1.5 bg-card">
        <div className="text-sm font-semibold">{lead.origem}</div>
        {lead.origemDetalhe && <div className="text-[11px] text-muted-foreground">{lead.origemDetalhe}</div>}
        <div className="flex flex-wrap gap-1 pt-1">
          {lead.utmSource && <Chip>utm: {lead.utmSource}</Chip>}
          {lead.utmCampaign && <Chip>camp: {lead.utmCampaign}</Chip>}
          {lead.anuncio && <Chip>{lead.anuncio}</Chip>}
          {lead.influenciador && <Chip tone="accent">{lead.influenciador}</Chip>}
          {lead.cupom && <Chip tone="accent"><Tag className="size-2.5" /> {lead.cupom}</Chip>}
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">
          Rastreio · {detectLeadSource(lead)}
        </div>
      </div>
    </Section>
  );
}

function FinanceBlock({ lead }: { lead: LeadCard }) {
  return (
    <Section icon={<TrendingUp className="size-3" />} title="Financeiro">
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Compras" value={String(lead.comprasRealizadas)} />
        <Stat label="Ticket médio" value={brl(lead.ticketMedio)} />
        <Stat label="Pontos" value={String(lead.pontos)} />
        <Stat label="Indicações" value={String(lead.indicacoesFeitas)} />
      </div>
    </Section>
  );
}

function RelationshipBlock({ lead }: { lead: LeadCard }) {
  return (
    <Section icon={<Sparkles className="size-3" />} title="Status do relacionamento">
      <div className="rounded-xl border border-border p-2.5 bg-card flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{lead.statusRelacionamento}</div>
          <div className="text-[10px] text-muted-foreground">Última interação: {lead.ultimaInteracao}</div>
        </div>
        <div className={`text-right ${lead.churnRisk >= 65 ? "text-destructive" : "text-success"}`}>
          <div className="text-[9px] uppercase font-bold tracking-wide flex items-center gap-1">
            {lead.churnRisk >= 65 && <AlertTriangle className="size-3" />} Risco churn
          </div>
          <div className="text-lg font-bold">{lead.churnRisk}%</div>
        </div>
      </div>
    </Section>
  );
}

function CampaignsBlock({ lead }: { lead: LeadCard }) {
  if (lead.campanhasRecebidas.length === 0) return null;
  return (
    <Section icon={<Megaphone className="size-3" />} title="Campanhas recebidas">
      <div className="flex flex-wrap gap-1">
        {lead.campanhasRecebidas.map((c) => (
          <span key={c} className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary">{c}</span>
        ))}
      </div>
    </Section>
  );
}

function HistoryBlock({ lead }: { lead: LeadCard }) {
  return (
    <Section icon={<Clock className="size-3" />} title="Histórico rápido">
      <ul className="space-y-1 text-[11px]">
        <li>• Primeiro contato: <b>{lead.primeiroContato}</b></li>
        {lead.tempoAteCompra !== undefined && <li>• Tempo até primeira compra: <b>{lead.tempoAteCompra}d</b></li>}
        <li>• Último atendimento: <b>{lead.ultimoAtendimento}</b></li>
        {lead.produtosFavoritos.length > 0 && (
          <li>• Favoritos: <b>{lead.produtosFavoritos.join(", ")}</b></li>
        )}
      </ul>
    </Section>
  );
}

function Footer({ lead: _lead }: { lead: LeadCard }) {
  return (
    <div className="p-3 border-t border-border grid grid-cols-2 gap-2">
      <button className="h-9 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-90">
        <MessageCircle className="size-4" /> WhatsApp
      </button>
      <button className="h-9 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70">
        <Phone className="size-4" /> Ligar
      </button>
      <button className="col-span-2 h-9 rounded-lg bg-primary/15 text-primary text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/25">
        <Gift className="size-4" /> Enviar oferta personalizada
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-bold text-xs mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "accent" }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
      tone === "accent" ? "bg-accent/15 text-accent" : "bg-secondary"
    }`}>{children}</span>
  );
}
