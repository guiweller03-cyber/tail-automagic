import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  processarComprovantesHistorico,
  type DiagnosticoComprovante,
  type PagamentoProcessado,
} from "@/lib/comprovantes";
import { trackearConversaCompleta, type ResultadoTrackingConversa } from "@/lib/conversa-tracking";
import { invalidarDashboardCache } from "@/lib/crm-supabase";
import { buscarConversaPorTelefone, listarConversas, type Conversa } from "@/lib/supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

type ResultadoConversa = {
  telefone: string;
  nome_cliente: string | null;
  analisados: number;
  confirmados: number;
  duplicados: number;
  pagamentos: PagamentoProcessado[];
  perfil_atualizado?: boolean;
  compras_analisadas?: number;
  compras_registradas?: number;
  compras_duplicadas?: number;
  tracking?: ResultadoTrackingConversa;
  diagnostico?: DiagnosticoComprovante[];
};

/**
 * Varredura retroativa de pagamentos: percorre as conversas do WhatsApp em
 * lotes, analisa comprovantes (imagem, PDF, link, texto) com IA e lanca as
 * vendas pagas no sistema. Cada comprovante recebe um marcador WPP_PAY na
 * observacao da venda, entao rodar de novo nunca duplica lancamentos.
 */
async function varrerPagamentos({
  telefone,
  offset = 0,
  limiteConversas = 6,
  maxMensagens = 12,
  trackingCompleto = false,
  debug = false,
}: {
  telefone?: string;
  offset?: number;
  limiteConversas?: number;
  maxMensagens?: number;
  trackingCompleto?: boolean;
  debug?: boolean;
}) {
  const limiteSeguro = Math.min(Math.max(limiteConversas, 1), trackingCompleto ? 50 : 12);
  const mensagensSeguras =
    maxMensagens === 0 ? 0 : Math.min(Math.max(maxMensagens, 1), trackingCompleto ? 250 : 20);

  let conversas: Conversa[];
  let total: number;

  if (telefone?.trim()) {
    const conversa = await buscarConversaPorTelefone(normalizarTelefone(telefone));
    conversas = conversa ? [conversa] : [];
    total = conversas.length;
  } else {
    const todas = (await listarConversas()).filter((conversa) => conversa.historico.length > 0);
    total = todas.length;
    conversas = todas.slice(offset, offset + limiteSeguro);
  }

  const resultados: ResultadoConversa[] = [];

  for (const conversa of conversas) {
    const telefoneConversa = normalizarTelefone(conversa.telefone);
    if (!telefoneConversa) continue;

    try {
      if (trackingCompleto) {
        const tracking = await trackearConversaCompleta({
          conversa,
          maxComprovantes: mensagensSeguras,
          debug,
        });

        resultados.push({
          telefone: telefoneConversa,
          nome_cliente: conversa.nome_cliente,
          analisados: tracking.comprovantes.analisados,
          confirmados: tracking.comprovantes.confirmados,
          duplicados: tracking.comprovantes.duplicados,
          pagamentos: tracking.comprovantes.pagamentos,
          perfil_atualizado: tracking.perfil.atualizado,
          compras_analisadas: tracking.compras.analisadas,
          compras_registradas: tracking.compras.registradas,
          compras_duplicadas: tracking.compras.duplicadas,
          tracking,
          diagnostico: tracking.comprovantes.diagnostico,
        });
      } else {
        const resultado = await processarComprovantesHistorico({
          telefone: telefoneConversa,
          nomeCliente: conversa.nome_cliente,
          historico: conversa.historico,
          maxMensagens: mensagensSeguras,
          dedupPersistente: true,
          debug,
        });

        resultados.push({
          telefone: telefoneConversa,
          nome_cliente: conversa.nome_cliente,
          ...resultado,
        });
      }
    } catch (error) {
      console.error("[crm.pagamentos.scan] erro_varrer_conversa", telefoneConversa, error);
    }
  }

  const proximoOffset = offset + conversas.length;
  if (resultados.length > 0) invalidarDashboardCache();

  return {
    ok: true,
    tracking_completo: trackingCompleto,
    conversas_total: total,
    conversas_analisadas: conversas.length,
    offset,
    proximo_offset: proximoOffset < total && !telefone ? proximoOffset : null,
    comprovantes_analisados: resultados.reduce((sum, item) => sum + item.analisados, 0),
    pagamentos_confirmados: resultados.reduce((sum, item) => sum + item.confirmados, 0),
    comprovantes_ja_lancados: resultados.reduce((sum, item) => sum + item.duplicados, 0),
    perfis_atualizados: resultados.filter((item) => item.perfil_atualizado).length,
    compras_analisadas: resultados.reduce((sum, item) => sum + (item.compras_analisadas ?? 0), 0),
    compras_registradas: resultados.reduce((sum, item) => sum + (item.compras_registradas ?? 0), 0),
    compras_ja_lancadas: resultados.reduce((sum, item) => sum + (item.compras_duplicadas ?? 0), 0),
    detalhes: resultados.filter(
      (item) =>
        item.analisados > 0 ||
        item.confirmados > 0 ||
        item.duplicados > 0 ||
        (item.compras_registradas ?? 0) > 0 ||
        item.perfil_atualizado,
    ),
  };
}

export const Route = createFileRoute("/api/crm/pagamentos/scan")({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          endpoint: "crm_pagamentos_scan",
          message:
            "Envie POST com { telefone?, offset?, limiteConversas?, maxMensagens? } para varrer comprovantes de pagamento das conversas.",
        }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            telefone?: string;
            offset?: number;
            limiteConversas?: number;
            maxMensagens?: number;
            trackingCompleto?: boolean;
            debug?: boolean;
          };

          return json(
            await varrerPagamentos({
              telefone: body.telefone,
              offset: Number.isFinite(body.offset) ? Math.max(0, Number(body.offset)) : 0,
              limiteConversas: Number.isFinite(body.limiteConversas)
                ? Number(body.limiteConversas)
                : 6,
              maxMensagens: Number.isFinite(body.maxMensagens) ? Number(body.maxMensagens) : 12,
              trackingCompleto: body.trackingCompleto === true,
              debug: body.debug === true,
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          console.error("[crm.pagamentos.scan] falha_scan", message);

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
