import { createFileRoute } from "@tanstack/react-router";
import { Cupons } from "@/pages/Cupons";
export const Route = createFileRoute("/cupons")({ component: Cupons });
