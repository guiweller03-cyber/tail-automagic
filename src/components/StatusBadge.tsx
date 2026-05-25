import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  novo: "bg-secondary text-foreground",
  pago: "bg-primary/15 text-primary",
  separando: "bg-accent/15 text-accent",
  "em rota": "bg-chart-4/20 text-foreground",
  entregue: "bg-success/15 text-success",
  cancelado: "bg-destructive/10 text-destructive",
  aguardando: "bg-secondary text-muted-foreground",
  concluída: "bg-success/15 text-success",
  IA: "bg-primary/15 text-primary",
  Humano: "bg-secondary text-foreground",
  Aguardando: "bg-accent/15 text-accent",
  VIP: "bg-accent/15 text-accent",
  Premium: "bg-primary/15 text-primary",
  Econômico: "bg-secondary text-muted-foreground",
  Novo: "bg-success/15 text-success",
  Risco: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize",
        map[value] ?? "bg-secondary",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {value}
    </span>
  );
}
