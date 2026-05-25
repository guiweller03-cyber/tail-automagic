import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { gerarPixPedido } from "@/lib/mercadopago";
import { gerarRespostaWhatsapp, limparRespostaCliente } from "@/lib/openai";
import { buscarRacoesTecnicasPorTexto, clientePediuFichaTecnica } from "@/lib/racoes-tecnicas";
import {
  adicionarMensagemConversa,
  atualizarPedidoPixMercadoPago,
  buscarAprendizados,
  buscarClientePorTelefone,
  buscarConversaPorTelefone,
  buscarIaStatus,
  buscarProdutosDisponiveisPorTexto,
  criarPedidoPixPendente,
  listarPedidos,
  registrarPedidoDoWhatsapp,
  salvarCadastroCliente,
  upsertConversa,
  type ClienteCadastro,
  type Conversa,
  type PedidoCrm,
} from "@/lib/supabase";
import { enviarMensagem } from "@/lib/uazapi";
import { erroLog, logPix, telefoneLog } from "@/lib/pix-log";

type UazapiMessage = {
  chatid?: string;
  fromMe?: boolean;
  messageType?: string;
  text?: string;
  senderName?: string;
  pushName?: string;
};

type UazapiWebhook = {
  body?: { message?: UazapiMessage };
  message?: UazapiMessage;
};

type ResultadoPix = {
  ok: boolean;
  erro?: string;
  mensagem?: string;
  valor_formatado?: string;
  pix_gerado: boolean;
  status_pix?: string;
  qr_code?: string;
};

type PedidoParaPix = Pick<PedidoCrm, "id" | "total" | "statusPagamento">;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function nomeClienteSeguro(value?: string | null): string | null {
  const nome = value?.trim();
  if (!nome || /^cliente\s+\d+$/i.test(nome)) return null;

  return nome;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mensagemValida(message?: UazapiMessage): message is UazapiMessage & {
  chatid: string;
  text: string;
} {
  return Boolean(
    message?.chatid &&
    !message.fromMe &&
    message.messageType === "Conversation" &&
    message.text?.trim(),
  );
}

function extrairCampoMarcador(dados: string, campo: string): string | undefined {
  const valor = dados.match(new RegExp(`${campo}\\s*=\\s*["']?([^;"'\\]]+)`, "i"))?.[1]?.trim();

  return valor || undefined;
}

function extrairCadastroCliente(content: string): {
  nome?: string;
  endereco?: string;
  bairro?: string;
  pets?: string[];
} | null {
  const marcador = content.match(/\[SALVAR_CLIENTE([^\]]*)\]/i)?.[1];
  if (!marcador) return null;

  const petsTexto = extrairCampoMarcador(marcador, "pets") ?? extrairCampoMarcador(marcador, "pet");
  const cadastro = {
    nome: extrairCampoMarcador(marcador, "nome"),
    endereco: extrairCampoMarcador(marcador, "endereco"),
    bairro: extrairCampoMarcador(marcador, "bairro"),
    pets: petsTexto
      ?.split(",")
      .map((pet) => pet.trim())
      .filter(Boolean),
  };

  return cadastro.nome || cadastro.endereco || cadastro.bairro || cadastro.pets?.length
    ? cadastro
    : null;
}

function extrairPagamentoPedido(content: string): string | undefined {
  const marcadorPedido = content.match(/\[PEDIDO\]([^\r\n]*)/i)?.[1];

  return marcadorPedido ? extrairCampoMarcador(marcadorPedido, "pagamento") : undefined;
}

function limparRespostaTecnica(content: string): string {
  return limparRespostaCliente(
    content
      .replace(/\[SALVAR_CLIENTE[^\]]*\]/gi, "")
      .replace(/\[PEDIDO\][\s\S]*$/i, "")
      .replace(/\[HANDOFF\]/gi, ""),
  );
}

function pediuPix(texto: string): boolean {
  return /(?:\bpix\b|chave\s*pix|manda(?:r)?\s+(?:a\s+)?chave\s*pix|envia(?:r)?\s+(?:a\s+)?chave\s*pix)/i.test(
    texto,
  );
}

function pixJaEnviado(texto: string): boolean {
  return /chave\s*pix\s*copia\s*e\s*cola|segue\s+a\s+chave\s*pix|pix\s+gerado|depois\s+do\s+pagamento/i.test(
    texto,
  );
}

function ultimoIndiceMensagem(
  mensagens: Conversa["historico"],
  predicate: (mensagem: Conversa["historico"][number]) => boolean,
): number {
  for (let index = mensagens.length - 1; index >= 0; index -= 1) {
    if (predicate(mensagens[index])) return index;
  }

  return -1;
}

function pixSolicitadoRecentemente(conversa: Conversa): boolean {
  const historicoRecente = conversa.historico.slice(-10);
  const ultimoPixEnviado = ultimoIndiceMensagem(
    historicoRecente,
    (mensagem) => mensagem.role === "assistant" && pixJaEnviado(mensagem.content),
  );
  const ultimaSolicitacaoPix = ultimoIndiceMensagem(
    historicoRecente,
    (mensagem) => mensagem.role === "user" && pediuPix(mensagem.content),
  );

  return ultimaSolicitacaoPix >= 0 && ultimaSolicitacaoPix > ultimoPixEnviado;
}

function clienteTemEnderecoCompleto(cliente: ClienteCadastro | null): boolean {
  return Boolean(cliente?.endereco?.trim() && cliente?.bairro?.trim());
}

function extrairEnderecoInformado(
  texto: string,
): Pick<ClienteCadastro, "endereco" | "bairro"> | null {
  if (!/\d/.test(texto) || !texto.includes(",")) return null;

  const partes = texto
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (partes.length < 3) return null;

  const indiceNumero = partes.findIndex((parte) => /\d/.test(parte));
  if (indiceNumero < 0) return null;

  const rua = partes[0];
  const numero = partes[indiceNumero];
  const bairro =
    partes.find((parte, index) => index !== 0 && index !== indiceNumero && !/\d/.test(parte)) ??
    partes.find((parte, index) => index !== 0 && index !== indiceNumero);

  if (!rua || !numero || !bairro) return null;

  return {
    endereco: `${rua}, ${numero}`,
    bairro,
  };
}

function extrairEnderecoDoHistorico(
  conversa: Conversa,
  textoAtual: string,
): Pick<ClienteCadastro, "endereco" | "bairro"> | null {
  const mensagensCliente = [
    ...conversa.historico
      .filter((mensagem) => mensagem.role === "user")
      .slice(-8)
      .map((mensagem) => mensagem.content),
    textoAtual,
  ];

  for (const mensagem of mensagensCliente.reverse()) {
    const endereco = extrairEnderecoInformado(mensagem);
    if (endereco) return endereco;
  }

  return null;
}

async function buscarOuCriarConversa(telefone: string): Promise<Conversa> {
  return (
    (await buscarConversaPorTelefone(telefone)) ??
    (await upsertConversa({
      telefone,
      historico: [],
      nome_cliente: null,
      aguardando_humano: false,
      estagio: "novo",
      atualizado_em: new Date().toISOString(),
    }))
  );
}

async function registrarMensagemCliente(conversa: Conversa, content: string): Promise<Conversa> {
  const ultimaMensagem = conversa.historico.at(-1);
  if (ultimaMensagem?.role === "user" && ultimaMensagem.content.trim() === content.trim()) {
    return conversa;
  }

  return adicionarMensagemConversa({
    id: conversa.id,
    mensagem: { role: "user", content },
  });
}

function contextoCliente(cliente: ClienteCadastro | null) {
  return cliente
    ? {
        nome: nomeClienteSeguro(cliente.nome),
        telefone: cliente.telefone,
        endereco: cliente.endereco,
        bairro: cliente.bairro,
        pets: cliente.pets,
        pedidos: cliente.pedidos,
      }
    : null;
}

function pedidosDoCliente(pedidos: PedidoCrm[], telefone: string): PedidoCrm[] {
  return pedidos.filter((pedido) => normalizarTelefone(pedido.telefone) === telefone).slice(0, 5);
}

async function tentarGerarPix({
  telefone,
  cliente,
  pedidos,
}: {
  telefone: string;
  cliente: ClienteCadastro | null;
  pedidos: PedidoParaPix[];
}): Promise<ResultadoPix> {
  const telefoneMascara = telefoneLog(telefone);
  const pedidoPendente = pedidos.find(
    (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
  );

  if (!pedidoPendente) {
    logPix(
      "whatsapp",
      "geracao_bloqueada",
      {
        telefone: telefoneMascara,
        motivo: "valor_required",
        pedidos_recentes: pedidos.length,
      },
      "warn",
    );
    return {
      ok: false,
      erro: "valor_required",
      mensagem: "Nao encontrei pedido pendente com valor para gerar Pix.",
      pix_gerado: false,
    };
  }

  if (!clienteTemEnderecoCompleto(cliente)) {
    logPix(
      "whatsapp",
      "geracao_bloqueada",
      {
        telefone: telefoneMascara,
        motivo: "endereco_required",
        pedidos_recentes: pedidos.length,
      },
      "warn",
    );
    return {
      ok: false,
      erro: "endereco_required",
      mensagem: "Endereco completo obrigatorio antes de gerar Pix.",
      pix_gerado: false,
    };
  }

  try {
    const descricao = "Pagamento via Pix Mundo Pet";
    const pedidoPix = await criarPedidoPixPendente({
      telefone,
      descricao,
      valor: pedidoPendente.total,
      vendaId: pedidoPendente.id,
    });
    logPix("whatsapp", "pedido_pix_criado", {
      telefone: telefoneMascara,
      venda_id: pedidoPendente.id,
      pedido_pix_id: pedidoPix.id,
      valor: pedidoPendente.total,
    });
    const pix = await gerarPixPedido({
      id: pedidoPix.id,
      valor: pedidoPendente.total,
      descricao,
      email: "comprador-teste@example.com",
    });
    logPix("whatsapp", "mercado_pago_gerou_pix", {
      telefone: telefoneMascara,
      pedido_pix_id: pedidoPix.id,
      pagamento_id: pix.id,
      status_pix: pix.status,
    });

    await atualizarPedidoPixMercadoPago({
      id: pedidoPix.id,
      mpPaymentId: pix.id,
      qrCode: pix.qr_code,
      qrCodeBase64: pix.qr_code_base64,
    });
    logPix("whatsapp", "pix_salvo_no_pedido", {
      telefone: telefoneMascara,
      pedido_pix_id: pedidoPix.id,
    });

    return {
      ok: true,
      pix_gerado: true,
      status_pix: pix.status,
      qr_code: pix.qr_code,
      valor_formatado: brl(pedidoPendente.total),
    };
  } catch (error) {
    logPix(
      "whatsapp",
      "falha_geracao",
      {
        telefone: telefoneMascara,
        venda_id: pedidoPendente.id,
        erro: erroLog(error),
      },
      "error",
    );
    return {
      ok: false,
      erro: "pix_failed",
      mensagem: error instanceof Error ? error.message : "Falha ao gerar Pix.",
      pix_gerado: false,
    };
  }
}

function montarMensagensPix(resposta: string, resultadoPix?: ResultadoPix): string[] {
  if (!resultadoPix?.pix_gerado || !resultadoPix.qr_code) return [resposta];

  const introducao = resposta || "Segue a chave Pix do pedido.";
  const total = resultadoPix.valor_formatado ? ` O total e ${resultadoPix.valor_formatado}.` : "";

  return [`${introducao}${total}`, resultadoPix.qr_code];
}

function respostaPixSemChave(resposta: string, resultadoPix?: ResultadoPix): string {
  if (resultadoPix?.pix_gerado) return resposta;
  if (!resultadoPix) return resposta;
  if (
    !/(?:chave|pix).{0,80}(?:anexo|enviar|gerar)|(?:anexo|envio).{0,80}(?:chave|pix)/i.test(
      resposta,
    )
  ) {
    return resposta;
  }

  if (resultadoPix?.erro === "pix_failed") {
    return "Nao consegui gerar a chave Pix agora. Vou chamar a equipe para finalizar o pagamento.";
  }

  if (resultadoPix?.erro === "endereco_required") {
    return "Antes do Pix, me passa o endereco completo com rua, numero e bairro para finalizar a entrega.";
  }

  return "Vou fechar o pedido antes de gerar a chave Pix. Me confirma o produto e a quantidade.";
}

async function registrarPedidoPixPorHistorico({
  telefone,
  conversa,
  texto,
  nomeCliente,
}: {
  telefone: string;
  conversa: Conversa;
  texto: string;
  nomeCliente?: string | null;
}) {
  const historicoPedido = [...conversa.historico.slice(-12), { role: "user", content: texto }]
    .map((mensagem) => mensagem.content)
    .join("\n");
  const produtosHistorico = await buscarProdutosDisponiveisPorTexto(historicoPedido, 2);

  if (produtosHistorico.length === 0) {
    logPix(
      "whatsapp",
      "pedido_fallback_bloqueado",
      {
        telefone: telefoneLog(telefone),
        motivo: "produto_nao_encontrado",
        produtos_encontrados: produtosHistorico.length,
      },
      "warn",
    );
    return null;
  }

  const produto = produtosHistorico[0];
  if (produtosHistorico.length > 1) {
    logPix("whatsapp", "pedido_fallback_desambiguado", {
      telefone: telefoneLog(telefone),
      sku_escolhido: produto.sku,
      produtos_encontrados: produtosHistorico.length,
    });
  }

  const pedidoSintetico = `[PEDIDO] produto="${produto.nome}"; quantidade=1; pagamento="Pix"; total="${brl(
    produto.preco,
  )}"\n${texto}`;
  const pedido = await registrarPedidoDoWhatsapp({
    telefone,
    texto: pedidoSintetico,
    nomeCliente,
    formaPagamento: "Pix",
  });

  logPix("whatsapp", "pedido_fallback_processado", {
    telefone: telefoneLog(telefone),
    sku: produto.sku,
    registrado: pedido.registrado,
    motivo: pedido.motivo ?? null,
    venda_id: pedido.vendaId ?? null,
    total: pedido.total,
  });

  return pedido;
}

export async function processarWebhookWhatsapp(event: UazapiWebhook): Promise<Response> {
  const message = event.body?.message ?? event.message;
  if (!mensagemValida(message)) {
    return json({ received: true, ignored: true });
  }

  const telefone = normalizarTelefone(message.chatid);
  const texto = message.text.trim();
  const solicitouPixNaMensagem = pediuPix(texto);
  if (solicitouPixNaMensagem) {
    logPix("whatsapp", "solicitacao_recebida", {
      telefone: telefoneLog(telefone),
      conversa_chatid_valido: Boolean(message.chatid),
    });
  }
  const conversaInicial = await buscarOuCriarConversa(telefone);
  const conversa = await registrarMensagemCliente(conversaInicial, texto);
  const solicitouPix = solicitouPixNaMensagem || pixSolicitadoRecentemente(conversa);
  const iaStatus = await buscarIaStatus();

  if (iaStatus.globalDesativada || conversa.aguardando_humano) {
    if (solicitouPix) {
      logPix(
        "whatsapp",
        "solicitacao_ignorada",
        {
          telefone: telefoneLog(telefone),
          motivo: iaStatus.globalDesativada ? "ia_global_desativada" : "aguardando_humano",
        },
        "warn",
      );
    }
    return json({
      received: true,
      ignored: true,
      reason: iaStatus.globalDesativada ? "ia_global_desativada" : "aguardando_humano",
    });
  }

  const [cliente, pedidos, produtos, aprendizados] = await Promise.all([
    buscarClientePorTelefone(telefone),
    listarPedidos(),
    buscarProdutosDisponiveisPorTexto(texto, 5),
    buscarAprendizados(5),
  ]);
  const textoComHistorico = [...conversa.historico.slice(-8), { role: "user", content: texto }]
    .map((mensagem) => mensagem.content)
    .join("\n");
  const fichasTecnicas = clientePediuFichaTecnica(texto)
    ? buscarRacoesTecnicasPorTexto(textoComHistorico, 3)
    : [];
  const pedidosRecentes = pedidosDoCliente(pedidos, telefone);
  if (solicitouPix) {
    logPix("whatsapp", "contexto_carregado", {
      telefone: telefoneLog(telefone),
      cliente_encontrado: Boolean(cliente),
      tem_endereco: Boolean(cliente?.endereco?.trim()),
      tem_bairro: Boolean(cliente?.bairro?.trim()),
      pedidos_recentes: pedidosRecentes.length,
      pedidos_pendentes_com_valor: pedidosRecentes.filter(
        (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
      ).length,
    });
  }
  const temPedidoPendente = pedidosRecentes.some(
    (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
  );
  const respostaIa = await gerarRespostaWhatsapp({
    mensagem: texto,
    contexto: {
      cliente: contextoCliente(cliente),
      conversa: {
        id: conversa.id,
        nome_cliente: nomeClienteSeguro(conversa.nome_cliente),
        aguardando_humano: conversa.aguardando_humano,
        estagio: conversa.estagio,
        historico_recente: conversa.historico.slice(-10),
      },
      pedidos_recentes: pedidosRecentes,
      produtos_relevantes: produtos.map(
        ({ estoque: _estoque, precoCompra: _precoCompra, ...produto }) => produto,
      ),
      fichas_tecnicas_relevantes: fichasTecnicas,
      aprendizados,
    },
  });
  const cadastroIa = extrairCadastroCliente(respostaIa);
  const cadastroTexto = solicitouPix ? extrairEnderecoDoHistorico(conversa, texto) : null;
  const cadastro =
    cadastroIa || cadastroTexto
      ? {
          ...cadastroTexto,
          ...cadastroIa,
        }
      : null;
  const temPedido = /\[PEDIDO\]/i.test(respostaIa);
  const nomeWhatsapp = nomeClienteSeguro(message.senderName ?? message.pushName);
  const clienteSalvo = cadastro
    ? await salvarCadastroCliente({
        telefone,
        nome: cadastro.nome ?? cliente?.nome ?? nomeWhatsapp,
        endereco: cadastro.endereco,
        bairro: cadastro.bairro,
        pets: cadastro.pets,
      })
    : cliente;
  const pedidoMarcado = temPedido
    ? await registrarPedidoDoWhatsapp({
        telefone,
        texto: `${respostaIa}\n${texto}`,
        nomeCliente: cliente?.nome ?? nomeWhatsapp,
        formaPagamento: extrairPagamentoPedido(respostaIa),
      })
    : null;
  const pedidoRegistrado =
    pedidoMarcado ??
    (solicitouPix && !temPedidoPendente
      ? await registrarPedidoPixPorHistorico({
          telefone,
          conversa,
          texto,
          nomeCliente: cliente?.nome ?? nomeWhatsapp,
        })
      : null);

  if (solicitouPix && pedidoRegistrado) {
    logPix("whatsapp", "pedido_processado_antes_pix", {
      telefone: telefoneLog(telefone),
      registrado: pedidoRegistrado.registrado,
      motivo: pedidoRegistrado.motivo ?? null,
      venda_id: pedidoRegistrado.vendaId ?? null,
      total: pedidoRegistrado.total,
    });
  }

  const pedidoNovoParaPix =
    pedidoRegistrado?.registrado && pedidoRegistrado.vendaId && pedidoRegistrado.total > 0
      ? [
          {
            id: pedidoRegistrado.vendaId,
            total: pedidoRegistrado.total,
            statusPagamento: "pendente",
          },
        ]
      : [];
  const pedidosParaPix = pedidoNovoParaPix.length > 0 ? pedidoNovoParaPix : pedidosRecentes;
  const resultadoPix =
    solicitouPix && pedidosParaPix.length > 0
      ? await tentarGerarPix({
          telefone,
          cliente: clienteSalvo,
          pedidos: pedidosParaPix,
        })
      : undefined;

  if (resultadoPix) {
    logPix(
      "whatsapp",
      resultadoPix.pix_gerado ? "pix_pronto_para_resposta" : "pix_nao_gerado",
      {
        telefone: telefoneLog(telefone),
        erro: resultadoPix.erro ?? null,
        mensagem: resultadoPix.mensagem ?? null,
        status_pix: resultadoPix.status_pix ?? null,
      },
      resultadoPix.pix_gerado ? "info" : "warn",
    );
  }

  const respostaLimpa = respostaPixSemChave(
    resultadoPix?.pix_gerado ? "Segue a chave Pix do pedido." : limparRespostaTecnica(respostaIa),
    resultadoPix,
  );
  const mensagensCliente = montarMensagensPix(respostaLimpa, resultadoPix);
  const respostaCliente = mensagensCliente.join("\n\n");
  const chatid = `${telefone}@s.whatsapp.net`;

  await Promise.all([
    (async () => {
      for (const mensagemCliente of mensagensCliente) {
        await enviarMensagem(chatid, mensagemCliente);
      }
    })()
      .then((resultado) => {
        if (solicitouPix) {
          logPix("whatsapp", "resposta_enviada", {
            telefone: telefoneLog(telefone),
            pix_anexado: Boolean(resultadoPix?.pix_gerado),
          });
        }

        return resultado;
      })
      .catch((error) => {
        if (solicitouPix) {
          logPix(
            "whatsapp",
            "falha_envio_resposta",
            {
              telefone: telefoneLog(telefone),
              pix_anexado: Boolean(resultadoPix?.pix_gerado),
              erro: erroLog(error),
            },
            "error",
          );
        }

        throw error;
      }),
    adicionarMensagemConversa({
      id: conversa.id,
      mensagem: { role: "assistant", content: respostaCliente },
    }),
  ]);

  return json({ received: true, responded: true });
}

export const Route = createFileRoute("/api/webhook/whatsapp")({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          webhook: "uazapi_whatsapp",
          message: "Webhook ativo. A UazAPI deve enviar POST para esta URL.",
        }),
      POST: async ({ request }) => {
        try {
          return await processarWebhookWhatsapp((await request.json()) as UazapiWebhook);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          logPix("whatsapp", "falha_webhook", { erro: erroLog(error) }, "error");

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
