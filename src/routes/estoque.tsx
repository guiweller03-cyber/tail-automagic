import { createFileRoute } from "@tanstack/react-router";
import { Estoque } from "@/pages/Estoque";
export const Route = createFileRoute("/estoque")({ component: Estoque });
