import { createFileRoute } from "@tanstack/react-router";
import { Automacoes } from "@/pages/Automacoes";
export const Route = createFileRoute("/automacoes")({ component: Automacoes });
