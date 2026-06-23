// Motor de execucao dos follow-ups. Compartilhado entre:
//  - o poller do automation-server (VPS), que roda a cada minuto; e
//  - o endpoint /api/crm/followups (acao "enviar"), o "enviar agora" do operador.

import { gerarFollowUp } from "./openai.ts";
import { enviarMensagemLonga } from "./uazapi.ts";
import {
  atualizarFollowupCampos,
  listarFollowupsVencidos,
  obterFollowup,
  type Followup,
} from "./followups-supabase.ts";

/** Resolve o texto final do follow-up: usa o do operador ou pede para a IA. */
export async function resolverMensagemFollowup(followup: Followup): Promise<string> {
  const manual = followup.mensagem?.trim();
  if (manual) return manual;

  if (followup.modo === "ia") {
    const texto = await gerarFollowUp({
      nome: followup.contexto?.nome ?? followup.clienteNome,
      pet: followup.contexto?.pet,
      ultimaInteracao: followup.contexto?.ultimaInteracao,
      ultimaMensagem: followup.contexto?.ultimaMensagem,
      resumo: followup.contexto?.resumo,
      objetivo: followup.contexto?.objetivo,
    });
    return texto.trim();
  }

  return "";
}

async function enviarFollowup(followup: Followup): Promise<Followup> {
  const mensagem = await resolverMensagemFollowup(followup);
  if (!mensagem) {
    throw new Error("Follow-up sem mensagem para enviar");
  }

  await enviarMensagemLonga(followup.telefone, mensagem);

  return atualizarFollowupCampos(followup.id, {
    status: "enviado",
    mensagem,
    enviado_em: new Date().toISOString(),
    erro: null,
  });
}

/**
 * Envia um follow-up imediatamente (operador clicou "enviar agora" ou confirmou).
 * Recarrega do banco para evitar enviar algo ja cancelado/enviado.
 */
export async function enviarFollowupAgora(id: string): Promise<Followup> {
  const followup = await obterFollowup(id);
  if (!followup) throw new Error("Follow-up nao encontrado");
  if (followup.status === "enviado") return followup;
  if (followup.status === "cancelado") throw new Error("Follow-up cancelado");

  try {
    return await enviarFollowup(followup);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao enviar";
    await atualizarFollowupCampos(id, { status: "erro", erro: msg });
    throw error;
  }
}

export type ResultadoProcessamento = {
  enviados: number;
  aguardando: number;
  erros: number;
  total: number;
};

/**
 * Processa todos os follow-ups pendentes ja vencidos.
 *  - disparo "automatico": envia na hora e marca enviado.
 *  - disparo "confirmar": deixa o rascunho pronto (gera com IA se preciso) e
 *    marca aguardando_confirmacao para o operador disparar com 1 clique.
 */
export async function processarFollowupsVencidos(
  agora = new Date(),
): Promise<ResultadoProcessamento> {
  const vencidos = await listarFollowupsVencidos(agora);
  const resultado: ResultadoProcessamento = {
    enviados: 0,
    aguardando: 0,
    erros: 0,
    total: vencidos.length,
  };

  for (const followup of vencidos) {
    try {
      if (followup.disparo === "automatico") {
        await enviarFollowup(followup);
        resultado.enviados += 1;
      } else {
        // Prepara o rascunho (gera com IA se ainda nao houver texto) e aguarda
        // a confirmacao do operador.
        const mensagem = await resolverMensagemFollowup(followup);
        await atualizarFollowupCampos(followup.id, {
          status: "aguardando_confirmacao",
          mensagem,
          erro: null,
        });
        resultado.aguardando += 1;
      }
    } catch (error) {
      resultado.erros += 1;
      const msg = error instanceof Error ? error.message : "Erro ao processar follow-up";
      try {
        await atualizarFollowupCampos(followup.id, { status: "erro", erro: msg });
      } catch {
        // ignora falha ao registrar o erro; segue para o proximo
      }
    }
  }

  return resultado;
}
