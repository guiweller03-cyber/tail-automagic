import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarNotaGeral,
  criarNotaGeral,
  excluirNotaGeral,
  listarNotasGerais,
  type NotaGeralInput,
} from "@/lib/notas-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function notaInput(body: Record<string, unknown>): NotaGeralInput {
  return {
    titulo: typeof body.titulo === "string" ? body.titulo : "Nova nota",
    conteudo: typeof body.conteudo === "string" ? body.conteudo : "",
    categoria: typeof body.categoria === "string" ? body.categoria : null,
    fixada: typeof body.fixada === "boolean" ? body.fixada : false,
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  if (message.includes("PGRST205") || message.includes("Could not find the table")) {
    return "Tabela de notas gerais ainda nao existe no Supabase. Aplique a migration 20260530013421_general_notes.sql.";
  }
  return message;
}

export const Route = createFileRoute("/api/crm/notas")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarNotasGerais());
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          return json(await criarNotaGeral(notaInput(body)), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Nota obrigatoria" }, { status: 400 });
          }

          return json(await atualizarNotaGeral(body.id, notaInput(body)));
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ ok: false, erro: "Nota obrigatoria" }, { status: 400 });

          await excluirNotaGeral(id);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
