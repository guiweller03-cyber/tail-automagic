import { createFileRoute } from "@tanstack/react-router";
import { Conversas } from "@/pages/Conversas";
export const Route = createFileRoute("/conversas")({ component: Conversas });
