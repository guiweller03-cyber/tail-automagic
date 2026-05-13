import { createFileRoute } from "@tanstack/react-router";
import { Entregas } from "@/pages/Entregas";
export const Route = createFileRoute("/entregas")({ component: Entregas });
