import { Bot, Sparkles, Power } from "lucide-react";
import { motion } from "framer-motion";

export function AIAssistantToggle({
  enabled,
  onToggle,
  saving = false,
  label = "IA Assistente",
  onText = "Ligada - respondendo",
  offText = "Desligada - manual",
  showLabelOnMobile = false,
  className = "",
}: {
  enabled: boolean;
  onToggle: () => void;
  saving?: boolean;
  label?: string;
  onText?: string;
  offText?: string;
  showLabelOnMobile?: boolean;
  className?: string;
}) {
  const compactClass = showLabelOnMobile
    ? "gap-2 rounded-full pl-2 pr-3"
    : "gap-0 px-1.5 rounded-lg sm:gap-2 sm:rounded-full sm:pl-2 sm:pr-3";

  return (
    <motion.button
      layout
      disabled={saving}
      onClick={onToggle}
      className={`group inline-flex items-center py-1.5 border text-xs font-semibold transition disabled:cursor-wait disabled:opacity-70 ${compactClass} ${
        enabled
          ? "bg-gradient-to-r from-primary/20 to-accent/20 border-primary/40 text-foreground"
          : "bg-secondary border-border text-muted-foreground"
      } ${className}`}
      title={saving ? "Salvando status da IA" : enabled ? "IA ligada" : "IA desligada"}
    >
      <span
        className={`relative size-6 rounded-full grid place-items-center ${
          enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {enabled ? <Sparkles className="size-3.5" /> : <Power className="size-3.5" />}
        {enabled && (
          <motion.span
            className="absolute inset-0 rounded-full bg-primary/40"
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </span>
      <span
        className={`${showLabelOnMobile ? "flex" : "hidden sm:flex"} flex-col items-start leading-tight`}
      >
        <span className="flex items-center gap-1">
          <Bot className="size-3" /> {label}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wide ${enabled ? "text-success" : "text-muted-foreground"}`}
        >
          {saving ? "Salvando..." : enabled ? onText : offText}
        </span>
      </span>
    </motion.button>
  );
}
