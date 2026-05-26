import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";
import type { KanbanTab, LeadCard, SmartColumn } from "../types";
import { COLUMNS_BY_TAB, COLUMN_META, LEADS_MOCK, TABS } from "../data";
import { autoMoveKanbanCard, formatBRL } from "../services";
import { KanbanCardItem } from "./KanbanCard";
import { LeadDetailPanel } from "./LeadDetailPanel";

export function SmartKanban({ aiEnabled }: { aiEnabled: boolean }) {
  const [tab, setTab] = useState<KanbanTab>("Leads");
  const [items, setItems] = useState<LeadCard[]>(LEADS_MOCK);
  const [drag, setDrag] = useState<string | null>(null);
  const [open, setOpen] = useState<LeadCard | null>(null);

  const columns = COLUMNS_BY_TAB[tab];

  const visible = useMemo(() => {
    if (tab === "Leads") return items.filter((l) => l.tab === "Leads" || columns.includes(l.column));
    return items.filter((l) => l.tab === tab || columns.includes(l.column));
  }, [items, tab, columns]);

  function move(col: SmartColumn) {
    if (!drag) return;
    setItems((prev) => prev.map((l) => (l.id === drag ? { ...l, column: col } : l)));
    setDrag(null);
  }

  function runAutoMove() {
    setItems((prev) =>
      prev.map((l) => {
        const next = autoMoveKanbanCard(l);
        return next === l.column ? l : { ...l, column: next };
      })
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tabs + ações */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          {TABS.map((t) => {
            const ativo = tab === t;
            const count = items.filter((l) => l.tab === t).length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition ${
                  ativo
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card border-border hover:border-foreground/30"
                }`}
              >
                {t}
                <span className={`text-[10px] px-1.5 rounded-full ${ativo ? "bg-background/20" : "bg-secondary"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {aiEnabled && (
          <button
            onClick={runAutoMove}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition"
            title="A IA reanalisa cada card e move automaticamente"
          >
            <Wand2 className="size-3.5" /> Reorganizar com IA
          </button>
        )}
      </div>

      {/* Colunas */}
      <div className="flex-1 grid grid-flow-col auto-cols-[260px] gap-3 overflow-x-auto pb-2 min-h-0 scrollbar-thin">
        {columns.map((col) => {
          const list = visible.filter((l) => l.column === col);
          const total = list.reduce((s, l) => s + l.valorPotencial, 0);
          const meta = COLUMN_META[col];
          return (
            <div
              key={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => move(col)}
              className="bg-secondary/40 rounded-2xl p-3 flex flex-col min-h-[320px]"
            >
              <div className="flex items-center justify-between px-1 pb-2.5">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{col}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{meta.hint}</div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${meta.tone}`}>{list.length}</span>
                  <span className="text-[10px] text-success font-bold mt-0.5">{formatBRL(total)}</span>
                </div>
              </div>

              <div className="space-y-2 flex-1">
                <AnimatePresence>
                  {list.map((lead) => (
                    <KanbanCardItem
                      key={lead.id}
                      lead={lead}
                      onOpen={setOpen}
                      onDragStart={setDrag}
                      aiEnabled={aiEnabled}
                    />
                  ))}
                </AnimatePresence>
                {list.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                    Vazio
                  </div>
                )}
              </div>

              {aiEnabled && (
                <div className="pt-2 mt-2 border-t border-border flex items-center gap-1 text-[9px] text-primary font-semibold">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="inline-flex items-center gap-1"
                  >
                    <Sparkles className="size-2.5" /> IA observando
                  </motion.span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <LeadDetailPanel lead={open} onClose={() => setOpen(null)} />
    </div>
  );
}
