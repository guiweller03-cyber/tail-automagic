import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { carregarDashboard } from "@/lib/crm-supabase";
import { definirIaGlobalDesativada } from "@/lib/supabase";
import { gerarRespostaAssistenteAdmin, type MensagemAssistenteAdmin } from "@/lib/openai";

type AssistenteRequest = {
  message?: string;
  messages?: Array<{ role: "user" | "assistant" | "ai"; content: string }>;
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sanitizeMessages(messages: AssistenteRequest["messages"]): MensagemAssistenteAdmin[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((message) => message.content?.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content.trim(),
    }));
}

function resumoDeterministico(contexto: Awaited<ReturnType<typeof carregarDashboard>>): string {
  const { kpis } = contexto;
  const prioridades = [
    kpis.estoqueCritico > 0 ? `${kpis.estoqueCritico} produto(s) em estoque critico` : null,
    kpis.clientesRisco > 0 ? `${kpis.clientesRisco} cliente(s) em risco` : null,
    contexto.conversas.some((conversa) => conversa.naoLidas > 0)
      ? "existem conversas aguardando atencao"
      : null,
  ].filter(Boolean);

  return [
    `Resumo rapido: hoje foram ${brl(kpis.faturamentoHoje)} em vendas, com ${kpis.pedidosHoje} pedido(s).`,
    `No mes, o CRM mostra ${brl(kpis.faturamentoMes)} de faturamento, ${brl(kpis.lucroMes)} de lucro e ticket medio de ${brl(kpis.ticketMedio)}.`,
    prioridades.length
      ? `Prioridade agora: ${prioridades.join(", ")}.`
      : "Nao vejo alertas criticos nos dados atuais.",
  ].join("\n\n");
}

async function executarAcoes(texto: string): Promise<string[]> {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    /\b(desativar|desliga|desligar|pausar|pause)\b/.test(normalizado) &&
    /\bia\b/.test(normalizado)
  ) {
    await definirIaGlobalDesativada(true);
    return ["IA geral do CRM desativada."];
  }

  if (/\b(ativar|liga|ligar|religar)\b/.test(normalizado) && /\bia\b/.test(normalizado)) {
    await definirIaGlobalDesativada(false);
    return ["IA geral do CRM ativada."];
  }

  return [];
}

export const Route = createFileRoute("/api/crm/assistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as AssistenteRequest;
          const message = body.message?.trim() ?? "";

          if (!message) {
            return json({ ok: false, erro: "mensagem_obrigatoria" }, { status: 400 });
          }

          const [dashboard, acoesExecutadas] = await Promise.all([
            carregarDashboard(),
            executarAcoes(message),
          ]);

          const contexto = {
            kpis: dashboard.kpis,
            vendasSemana: dashboard.vendasSemana,
            funil: dashboard.funilDados,
            conversasRecentes: dashboard.conversas,
          };

          let resposta: string;

          try {
            resposta = await gerarRespostaAssistenteAdmin({
              historico: sanitizeMessages(body.messages),
              novaMensagem: message,
              contextoCrm: contexto,
              acoesExecutadas,
            });
          } catch (error) {
            console.error("Erro no assistente OpenAI:", error);
            resposta = resumoDeterministico(dashboard);
            if (acoesExecutadas.length > 0) {
              resposta = `${acoesExecutadas.join("\n")}\n\n${resposta}`;
            }
          }

          return json({
            ok: true,
            resposta,
            acoesExecutadas,
            metricas: dashboard.kpis,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
