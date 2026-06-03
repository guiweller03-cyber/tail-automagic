import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { gerarPixPedido } from "@/lib/mercadopago";
import {
  atualizarPedidoPixMercadoPago,
  buscarClientePorTelefone,
  criarPedidoPixPendente,
  listarPedidos,
  salvarCadastroCliente,
} from "@/lib/supabase";
import { enviarMensagem, enviarMensagemLonga } from "@/lib/uazapi";
import { erroLog, logPix, telefoneLog } from "@/lib/pix-log";

type PixRequest = {
  telefone?: string;
  valor?: number;
  descricao?: string;
  email?: string;
  nome?: string;
  endereco?: string;
  bairro?: string;
  pets?: string[];
  vendaId?: string;
  enviarMensagem?: boolean;
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const Route = createFileRoute("/api/crm/pix")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as PixRequest;

          if (!body.telefone) {
            logPix("crm", "requisicao_bloqueada", { motivo: "telefone_required" }, "warn");
            return json({ ok: false, erro: "telefone e obrigatorio" }, { status: 400 });
          }

          const telefone = normalizarTelefone(body.telefone);
          const telefoneMascara = telefoneLog(telefone);
          logPix("crm", "requisicao_recebida", {
            telefone: telefoneMascara,
            valor_informado: Boolean(body.valor && body.valor > 0),
            venda_id_informada: Boolean(body.vendaId),
            envio_whatsapp: body.enviarMensagem !== false,
          });
          const pedidoPendente = body.valor
            ? null
            : (await listarPedidos()).find(
                (pedido) =>
                  normalizarTelefone(pedido.telefone) === telefone &&
                  pedido.statusPagamento !== "pago" &&
                  pedido.total > 0,
              );
          const valor = body.valor && body.valor > 0 ? body.valor : pedidoPendente?.total;
          const vendaId = body.vendaId ?? pedidoPendente?.id;

          if (!valor || valor <= 0) {
            logPix(
              "crm",
              "geracao_bloqueada",
              {
                telefone: telefoneMascara,
                motivo: "valor_required",
                pedido_pendente_encontrado: Boolean(pedidoPendente),
              },
              "warn",
            );
            if (body.enviarMensagem !== false) {
              await enviarMensagemLonga(
                `${telefone}@s.whatsapp.net`,
                "Nao encontrei um pedido pendente com valor para gerar o Pix. Me confirma o produto e a quantidade para eu fechar certinho.",
              );
            }

            return json({
              ok: false,
              erro: "valor_required",
              mensagem: "Nao encontrei pedido pendente com valor para gerar Pix.",
            });
          }

          const clienteAtual = await buscarClientePorTelefone(telefone);
          const endereco = body.endereco?.trim() || clienteAtual?.endereco?.trim();
          const bairro = body.bairro?.trim() || clienteAtual?.bairro?.trim();

          if (!endereco || !bairro) {
            logPix(
              "crm",
              "geracao_bloqueada",
              {
                telefone: telefoneMascara,
                motivo: "endereco_required",
                tem_endereco: Boolean(endereco),
                tem_bairro: Boolean(bairro),
              },
              "warn",
            );
            if (body.enviarMensagem !== false) {
              await enviarMensagemLonga(
                `${telefone}@s.whatsapp.net`,
                "Antes do Pix, me passa o endereco completo com rua, numero e bairro para finalizar a entrega.",
              );
            }

            return json({
              ok: false,
              erro: "endereco_required",
              mensagem: "Peca o endereco completo e o bairro antes de enviar o Pix.",
            });
          }

          const cliente = await salvarCadastroCliente({
            telefone,
            nome: body.nome ?? clienteAtual?.nome,
            endereco,
            bairro,
            pets: body.pets && body.pets.length > 0 ? body.pets : clienteAtual?.pets,
          });

          const descricao = body.descricao ?? "Pagamento via Pix Mundo Pet";
          const pedidoPix = await criarPedidoPixPendente({
            telefone,
            descricao,
            valor,
            vendaId,
          });
          logPix("crm", "pedido_pix_criado", {
            telefone: telefoneMascara,
            pedido_pix_id: pedidoPix.id,
            venda_id: vendaId ?? null,
            valor,
          });

          const pix = await gerarPixPedido({
            id: pedidoPix.id,
            valor,
            descricao,
            email: body.email ?? "comprador-teste@example.com",
          });
          logPix("crm", "mercado_pago_gerou_pix", {
            telefone: telefoneMascara,
            pedido_pix_id: pedidoPix.id,
            pagamento_id: pix.id,
            status_pix: pix.status,
          });

          const pedidoAtualizado = await atualizarPedidoPixMercadoPago({
            id: pedidoPix.id,
            mpPaymentId: pix.id,
            qrCode: pix.qr_code,
            qrCodeBase64: pix.qr_code_base64,
          });

          const valorFormatado = brl(valor);

          if (body.enviarMensagem !== false) {
            const chatid = `${telefone}@s.whatsapp.net`;

            await enviarMensagemLonga(
              chatid,
              `Segue a chave Pix do pedido. O total e ${valorFormatado}.`,
            );
            await enviarMensagem(chatid, pix.qr_code);
            logPix("crm", "pix_enviado_whatsapp", {
              telefone: telefoneMascara,
              pedido_pix_id: pedidoPix.id,
            });
          } else {
            logPix("crm", "pix_gerado_sem_envio_whatsapp", {
              telefone: telefoneMascara,
              pedido_pix_id: pedidoPix.id,
            });
          }

          return json({
            ok: true,
            valor_formatado: valorFormatado,
            cliente,
            pedido: pedidoAtualizado,
            pix: {
              id: pix.id,
              status: pix.status,
              qr_code: pix.qr_code,
              qr_code_base64: pix.qr_code_base64,
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          logPix("crm", "falha", { erro: erroLog(error) }, "error");

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
