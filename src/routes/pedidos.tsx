import { createFileRoute } from "@tanstack/react-router";
import { Pedidos } from "@/pages/Pedidos";
export const Route = createFileRoute("/pedidos")({ component: Pedidos });
