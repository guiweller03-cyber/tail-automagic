import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarClienteCrm,
  criarClienteCrm,
  excluirClienteCrm,
  listarClientes,
  listarClientesHistorico,
  type ClienteCrmInput,
} from "@/lib/crm-supabase";
import type { Cliente, PetDetalhe } from "@/lib/crm-types";
import { listarConversas, salvarCadastrosClientesBasicos } from "@/lib/supabase";
import { normalizarNomeContatoWhatsapp } from "@/lib/whatsapp-nomes";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

const PESO_PADRAO_GATO_KG = 3.5;

function parsePesoPetKg(value: unknown): number | undefined {
  if (typeof value === "string" && !value.trim()) return undefined;
  const texto =
    typeof value === "string" ? value.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] : undefined;
  const numero = typeof value === "number" ? value : texto ? Number(texto) : Number.NaN;

  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
}

function parsePetsDetalhes(value: unknown): PetDetalhe[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const pets = value
    .map((item): PetDetalhe | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;

      const pet = item as Record<string, unknown>;
      const nome = typeof pet.nome === "string" ? pet.nome.trim() : "";
      const especie =
        pet.especie === "cachorro" || pet.especie === "gato" ? pet.especie : undefined;
      const castrado =
        typeof pet.castrado === "boolean"
          ? pet.castrado
          : typeof pet.castrado === "string" && /^(sim|true|1)$/i.test(pet.castrado.trim())
            ? true
            : typeof pet.castrado === "string" && /^(nao|não|false|0)$/i.test(pet.castrado.trim())
              ? false
              : undefined;
      const porte =
        pet.porte === "pequeno" || pet.porte === "medio" || pet.porte === "grande"
          ? pet.porte
          : undefined;
      const pesoKg =
        parsePesoPetKg(pet.pesoKg) ?? (especie === "gato" ? PESO_PADRAO_GATO_KG : undefined);
      const raca = typeof pet.raca === "string" ? pet.raca.trim() || undefined : undefined;
      const idade = typeof pet.idade === "string" ? pet.idade.trim() || undefined : undefined;
      const nascimento =
        typeof pet.nascimento === "string"
          ? pet.nascimento.trim() || undefined
          : typeof pet.dataNascimento === "string"
            ? pet.dataNascimento.trim() || undefined
            : undefined;
      const observacao =
        typeof pet.observacao === "string"
          ? pet.observacao.trim().slice(0, 300) || undefined
          : undefined;

      if (
        !nome &&
        !especie &&
        castrado === undefined &&
        !raca &&
        !porte &&
        !pesoKg &&
        !idade &&
        !nascimento &&
        !observacao
      )
        return null;

      return { nome, especie, castrado, raca, porte, pesoKg, idade, nascimento, observacao };
    })
    .filter((pet): pet is PetDetalhe => pet !== null)
    .slice(0, 20);

  return pets;
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
    petsDetalhes: parsePetsDetalhes(body.petsDetalhes),
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
  const nome = normalizarNomeContatoWhatsapp(nomeCliente);
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
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const historico = url.searchParams.get("historico") === "1";
          const clientes = historico
            ? await listarClientesHistorico(
                (await listarConversas()).map((conversa) => ({
                  telefone: conversa.telefone,
                  nome: conversa.nome_cliente ?? undefined,
                  origem: "WhatsApp IA",
                })),
              )
            : await listarClientes();

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
            let ignorados = 0;
            const clientesParaImportar: Array<{ telefone: string; nome: string; origem: string }> =
              [];

            for (const conversa of conversas) {
              const telefone = telefoneNormalizado(conversa.telefone);
              if (!telefone || !conversaAtivaParaImportacao(conversa)) {
                ignorados += 1;
                continue;
              }

              telefonesValidos.add(telefone);
              clientesParaImportar.push({
                telefone,
                nome: nomeDaConversa(conversa.nome_cliente, telefone),
                origem: "WhatsApp IA",
              });
            }

            const importados = await salvarCadastrosClientesBasicos(clientesParaImportar);
            const preservados = clientes.filter((cliente) => {
              const telefoneCliente = telefoneNormalizado(cliente.telefone);
              const origem = cliente.origem?.trim().toLowerCase() ?? "";

              return origem.startsWith("whatsapp") && !telefonesValidos.has(telefoneCliente);
            }).length;

            return json({
              ok: true,
              total: conversas.length,
              importados: importados.length,
              ignorados,
              removidos: 0,
              preservados,
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
