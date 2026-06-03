import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarCampanha,
  criarCampanha,
  listarCampanhas,
  removerCampanha,
  type CampanhaManualInput,
  type CampanhaStatus,
} from "@/lib/campanhas-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function numberField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function integerField(value: unknown): number {
  return Math.max(0, Math.trunc(numberField(value)));
}

function statusField(value: unknown): CampanhaStatus {
  return value === "ativa" || value === "pausada" || value === "encerrada" ? value : "rascunho";
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function campanhaInput(body: Record<string, unknown>): CampanhaManualInput | null {
  const nome = textField(body.nome);
  if (!nome) return null;

  return {
    nome,
    origem: textField(body.origem),
    objetivo: textField(body.objetivo),
    investimento: numberField(body.investimento),
    leads: integerField(body.leads),
    conversoes: integerField(body.conversoes),
    receita: numberField(body.receita),
    status: statusField(body.status),
    inicio: textField(body.inicio),
    fim: textField(body.fim),
    observacoes: textField(body.observacoes),
  };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  if (message.includes("PGRST205") || message.includes("Could not find the table")) {
    return "Tabela de campanhas ainda nao existe no Supabase. Aplique a migration 20260603120000_campanhas_manuais.sql.";
  }
  return message;
}

export const Route = createFileRoute("/api/crm/campanhas")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarCampanhas());
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const input = campanhaInput(body);
          if (!input) {
            return json({ ok: false, erro: "Nome da campanha e obrigatorio" }, { status: 400 });
          }

          return json(await criarCampanha(input), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const input = campanhaInput(body);
          if (typeof body.id !== "string" || !input) {
            return json(
              { ok: false, erro: "Campanha e nome da campanha sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(await atualizarCampanha(body.id, input));
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Campanha obrigatoria" }, { status: 400 });
          }

          await removerCampanha(body.id);

          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
