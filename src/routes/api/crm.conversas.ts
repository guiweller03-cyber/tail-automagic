import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { gerarResposta, limparRespostaCliente } from "@/lib/openai";
import {
  adicionarMensagemConversa,
  atualizarConversaAguardandoHumano,
  atualizarConversaPipeline,
  buscarAprendizados,
  buscarIaStatus,
  definirIaGlobalDesativada,
  listarPedidos,
  listarConversas,
} from "@/lib/supabase";
import { enviarMensagem } from "@/lib/uazapi";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function pipelineFromKanban(stage: unknown): {
  estagio: "novo" | "qualificando" | "vendendo" | "pos_venda" | "inativo";
  aguardandoHumano: boolean;
} | null {
  switch (stage) {
    case "Hoje":
      return { estagio: "novo", aguardandoHumano: false };
    case "Recompra":
    case "Follow-up":
      return { estagio: "pos_venda", aguardandoHumano: false };
    case "Aguardando pagamento":
      return { estagio: "vendendo", aguardandoHumano: true };
    case "Upsell":
      return { estagio: "vendendo", aguardandoHumano: false };
    case "Risco":
      return { estagio: "inativo", aguardandoHumano: false };
    default:
      return null;
  }
}

export const Route = createFileRoute("/api/crm/conversas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          if (url.searchParams.get("ia") === "status") {
            return json(await buscarIaStatus());
          }

          const [conversas, pedidos] = await Promise.all([listarConversas(), listarPedidos()]);
          const valorPorTelefone = new Map<string, { valor: number; pedidos: number }>();

          for (const pedido of pedidos) {
            if (pedido.status === "cancelado") continue;

            const telefone = normalizarTelefone(pedido.telefone);
            const atual = valorPorTelefone.get(telefone) ?? { valor: 0, pedidos: 0 };
            valorPorTelefone.set(telefone, {
              valor: atual.valor + pedido.total,
              pedidos: atual.pedidos + 1,
            });
          }

          const conversasComValores = conversas.map((conversa) => {
            const resumo = valorPorTelefone.get(normalizarTelefone(conversa.telefone));

            return {
              ...conversa,
              valor_potencial: resumo?.valor ?? 0,
              pedidos_total: resumo?.pedidos ?? 0,
            };
          });

          return json(conversasComValores);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as
            | { tipo: "conversa"; id: string; aguardandoHumano: boolean }
            | { tipo: "pipeline"; id: string; stage: string }
            | { tipo: "global"; desativada: boolean };

          if (body.tipo === "global") {
            return json(await definirIaGlobalDesativada(body.desativada));
          }

          if (body.tipo === "pipeline") {
            const pipeline = pipelineFromKanban(body.stage);
            if (!pipeline) return json({ ok: false, erro: "Etapa invalida" }, { status: 400 });

            return json(await atualizarConversaPipeline({ id: body.id, ...pipeline }));
          }

          return json(
            await atualizarConversaAguardandoHumano({
              id: body.id,
              aguardandoHumano: body.aguardandoHumano,
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as
            | { tipo: "mensagem"; id: string; telefone: string; texto: string }
            | {
                tipo: "sugestao_ia";
                historico: Array<{ role: "user" | "assistant"; content: string }>;
                texto: string;
              };

          if (body.tipo === "sugestao_ia") {
            const aprendizados = await buscarAprendizados(10);
            const resposta = await gerarResposta(body.historico, body.texto, aprendizados);

            return json({
              resposta: limparRespostaCliente(
                resposta
                  .replace(/\[PRODUTO_PROCURADO[^\]]*\]/gi, "")
                  .replace(/\[SALVAR_CLIENTE[^\]]*\]/gi, "")
                  .replace(/\[PEDIDO\][\s\S]*$/i, "")
                  .replaceAll("[HANDOFF]", ""),
              ),
            });
          }

          const texto = body.texto.trim();
          if (!texto) return json({ ok: false, erro: "Mensagem vazia" }, { status: 400 });

          await enviarMensagem(`${body.telefone}@s.whatsapp.net`, texto);

          return json(
            await adicionarMensagemConversa({
              id: body.id,
              mensagem: { role: "assistant", content: texto },
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
