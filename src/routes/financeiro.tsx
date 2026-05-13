import { createFileRoute } from "@tanstack/react-router";
import { Financeiro } from "@/pages/Financeiro";
export const Route = createFileRoute("/financeiro")({ component: Financeiro });
