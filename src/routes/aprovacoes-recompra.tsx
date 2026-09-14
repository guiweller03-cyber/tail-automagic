import { createFileRoute } from "@tanstack/react-router";
import { AprovacoesRecompra } from "@/pages/AprovacoesRecompra";

export const Route = createFileRoute("/aprovacoes-recompra")({
  component: AprovacoesRecompra,
});
