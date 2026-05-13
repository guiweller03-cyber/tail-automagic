import { createFileRoute } from "@tanstack/react-router";
import { ProdutosProcurados } from "@/pages/ProdutosProcurados";
export const Route = createFileRoute("/produtos-procurados")({ component: ProdutosProcurados });
