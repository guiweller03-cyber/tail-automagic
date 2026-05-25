import {
  adicionarMensagemConversa,
  buscarConversaPorTelefone,
  buscarPedidoPixPorId,
  marcarPedidoPixPago,
  upsertConversa,
  type PedidoPixRow,
} from "@/lib/supabase";
import { enviarMensagem } from "@/lib/uazapi";
import { erroLog, logPix, telefoneLog } from "@/lib/pix-log";

export const MENSAGEM_PAGAMENTO_CONFIRMADO =
  "Pagamento confirmado! Seu pedido ja esta sendo preparado. Obrigado pela compra.";

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

async function registrarMensagemAgente(telefone: string, texto: string): Promise<void> {
  const conversa = await buscarConversaPorTelefone(telefone);

  if (conversa) {
    await adicionarMensagemConversa({
      id: conversa.id,
      mensagem: { role: "assistant", content: texto },
    });
    return;
  }

  await upsertConversa({
    telefone,
    historico: [{ role: "assistant", content: texto }],
    nome_cliente: null,
    aguardando_humano: false,
    estagio: "pos_venda",
    atualizado_em: new Date().toISOString(),
  });
}

export async function confirmarPagamentoPixPedido(
  pedidoPixId: string,
): Promise<{ pedido: PedidoPixRow | null; mensagemEnviada: boolean; jaEstavaPago: boolean }> {
  const pedidoAntes = await buscarPedidoPixPorId(pedidoPixId);

  if (pedidoAntes?.status === "pago") {
    return { pedido: pedidoAntes, mensagemEnviada: false, jaEstavaPago: true };
  }

  const pedido = await marcarPedidoPixPago(pedidoPixId);
  const telefone = pedido?.cliente_telefone ? normalizarTelefone(pedido.cliente_telefone) : "";

  if (!pedido || !telefone) {
    return { pedido, mensagemEnviada: false, jaEstavaPago: false };
  }

  try {
    await enviarMensagem(`${telefone}@s.whatsapp.net`, MENSAGEM_PAGAMENTO_CONFIRMADO);
  } catch (error) {
    logPix(
      "whatsapp",
      "falha_mensagem_pagamento_confirmado",
      {
        telefone: telefoneLog(telefone),
        pedido_pix_id: pedido.id,
        erro: erroLog(error),
      },
      "error",
    );
    throw error;
  }

  try {
    await registrarMensagemAgente(telefone, MENSAGEM_PAGAMENTO_CONFIRMADO);
  } catch (error) {
    logPix(
      "whatsapp",
      "falha_registro_mensagem_pagamento_confirmado",
      {
        telefone: telefoneLog(telefone),
        pedido_pix_id: pedido.id,
        erro: erroLog(error),
      },
      "warn",
    );
  }

  logPix("whatsapp", "pagamento_confirmado_mensagem_enviada", {
    telefone: telefoneLog(telefone),
    pedido_pix_id: pedido.id,
    venda_id: pedido.venda_id ?? null,
  });

  return { pedido, mensagemEnviada: true, jaEstavaPago: false };
}
