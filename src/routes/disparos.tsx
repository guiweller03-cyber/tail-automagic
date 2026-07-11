import { createFileRoute } from "@tanstack/react-router";
import { Disparos } from "@/pages/Disparos";

export const Route = createFileRoute("/disparos")({ component: Disparos });
