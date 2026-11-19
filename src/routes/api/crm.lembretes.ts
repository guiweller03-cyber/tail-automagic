import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import { dataLembreteSchema, lembreteInputSchema } from "@/lib/lembretes";
import {
  concluirLembrete,
  excluirLembrete,
  listarLembretes,
  salvarLembrete,
} from "@/lib/lembretes-supabase";

const idSchema = z.string().uuid("Lembrete inválido");
const patchSchema = z.discriminatedUnion("acao", [
  z.object({ id: idSchema, acao: z.literal("editar"), ...lembreteInputSchema.shape }),
  z.object({ id: idSchema, acao: z.literal("concluir"), concluido: z.boolean() }),
]);
function erro(error: unknown) {
  const invalido = error instanceof z.ZodError || error instanceof SyntaxError;
  return Response.json(
    {
      erro:
        error instanceof z.ZodError
          ? error.issues[0].message
          : invalido
            ? "Dados inválidos"
            : "Não foi possível acessar os lembretes. Tente novamente.",
    },
    { status: invalido ? 400 : 500 },
  );
}
function resultado(item: unknown, status = 200) {
  return item
    ? Response.json(item, { status })
    : Response.json({ erro: "Lembrete não encontrado" }, { status: 404 });
}

// Acesso compartilhado pelos administradores do CRM, autenticados em src/start.ts.
export const Route = createFileRoute("/api/crm/lembretes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const params = new URL(request.url).searchParams;
          const ate = dataLembreteSchema.parse(params.get("ate"));
          const pendentes = params.get("pendentes") === "1";
          const de = pendentes ? undefined : dataLembreteSchema.parse(params.get("de"));
          if (de && de > ate) return Response.json({ erro: "Período inválido" }, { status: 400 });
          return Response.json(await listarLembretes({ de, ate, pendentes }), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          return erro(error);
        }
      },
      POST: async ({ request }) => {
        try {
          return resultado(
            await salvarLembrete(lembreteInputSchema.parse(await request.json())),
            201,
          );
        } catch (error) {
          return erro(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const input = patchSchema.parse(await request.json());
          return resultado(
            input.acao === "concluir"
              ? await concluirLembrete(input.id, input.concluido)
              : await salvarLembrete(input, input.id),
          );
        } catch (error) {
          return erro(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          const id = idSchema.parse(new URL(request.url).searchParams.get("id"));
          return resultado((await excluirLembrete(id)) ? { ok: true } : null);
        } catch (error) {
          return erro(error);
        }
      },
    },
  },
});
