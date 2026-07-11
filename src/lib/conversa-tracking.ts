import {
  extrairCompraDaConversa,
  extrairPerfilClienteDaConversa,
  type CompraConversaExtraida,
} from "./openai";
import {
  marcadorComprovante,
  processarComprovantesHistorico,
  type DiagnosticoComprovante,
  type PagamentoProcessado,
} from "./comprovantes";
import {
  existeVendaComMarcador,
  existeVendaPagaComValor,
  registrarPedidoDoWhatsapp,
  salvarCadastroCliente,
  type Conversa,
} from "./supabase";
import { salvarDadosObservadosCliente } from "./recompra-supabase";

type ResultadoPerfil = {
  atualizado: boolean;
  nome?: string;
  dadosObservados: boolean;
};

type CompraRegistrada = {
  vendaId?: string;
  total: number;
  formaPagamento: string;
  pago: boolean;
  marcador: string;
  motivo?: string;
};

export type ResultadoTrackingConversa = {
  telefone: string;
  nome_cliente: string | null;
  perfil: ResultadoPerfil;
  comprovantes: {
    analisados: number;
    confirmados: number;
    duplicados: number;
    pagamentos: PagamentoProcessado[];
    diagnostico?: DiagnosticoComprovante[];
  };
  compras: {
    analisadas: number;
    registradas: number;
    duplicadas: number;
    itens: CompraRegistrada[];
    diagnostico?: Array<{
      marcador: string;
      ehCompra: boolean;
      status?: string;
      total?: number;
      confianca: number;
      motivo?: string;
      resultado: string;
    }>;
  };
};

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function hashCurto(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function formaPagamentoCompra(compra: CompraConversaExtraida): string {
  switch (compra.formaPagamento) {
    case "cartao":
      return "Cartao";
    case "transferencia":
      return "Transferencia";
    case "boleto":
      return "Boleto";
    case "dinheiro":
      return "Dinheiro";
    default:
      return "Pix";
  }
}

function mensagensComSinalDeCompra(historico: Conversa["historico"]): number[] {
  const indices = new Set<number>();

  historico.forEach((mensagem, index) => {
    const texto = mensagem.content ?? "";
    if (mensagem.role === "assistant" && /\[PEDIDO\]/i.test(texto)) {
      indices.add(index);
      return;
    }

    if (
      mensagem.role === "user" &&
      /(?:vou\s+querer|pode\s+(?:separar|mandar|enviar)|fecha(?:r)?|fechado|pedido|quero\s+\d|manda\s+(?:o\s+)?pix|paguei|comprovante|cart[aã]o|dinheiro|entrega)/i.test(
        texto,
      )
    ) {
      indices.add(index);
    }
  });

  if (indices.size === 0 && historico.length > 0) {
    indices.add(historico.length - 1);
  }

  return [...indices].sort((a, b) => a - b);
}

function janelaCompra(
  historico: Conversa["historico"],
  index: number,
  tamanho = 36,
): Conversa["historico"] {
  const inicio = Math.max(0, index - Math.floor(tamanho * 0.75));
  const fim = Math.min(historico.length, index + Math.floor(tamanho * 0.25) + 1);

  return historico.slice(inicio, fim);
}

function marcadorCompra(
  telefone: string,
  janela: Conversa["historico"],
  compra: CompraConversaExtraida,
): string {
  const ids = janela
    .map((mensagem) => mensagem.id)
    .filter((id): id is string => Boolean(id))
    .slice(-8)
    .join("|");
  const base =
    ids ||
    janela
      .slice(-8)
      .map((mensagem) => `${mensagem.role}:${mensagem.at ?? ""}:${mensagem.content}`)
      .join("|");
  const total = compra.total ? compra.total.toFixed(2) : "sem-total";

  return `WPP_TRACK:${hashCurto(`${telefone}|${total}|${base}`)}`;
}

function textoPedidoCompra(janela: Conversa["historico"], compra: CompraConversaExtraida): string {
  const contexto = janela
    .map((mensagem) => `${mensagem.role === "user" ? "Cliente" : "Atendente"}: ${mensagem.content}`)
    .join("\n");
  const produto = compra.produtos?.[0];
  const quantidade = compra.quantidade ?? 1;
  const total = compra.total
    ? compra.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : undefined;
  const marcador = [
    "[PEDIDO]",
    produto ? `produto="${produto}"` : null,
    `quantidade=${quantidade}`,
    `pagamento="${formaPagamentoCompra(compra)}"`,
    total ? `total="${total}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `${contexto}\n${marcador}`;
}

async function janelaJaTemComprovanteLancado(janela: Conversa["historico"]): Promise<boolean> {
  for (const mensagem of janela) {
    const marcador = marcadorComprovante(mensagem);
    if (marcador && (await existeVendaComMarcador(marcador))) return true;
  }

  return false;
}

async function atualizarPerfilCliente({
  conversa,
  telefone,
}: {
  conversa: Conversa;
  telefone: string;
}): Promise<ResultadoPerfil> {
  const perfil = await extrairPerfilClienteDaConversa(conversa.historico);

  if (
    !perfil.nome &&
    !perfil.endereco &&
    !perfil.bairro &&
    !perfil.pets?.length &&
    !perfil.observacoes &&
    !perfil.dadosObservados
  ) {
    return { atualizado: false, dadosObservados: false };
  }

  const cliente = await salvarCadastroCliente({
    telefone,
    nome: perfil.nome ?? conversa.nome_cliente,
    endereco: perfil.endereco,
    bairro: perfil.bairro,
    pets: perfil.pets,
    origem: "WhatsApp IA",
  });

  if (perfil.dadosObservados) {
    await salvarDadosObservadosCliente({
      clienteId: cliente.id,
      telefone,
      dados: perfil.dadosObservados,
      resumo: perfil.observacoes,
      confianca: 0.75,
    }).catch((error) => {
      console.error("[conversa-tracking] erro_salvar_dados_observados", error);
    });
  }

  return {
    atualizado: true,
    nome: perfil.nome,
    dadosObservados: Boolean(perfil.dadosObservados),
  };
}

async function processarComprasConversa({
  conversa,
  telefone,
  confiancaMinima,
  debug,
}: {
  conversa: Conversa;
  telefone: string;
  confiancaMinima: number;
  debug: boolean;
}): Promise<ResultadoTrackingConversa["compras"]> {
  const resultado: ResultadoTrackingConversa["compras"] = {
    analisadas: 0,
    registradas: 0,
    duplicadas: 0,
    itens: [],
    diagnostico: debug ? [] : undefined,
  };

  for (const index of mensagensComSinalDeCompra(conversa.historico)) {
    const janela = janelaCompra(conversa.historico, index);
    const compra = await extrairCompraDaConversa(janela);
    const marcador = marcadorCompra(telefone, janela, compra);

    resultado.analisadas += 1;

    const diagnosticar = (status: string) => {
      resultado.diagnostico?.push({
        marcador,
        ehCompra: compra.ehCompra,
        status: compra.status,
        total: compra.total,
        confianca: compra.confianca,
        motivo: compra.motivo,
        resultado: status,
      });
    };

    if (!compra.ehCompra || compra.status !== "fechada" || compra.confianca < confiancaMinima) {
      diagnosticar("nao_e_compra_fechada");
      continue;
    }

    if (await existeVendaComMarcador(marcador)) {
      resultado.duplicadas += 1;
      diagnosticar("ja_lancada_marcador");
      continue;
    }

    if (await janelaJaTemComprovanteLancado(janela)) {
      resultado.duplicadas += 1;
      diagnosticar("ja_lancada_por_comprovante");
      continue;
    }

    if (
      compra.pagamentoConfirmado &&
      compra.total &&
      (await existeVendaPagaComValor({
        telefone,
        valor: compra.total,
        dataReferencia: janela.at(-1)?.at,
      }))
    ) {
      resultado.duplicadas += 1;
      diagnosticar("ja_existe_venda_paga_mesmo_valor");
      continue;
    }

    const formaPagamento = formaPagamentoCompra(compra);
    const pedido = await registrarPedidoDoWhatsapp({
      telefone,
      texto: textoPedidoCompra(janela, compra),
      nomeCliente: conversa.nome_cliente,
      formaPagamento,
      totalPago: compra.total,
      pago: compra.pagamentoConfirmado === true,
      observacaoExtra: [
        marcador,
        "Compra detectada por varredura IA do WhatsApp",
        compra.motivo ? compra.motivo.slice(0, 80) : null,
      ]
        .filter(Boolean)
        .join(" | "),
    });

    if (pedido.registrado && pedido.vendaId) {
      resultado.registradas += 1;
      resultado.itens.push({
        vendaId: pedido.vendaId,
        total: pedido.total,
        formaPagamento,
        pago: compra.pagamentoConfirmado === true,
        marcador,
        motivo: compra.motivo,
      });
      diagnosticar("pedido_registrado");
    } else {
      diagnosticar(`pedido_nao_registrado:${pedido.motivo ?? "sem_motivo"}`);
    }
  }

  return resultado;
}

export async function trackearConversaCompleta({
  conversa,
  maxComprovantes,
  confiancaCompra = 0.68,
  debug = false,
}: {
  conversa: Conversa;
  maxComprovantes: number;
  confiancaCompra?: number;
  debug?: boolean;
}): Promise<ResultadoTrackingConversa> {
  const telefone = normalizarTelefone(conversa.telefone);
  if (!telefone) throw new Error("Telefone invalido");

  const perfil = await atualizarPerfilCliente({ conversa, telefone });
  const comprovantes = await processarComprovantesHistorico({
    telefone,
    nomeCliente: conversa.nome_cliente,
    historico: conversa.historico,
    maxMensagens: maxComprovantes,
    dedupPersistente: true,
    debug,
  });
  const compras = await processarComprasConversa({
    conversa,
    telefone,
    confiancaMinima: confiancaCompra,
    debug,
  });

  return {
    telefone,
    nome_cliente: conversa.nome_cliente,
    perfil,
    comprovantes,
    compras,
  };
}
