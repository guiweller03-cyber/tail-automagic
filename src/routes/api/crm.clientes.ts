import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarClienteCrm,
  criarClienteCrm,
  excluirClienteCrm,
  listarClientes,
  type ClienteCrmInput,
} from "@/lib/crm-supabase";
import type { Cliente } from "@/lib/crm-types";
import { listarConversas, salvarCadastroCliente } from "@/lib/supabase";

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
    observacoes: typeof body.observacoes === "string" ? body.observacoes : undefined,
    followUpManual: parseFollowUpManual(body.followUpManual),
  };
}

function parseFollowUpManual(value: unknown): Cliente["followUpManual"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const followUp = value as Record<string, unknown>;
  const canal = followUp.canal;
  const status = followUp.status;

  return {
    mensagem: typeof followUp.mensagem === "string" ? followUp.mensagem.trim() : "",
    data: typeof followUp.data === "string" ? followUp.data : "",
    hora: typeof followUp.hora === "string" ? followUp.hora : "",
    canal:
      canal === "WhatsApp" || canal === "Ligacao" || canal === "Presencial" || canal === "Outro"
        ? canal
        : "WhatsApp",
    status: status === "feito" ? "feito" : "pendente",
    midiaUrl: typeof followUp.midiaUrl === "string" ? followUp.midiaUrl.trim() : "",
    midiaNome: typeof followUp.midiaNome === "string" ? followUp.midiaNome.trim() : "",
    midiaTipo: typeof followUp.midiaTipo === "string" ? followUp.midiaTipo.trim() : "",
    atualizadoEm:
      typeof followUp.atualizadoEm === "string" ? followUp.atualizadoEm : new Date().toISOString(),
  };
}

function nomeDaConversa(nomeCliente: string | null, telefone: string): string {
  const nome = nomeCliente?.trim();
  return nome || `Cliente ${telefone.slice(-4)}`;
}

function conversaTemMensagemCliente(historico: Array<{ role?: string }>): boolean {
  return historico.some((mensagem) => mensagem.role === "user");
}

function conversaAtivaParaImportacao(conversa: {
  historico: Array<{ role?: string }>;
  ia_ativa: boolean | null;
  atualizado_em: string;
}): boolean {
  const atualizadoEm = new Date(conversa.atualizado_em).getTime();
  const seteDiasMs = 7 * 24 * 60 * 60 * 1000;

  return (
    conversa.ia_ativa !== false &&
    conversaTemMensagemCliente(conversa.historico) &&
    conversa.historico.some((mensagem) => mensagem.role === "assistant") &&
    Number.isFinite(atualizadoEm) &&
    Date.now() - atualizadoEm <= seteDiasMs
  );
}

function telefoneNormalizado(valor: string): string {
  return valor.replace(/\D/g, "");
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
          const body = (await request.json()) as Record<string, unknown>;

          if (body.tipo === "sync_whatsapp" || body.sync === "whatsapp") {
            const conversas = await listarConversas();
            const clientes = await listarClientes();
            const telefonesValidos = new Set<string>();
            let importados = 0;
            let ignorados = 0;
            let removidos = 0;

            for (const conversa of conversas) {
              const telefone = telefoneNormalizado(conversa.telefone);
              if (!telefone || !conversaAtivaParaImportacao(conversa)) {
                ignorados += 1;
                continue;
              }

              telefonesValidos.add(telefone);
              await salvarCadastroCliente({
                telefone,
                nome: nomeDaConversa(conversa.nome_cliente, telefone),
                origem: "WhatsApp IA",
              });
              importados += 1;
            }

            for (const cliente of clientes) {
              const telefoneCliente = telefoneNormalizado(cliente.telefone);
              const origem = cliente.origem?.trim().toLowerCase() ?? "";
              const veioDoWhatsApp = origem.startsWith("whatsapp");

              if (veioDoWhatsApp && telefoneCliente && !telefonesValidos.has(telefoneCliente)) {
                await excluirClienteCrm(cliente.id);
                removidos += 1;
              }
            }

            return json({
              ok: true,
              total: conversas.length,
              importados,
              ignorados,
              removidos,
            });
          }

          const input = clienteInput(body);
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
      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Cliente obrigatorio" }, { status: 400 });
          }

          await excluirClienteCrm(body.id);

          return json({ ok: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
