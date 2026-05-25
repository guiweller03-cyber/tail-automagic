import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarClienteCrm,
  criarClienteCrm,
  listarClientes,
  type ClienteCrmInput,
} from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function clienteInput(body: Record<string, unknown>): ClienteCrmInput | null {
  if (typeof body.nome !== "string" || typeof body.telefone !== "string") return null;

  const nome = body.nome.trim();
  const telefone = body.telefone.replace(/\D/g, "");
  if (!nome || telefone.length < 8) return null;

  const pets =
    Array.isArray(body.pets) && body.pets.every((pet) => typeof pet === "string")
      ? body.pets
      : typeof body.pets === "string"
        ? body.pets.split(",")
        : [];

  return {
    nome,
    telefone,
    endereco: typeof body.endereco === "string" ? body.endereco : undefined,
    bairro: typeof body.bairro === "string" ? body.bairro : undefined,
    pets,
    perfil:
      body.perfil === "VIP" ||
      body.perfil === "Premium" ||
      body.perfil === "Econômico" ||
      body.perfil === "Novo" ||
      body.perfil === "Risco"
        ? body.perfil
        : "Novo",
    origem: typeof body.origem === "string" ? body.origem : undefined,
  };
}

export const Route = createFileRoute("/api/crm/clientes")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const clientes = await listarClientes();

          return json(clientes);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const input = clienteInput((await request.json()) as Record<string, unknown>);
          if (!input) {
            return json(
              { ok: false, erro: "Nome e telefone validos sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(await criarClienteCrm(input), { status: 201 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const input = clienteInput(body);
          if (typeof body.id !== "string" || !input) {
            return json(
              { ok: false, erro: "Cliente, nome e telefone validos sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(await atualizarClienteCrm(body.id, input));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
