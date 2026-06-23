import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  cancelarFollowup,
  criarFollowup,
  editarFollowup,
  followupErrorMessage,
  listarFollowups,
  removerFollowup,
  type FollowupContexto,
  type FollowupDisparo,
  type FollowupInput,
  type FollowupModo,
  type FollowupStatus,
} from "@/lib/followups-supabase";
import { enviarFollowupAgora } from "@/lib/followups-runner";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

const MODOS: FollowupModo[] = ["manual", "ia"];
const DISPAROS: FollowupDisparo[] = ["automatico", "confirmar"];
const STATUSES: FollowupStatus[] = [
  "pendente",
  "aguardando_confirmacao",
  "enviado",
  "cancelado",
  "erro",
];

function asContexto(value: unknown): FollowupContexto | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const pick = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : undefined);
  return {
    nome: pick("nome"),
    pet: pick("pet"),
    ultimaInteracao: pick("ultimaInteracao"),
    ultimaMensagem: pick("ultimaMensagem"),
    resumo: pick("resumo"),
    objetivo: pick("objetivo"),
  };
}

function parseInput(body: Record<string, unknown>): FollowupInput | { erro: string } {
  const telefone = typeof body.telefone === "string" ? body.telefone : "";
  if (!telefone.replace(/\D/g, "")) return { erro: "Telefone obrigatorio" };

  const agendadoPara = typeof body.agendadoPara === "string" ? body.agendadoPara : "";
  if (!agendadoPara || Number.isNaN(Date.parse(agendadoPara))) {
    return { erro: "Data/hora do agendamento invalida" };
  }

  const modo: FollowupModo =
    typeof body.modo === "string" && MODOS.includes(body.modo as FollowupModo)
      ? (body.modo as FollowupModo)
      : "manual";
  const disparo: FollowupDisparo =
    typeof body.disparo === "string" && DISPAROS.includes(body.disparo as FollowupDisparo)
      ? (body.disparo as FollowupDisparo)
      : "confirmar";
  const mensagem = typeof body.mensagem === "string" ? body.mensagem : "";

  if (modo === "manual" && !mensagem.trim()) {
    return { erro: "Escreva a mensagem do follow-up ou deixe a IA gerar" };
  }

  return {
    telefone,
    clienteNome: typeof body.clienteNome === "string" ? body.clienteNome : undefined,
    agendadoPara,
    modo,
    disparo,
    mensagem,
    contexto: asContexto(body.contexto),
    canal: typeof body.canal === "string" ? body.canal : undefined,
  };
}

export const Route = createFileRoute("/api/crm/followups")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const telefone = url.searchParams.get("telefone") ?? undefined;
          const statusParam = url.searchParams.get("status");
          const status = statusParam
            ? (statusParam.split(",").filter((s) => STATUSES.includes(s as FollowupStatus)) as
                | FollowupStatus[]
                | undefined)
            : undefined;
          return json(await listarFollowups({ telefone, status }));
        } catch (error) {
          return json({ ok: false, erro: followupErrorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const parsed = parseInput(body);
          if ("erro" in parsed) return json({ ok: false, erro: parsed.erro }, { status: 400 });
          return json(await criarFollowup(parsed), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: followupErrorMessage(error) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Follow-up obrigatorio" }, { status: 400 });
          }
          const acao = typeof body.acao === "string" ? body.acao : "editar";

          if (acao === "enviar") {
            return json(await enviarFollowupAgora(body.id));
          }
          if (acao === "cancelar") {
            return json(await cancelarFollowup(body.id));
          }

          // editar campos
          const patch: Partial<FollowupInput> = {};
          if (typeof body.agendadoPara === "string") patch.agendadoPara = body.agendadoPara;
          if (typeof body.modo === "string" && MODOS.includes(body.modo as FollowupModo)) {
            patch.modo = body.modo as FollowupModo;
          }
          if (
            typeof body.disparo === "string" &&
            DISPAROS.includes(body.disparo as FollowupDisparo)
          ) {
            patch.disparo = body.disparo as FollowupDisparo;
          }
          if (typeof body.mensagem === "string") patch.mensagem = body.mensagem;
          if (typeof body.canal === "string") patch.canal = body.canal;
          if (typeof body.clienteNome === "string") patch.clienteNome = body.clienteNome;
          const contexto = asContexto(body.contexto);
          if (contexto) patch.contexto = contexto;
          return json(await editarFollowup(body.id, patch));
        } catch (error) {
          return json({ ok: false, erro: followupErrorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ ok: false, erro: "Follow-up obrigatorio" }, { status: 400 });
          await removerFollowup(id);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: followupErrorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
