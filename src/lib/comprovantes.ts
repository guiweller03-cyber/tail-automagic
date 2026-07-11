import {
  extrairComprovantePagamento,
  type ComprovantePagamentoExtraido,
  type MetodoPagamentoComprovante,
} from "./openai";
import {
  confirmarPixPorComprovanteWhatsapp,
  existeVendaComMarcador,
  existeVendaPagaComValor,
  registrarPedidoDoWhatsapp,
  vincularPedidoPixAVenda,
  type Conversa,
} from "./supabase";
import { urlMidiaDescriptografada } from "./uazapi";
import { comprovanteStoragePath, uploadComprovanteStorage } from "./crm-supabase";

type MensagemHistorico = Conversa["historico"][number];

/** Tipos de midia que vale guardar permanentemente (comprovantes). */
export function ehMidiaComprovantePersistivel(
  metadata: Pick<MensagemHistorico, "mediaUrl" | "mimeType" | "messageType" | "fileName">,
): boolean {
  if (!metadata.mediaUrl) return false;

  const mime = metadata.mimeType?.toLowerCase() ?? "";
  const tipo = metadata.messageType?.toLowerCase() ?? "";
  const nome = metadata.fileName?.toLowerCase() ?? "";

  return (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    tipo.includes("image") ||
    tipo.includes("document") ||
    /\.(?:png|jpe?g|webp|gif|pdf)$/i.test(nome)
  );
}

/**
 * Baixa a midia do WhatsApp enquanto ainda esta fresca na UazAPI e copia para o
 * bucket permanente do Supabase. Devolve a URL estavel (e o content-type real),
 * ou null se nao deu para resolver/baixar. Best-effort: nunca lanca.
 */
export async function persistirMidiaComprovante({
  telefone,
  id,
  mediaUrl,
  mimeType,
  messageType,
  fileName,
}: {
  telefone: string;
  id?: string;
  mediaUrl?: string;
  mimeType?: string;
  messageType?: string;
  fileName?: string;
}): Promise<{ url: string; mimeType?: string } | null> {
  try {
    // Ja persistida: nada a fazer.
    if (mediaUrl && /\/storage\/v1\/object\/public\//.test(mediaUrl)) {
      return { url: mediaUrl, mimeType };
    }

    const fonte = await urlMidiaDescriptografada({ id, mediaUrl, mimeType, messageType });
    if (!fonte) return null;

    const response = await fetch(fonte);
    if (!response.ok) return null;

    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ||
      mimeType?.toLowerCase() ||
      "application/octet-stream";

    if (!contentType.startsWith("image/") && contentType !== "application/pdf") {
      return null;
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) return null;

    const path = comprovanteStoragePath(telefone, id, contentType);
    const url = await uploadComprovanteStorage({ path, bytes, contentType });

    return { url, mimeType: contentType };
  } catch (error) {
    console.error("[comprovantes] erro_persistir_midia", error);
    return null;
  }
}

export function formaPagamentoDoMetodo(metodo?: MetodoPagamentoComprovante): string {
  switch (metodo) {
    case "cartao":
      return "Cartão";
    case "transferencia":
      return "Transferência";
    case "boleto":
      return "Boleto";
    case "dinheiro":
      return "Dinheiro";
    default:
      return "Pix";
  }
}

export function primeiraUrlTexto(texto: string): string | undefined {
  return texto.match(/https?:\/\/[^\s<>"')]+/i)?.[0];
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function podeSerComprovante(mensagem: MensagemHistorico): boolean {
  if (mensagem.role !== "user") return false;

  const texto = mensagem.content ?? "";
  const mime = mensagem.mimeType?.toLowerCase() ?? "";
  const tipo = mensagem.messageType?.toLowerCase() ?? "";
  const nome = mensagem.fileName?.toLowerCase() ?? "";
  const temImagem =
    Boolean(mensagem.mediaUrl) &&
    (mime.startsWith("image/") || tipo.includes("image") || /\.(?:png|jpe?g|webp)$/i.test(nome));
  const temDocumento =
    Boolean(mensagem.mediaUrl) &&
    (mime === "application/pdf" || tipo.includes("document") || /\.pdf$/i.test(nome));
  const textoSugereComprovante =
    /(?:comprovante|paguei|pagamento|pago|pix|transfer[eê]ncia|recibo|maquininha|cart[aã]o|d[eé]bito|cr[eé]dito|segue\s+(?:o\s+)?comprovante)/i.test(
      texto,
    );
  const temLink = /https?:\/\/\S+/i.test(texto);

  return temImagem || temDocumento || textoSugereComprovante || temLink;
}

export function marcadorComprovante(mensagem: MensagemHistorico): string | undefined {
  const id = mensagem.id?.trim();

  return id ? `WPP_PAY:${id.slice(0, 60)}` : undefined;
}

export function contextoPedidoDoHistorico(
  historico: Conversa["historico"],
  comprovante: MensagemHistorico,
  valor: number,
  formaPagamento = "Pix",
): string {
  const index = historico.findIndex(
    (mensagem) =>
      mensagem === comprovante || (Boolean(mensagem.id) && mensagem.id === comprovante.id),
  );
  const inicio = index >= 0 ? Math.max(0, index - 14) : Math.max(0, historico.length - 18);
  const fim = index >= 0 ? Math.min(historico.length, index + 1) : historico.length;
  const contexto = historico
    .slice(inicio, fim)
    .map((mensagem) => `${mensagem.role === "user" ? "Cliente" : "Atendente"}: ${mensagem.content}`)
    .join("\n");

  return `${contexto}\n[PEDIDO] pagamento="${formaPagamento}"; total="${brl(valor)}"`;
}

export async function analisarMensagemComprovante(
  mensagem: MensagemHistorico,
): Promise<ComprovantePagamentoExtraido> {
  const mediaUrl =
    (await urlMidiaDescriptografada({
      id: mensagem.id,
      mediaUrl: mensagem.mediaUrl,
      mimeType: mensagem.mimeType,
      messageType: mensagem.messageType,
    })) ?? primeiraUrlTexto(mensagem.content);

  return extrairComprovantePagamento({
    texto: mensagem.content,
    mediaUrl,
    fileName: mensagem.fileName,
  });
}

export type PagamentoProcessado = {
  vendaId?: string;
  pedidoPixId?: string;
  valor?: number;
  formaPagamento: string;
  mensagemId?: string;
  idTransacao?: string;
};

export type DiagnosticoComprovante = {
  mensagemId?: string;
  conteudo: string;
  temMedia: boolean;
  ehComprovante: boolean;
  metodo?: string;
  valor?: number;
  confianca: number;
  motivo?: string;
  resultado: string;
};

export type ResultadoProcessamentoComprovantes = {
  analisados: number;
  confirmados: number;
  duplicados: number;
  pagamentos: PagamentoProcessado[];
  diagnostico?: DiagnosticoComprovante[];
};

/**
 * Percorre o historico de uma conversa, analisa cada mensagem candidata a
 * comprovante (imagem, PDF, link ou texto) e lanca/confirma o pagamento no
 * sistema. Com dedupPersistente=true (varreduras retroativas), usa marcadores
 * gravados na observacao da venda para nunca lancar o mesmo comprovante duas vezes.
 */
export async function processarComprovantesHistorico({
  telefone,
  nomeCliente,
  historico,
  maxMensagens = 8,
  dedupPersistente = false,
  confiancaMinima = 0.55,
  debug = false,
}: {
  telefone: string;
  nomeCliente?: string | null;
  historico: Conversa["historico"];
  maxMensagens?: number;
  dedupPersistente?: boolean;
  confiancaMinima?: number;
  debug?: boolean;
}): Promise<ResultadoProcessamentoComprovantes> {
  const candidatos = historico.filter(podeSerComprovante);
  const candidatosLimitados = maxMensagens > 0 ? candidatos.slice(-maxMensagens) : candidatos;
  const resultado: ResultadoProcessamentoComprovantes = {
    analisados: 0,
    confirmados: 0,
    duplicados: 0,
    pagamentos: [],
    diagnostico: debug ? [] : undefined,
  };
  const diagnosticar = (
    mensagem: MensagemHistorico,
    extraido: ComprovantePagamentoExtraido | null,
    resultadoMensagem: string,
  ) => {
    resultado.diagnostico?.push({
      mensagemId: mensagem.id,
      conteudo: mensagem.content.slice(0, 120),
      temMedia: Boolean(mensagem.mediaUrl),
      ehComprovante: extraido?.ehComprovante ?? false,
      metodo: extraido?.metodo,
      valor: extraido?.valor,
      confianca: extraido?.confianca ?? 0,
      motivo: extraido?.motivo,
      resultado: resultadoMensagem,
    });
  };

  for (const mensagem of candidatosLimitados) {
    try {
      const marcador = marcadorComprovante(mensagem);
      if (dedupPersistente && marcador && (await existeVendaComMarcador(marcador))) {
        resultado.duplicados += 1;
        diagnosticar(mensagem, null, "ja_lancado_marcador");
        continue;
      }

      const extraido = await analisarMensagemComprovante(mensagem);
      resultado.analisados += 1;

      if (!extraido.ehComprovante || !extraido.valor || extraido.confianca < confiancaMinima) {
        diagnosticar(
          mensagem,
          extraido,
          !extraido.ehComprovante
            ? "nao_e_comprovante"
            : !extraido.valor
              ? "sem_valor"
              : "confianca_baixa",
        );
        continue;
      }

      if (
        dedupPersistente &&
        extraido.idTransacao &&
        (await existeVendaComMarcador(extraido.idTransacao))
      ) {
        resultado.duplicados += 1;
        diagnosticar(mensagem, extraido, "ja_lancado_id_transacao");
        continue;
      }

      const formaPagamento = formaPagamentoDoMetodo(extraido.metodo);
      const confirmacao = await confirmarPixPorComprovanteWhatsapp({
        telefone,
        valor: extraido.valor,
        formaPagamento,
      });

      if (confirmacao.confirmado) {
        resultado.confirmados += 1;
        resultado.pagamentos.push({
          vendaId: confirmacao.vendaId,
          pedidoPixId: confirmacao.pedidoPixId,
          valor: confirmacao.valor ?? extraido.valor,
          formaPagamento,
          mensagemId: mensagem.id,
          idTransacao: extraido.idTransacao,
        });
        diagnosticar(mensagem, extraido, "pagamento_confirmado_em_pedido_existente");
        continue;
      }

      if (
        confirmacao.motivo !== "pedido_pendente_nao_encontrado" &&
        confirmacao.motivo !== "pedido_pix_sem_venda"
      ) {
        diagnosticar(mensagem, extraido, `nao_confirmado:${confirmacao.motivo}`);
        continue;
      }

      if (
        dedupPersistente &&
        (await existeVendaPagaComValor({
          telefone,
          valor: extraido.valor,
          dataReferencia: mensagem.at,
        }))
      ) {
        resultado.duplicados += 1;
        diagnosticar(mensagem, extraido, "ja_existe_venda_paga_mesmo_valor");
        continue;
      }

      const observacaoExtra = [
        marcador,
        `Pagamento ${formaPagamento} confirmado por comprovante no WhatsApp`,
        extraido.idTransacao ? `ID ${extraido.idTransacao}` : null,
        extraido.dataPagamento ? `Data ${extraido.dataPagamento}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
      const pedido = await registrarPedidoDoWhatsapp({
        telefone,
        texto: contextoPedidoDoHistorico(historico, mensagem, extraido.valor, formaPagamento),
        nomeCliente,
        formaPagamento,
        totalPago: extraido.valor,
        pago: true,
        observacaoExtra,
      });

      if (pedido.registrado && pedido.vendaId) {
        if (confirmacao.pedidoPixId) {
          await vincularPedidoPixAVenda({
            pedidoPixId: confirmacao.pedidoPixId,
            vendaId: pedido.vendaId,
          });
        }

        resultado.confirmados += 1;
        resultado.pagamentos.push({
          vendaId: pedido.vendaId,
          pedidoPixId: confirmacao.pedidoPixId,
          valor: pedido.total,
          formaPagamento,
          mensagemId: mensagem.id,
          idTransacao: extraido.idTransacao,
        });
        diagnosticar(mensagem, extraido, "venda_paga_lancada");
      } else {
        diagnosticar(mensagem, extraido, `venda_nao_registrada:${pedido.motivo ?? "sem_motivo"}`);
      }
    } catch (error) {
      console.error("[comprovantes] erro_processar_comprovante", error);
    }
  }

  return resultado;
}
