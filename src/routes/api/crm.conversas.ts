import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { extrairPerfilClienteDaConversa, gerarResposta, limparRespostaCliente } from "@/lib/openai";
import {
  adicionarMensagemConversa,
  atualizarConversaAguardandoHumano,
  atualizarConversaPipeline,
  buscarConversaPorTelefone,
  buscarIaAprendizadoResumo,
  buscarIaPromptConfig,
  buscarAprendizados,
  buscarIaStatus,
  definirIaGlobalDesativada,
  salvarIaPromptConfig,
  listarPedidos,
  listarConversas,
  upsertConversas,
  type Conversa,
} from "@/lib/supabase";
import {
  atualizarClienteCrm,
  criarClienteCrm,
  listarClientes,
  type ClienteCrmInput,
} from "@/lib/crm-supabase";
import { salvarDadosObservadosCliente } from "@/lib/recompra-supabase";
import { BASE_SYSTEM_PROMPT, type IaRegraCustomizada } from "@/lib/openai";
import {
  buscarMensagensChatWhatsApp,
  enviarMensagemLonga,
  enviarMidiaBase64,
  listarChatsWhatsApp,
  type ChatWhatsApp,
  type MensagemWhatsApp,
} from "@/lib/uazapi";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function nomeClienteSeguro(value?: string | null): string | undefined {
  const nome = value?.trim();
  if (!nome || /^cliente\s+\d+$/i.test(nome)) return undefined;

  return nome;
}

function chatIdFromChat(chat: ChatWhatsApp): string | undefined {
  const telefone = normalizarTelefone(chat.wa_chatid ?? chat.phone ?? "");
  if (!telefone) return undefined;

  return chat.wa_chatid?.includes("@") ? chat.wa_chatid : `${telefone}@s.whatsapp.net`;
}

function nomeFromChat(chat: ChatWhatsApp): string | undefined {
  return (
    nomeClienteSeguro(chat.wa_contactName) ??
    nomeClienteSeguro(chat.name) ??
    nomeClienteSeguro(chat.wa_name)
  );
}

function isoFromTimestamp(timestamp?: number): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;

  const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(millis);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function textoMensagemWhatsapp(message: MensagemWhatsApp): string | undefined {
  if (typeof message.text === "string" && message.text.trim()) return message.text;

  const nestedContent = stringFromContent(message.message, [
    "text",
    "body",
    "caption",
    "conversation",
  ]);
  if (nestedContent) return nestedContent;

  if (message.content && typeof message.content === "object") {
    const content = message.content as {
      text?: string;
      body?: string;
      caption?: string;
      conversation?: string;
    };
    if (typeof content.text === "string" && content.text.trim()) return content.text;
    if (typeof content.body === "string" && content.body.trim()) return content.body;
    if (typeof content.caption === "string" && content.caption.trim()) return content.caption;
    if (typeof content.conversation === "string" && content.conversation.trim()) {
      return content.conversation;
    }
  }

  const tipo = (message.messageType ?? "").toLowerCase();
  if (tipo.includes("audio")) return message.fromMe ? "[Audio enviado]" : "[Audio recebido]";
  if (tipo.includes("image")) return message.fromMe ? "[Imagem enviada]" : "[Imagem recebida]";
  if (tipo.includes("video")) return message.fromMe ? "[Video enviado]" : "[Video recebido]";
  if (tipo.includes("document"))
    return message.fromMe ? "[Documento enviado]" : "[Documento recebido]";
  if (tipo.includes("sticker"))
    return message.fromMe ? "[Figurinha enviada]" : "[Figurinha recebida]";
  if (tipo.includes("location"))
    return message.fromMe ? "[Localizacao enviada]" : "[Localizacao recebida]";
  if (tipo.includes("contact")) return message.fromMe ? "[Contato enviado]" : "[Contato recebido]";

  return undefined;
}

function stringFromContent(content: unknown, keys: string[]): string | undefined {
  if (!content || typeof content !== "object") return undefined;

  const record = content as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = stringFromContent(value, keys);
      if (nested) return nested;
    }
  }

  return undefined;
}

function mediaUrlMensagemWhatsapp(message: MensagemWhatsApp): string | undefined {
  if (typeof message.fileURL === "string" && message.fileURL.trim()) return message.fileURL.trim();
  if (typeof message.fileUrl === "string" && message.fileUrl.trim()) return message.fileUrl.trim();
  if (typeof message.mediaUrl === "string" && message.mediaUrl.trim())
    return message.mediaUrl.trim();
  if (typeof message.mediaURL === "string" && message.mediaURL.trim())
    return message.mediaURL.trim();

  const keys = [
    "fileURL",
    "fileUrl",
    "mediaUrl",
    "mediaURL",
    "URL",
    "url",
    "downloadUrl",
    "downloadURL",
  ];

  return stringFromContent(message.content, keys) ?? stringFromContent(message.message, keys);
}

function mimeTypeMensagemWhatsapp(message: MensagemWhatsApp): string | undefined {
  return (
    message.mimeType ??
    message.mimetype ??
    stringFromContent(message.content, ["mimetype", "mimeType", "mediaType"]) ??
    stringFromContent(message.message, ["mimetype", "mimeType", "mediaType"])
  );
}

function fileNameMensagemWhatsapp(message: MensagemWhatsApp): string | undefined {
  return (
    message.fileName ??
    stringFromContent(message.content, ["fileName", "filename", "title"]) ??
    stringFromContent(message.message, ["fileName", "filename", "title"])
  );
}

function mediaKeyMensagemWhatsapp(message: MensagemWhatsApp): string | undefined {
  return (
    message.mediaKey ??
    stringFromContent(message.content, ["mediaKey"]) ??
    stringFromContent(message.message, ["mediaKey"])
  );
}

function mapMensagemWhatsapp(message: MensagemWhatsApp): Conversa["historico"][number] | null {
  if (message.isGroup) return null;

  const mediaUrl = mediaUrlMensagemWhatsapp(message);
  const content = textoMensagemWhatsapp(message)?.trim();
  if (!content && !mediaUrl) return null;

  return {
    role: message.fromMe ? "assistant" : "user",
    content:
      content ??
      (message.messageType?.toLowerCase().includes("audio")
        ? message.fromMe
          ? "[Audio enviado]"
          : "[Audio recebido]"
        : message.fromMe
          ? "[Midia enviada]"
          : "[Midia recebida]"),
    id: message.messageid ?? message.id,
    at: isoFromTimestamp(message.messageTimestamp),
    source: "whatsapp",
    fromMe: Boolean(message.fromMe),
    messageType: message.messageType,
    mediaUrl,
    mimeType: mimeTypeMensagemWhatsapp(message),
    fileName: fileNameMensagemWhatsapp(message),
    mediaKey: mediaKeyMensagemWhatsapp(message),
  };
}

function chaveMensagem(message: Conversa["historico"][number]): string {
  if (message.id) return `id:${message.id}`;
  return [message.role, message.at ?? "", message.content.trim()].join("|");
}

function mergeHistorico(
  atual: Conversa["historico"],
  importado: Conversa["historico"],
): { historico: Conversa["historico"]; adicionadas: number } {
  const mensagens = new Map<string, Conversa["historico"][number]>();

  for (const mensagem of atual) {
    mensagens.set(chaveMensagem(mensagem), mensagem);
  }

  let adicionadas = 0;
  for (const mensagem of importado) {
    const chave = chaveMensagem(mensagem);
    if (!mensagens.has(chave)) adicionadas += 1;
    mensagens.set(chave, mensagem);
  }

  const historico = [...mensagens.values()].sort((a, b) => {
    const aTime = a.at ? new Date(a.at).getTime() : 0;
    const bTime = b.at ? new Date(b.at).getTime() : 0;
    if (aTime && bTime && aTime !== bTime) return aTime - bTime;
    return 0;
  });

  return { historico: historico.slice(-250), adicionadas };
}

function ultimoHorarioHistorico(historico: Conversa["historico"]): string {
  const horarios = historico
    .map((mensagem) => (mensagem.at ? new Date(mensagem.at).getTime() : 0))
    .filter((time) => time > 0);
  const ultimo = horarios.length > 0 ? Math.max(...horarios) : Date.now();

  return new Date(ultimo).toISOString();
}

async function sincronizarWhatsapp({
  chatsLimite = 12,
  mensagensLimite = 40,
}: {
  chatsLimite?: number;
  mensagensLimite?: number;
}) {
  const limiteChatsSeguro = Math.min(Math.max(chatsLimite, 1), 12);
  const limiteMensagensSeguro = Math.min(Math.max(mensagensLimite, 1), 40);
  const [chats, conversasExistentes] = await Promise.all([
    listarChatsWhatsApp({ limit: limiteChatsSeguro, offset: 0 }),
    listarConversas(),
  ]);
  const conversasPorTelefone = new Map(
    conversasExistentes.map((conversa) => [normalizarTelefone(conversa.telefone), conversa]),
  );
  const payloads: Parameters<typeof upsertConversas>[0] = [];
  let sincronizadas = 0;
  let mensagensImportadas = 0;
  let ignoradas = 0;

  for (const chat of chats) {
    const chatid = chatIdFromChat(chat);
    const telefone = normalizarTelefone(chatid ?? chat.phone ?? "");
    if (!chatid || !telefone || chat.wa_isGroup) {
      ignoradas += 1;
      continue;
    }

    const mensagens = await buscarMensagensChatWhatsApp(chatid, limiteMensagensSeguro);
    const historicoImportado = mensagens
      .map(mapMensagemWhatsapp)
      .filter((mensagem): mensagem is Conversa["historico"][number] => Boolean(mensagem));

    const existente = conversasPorTelefone.get(telefone);
    const { historico, adicionadas } = mergeHistorico(
      existente?.historico ?? [],
      historicoImportado,
    );

    if (!existente && historico.length === 0) {
      ignoradas += 1;
      continue;
    }

    payloads.push({
      telefone,
      historico,
      nome_cliente: existente?.nome_cliente ?? nomeFromChat(chat),
      aguardando_humano: existente?.aguardando_humano ?? false,
      ia_ativa: existente?.ia_ativa ?? null,
      estagio: existente?.estagio ?? "novo",
      atualizado_em: ultimoHorarioHistorico(historico),
    });

    sincronizadas += 1;
    mensagensImportadas += adicionadas;
  }

  await upsertConversas(payloads);

  return {
    ok: true,
    chats_analisados: chats.length,
    conversas_sincronizadas: sincronizadas,
    mensagens_importadas: mensagensImportadas,
    ignoradas,
  };
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

async function salvarPerfilExtraidoCliente({
  telefone,
  nomeCliente,
  historico,
}: {
  telefone: string;
  nomeCliente?: string | null;
  historico: Conversa["historico"];
}) {
  const telefoneNormalizado = normalizarTelefone(telefone);
  if (!telefoneNormalizado) throw new Error("Telefone invalido");

  const extraido = await extrairPerfilClienteDaConversa(historico);
  const clientes = await listarClientes();
  const existente = clientes.find(
    (cliente) => normalizarTelefone(cliente.telefone) === telefoneNormalizado,
  );
  const input: ClienteCrmInput = {
    nome:
      extraido.nome ??
      existente?.nome ??
      nomeClienteSeguro(nomeCliente) ??
      `Cliente ${telefoneNormalizado.slice(-4)}`,
    telefone: telefoneNormalizado,
    endereco: extraido.endereco ?? existente?.endereco,
    bairro: extraido.bairro ?? existente?.bairro,
    pets: extraido.pets ?? existente?.pets ?? [],
    perfil: existente?.perfil ?? "Novo",
    origem: existente?.origem ?? "WhatsApp IA",
    observacoes: extraido.observacoes ?? existente?.observacoes,
    followUpManual: extraido.followUpMensagem
      ? {
          mensagem: extraido.followUpMensagem,
          data: existente?.followUpManual?.data ?? "",
          hora: existente?.followUpManual?.hora ?? "",
          canal: existente?.followUpManual?.canal ?? "WhatsApp",
          status: existente?.followUpManual?.status ?? "pendente",
          midiaUrl: existente?.followUpManual?.midiaUrl ?? "",
          midiaNome: existente?.followUpManual?.midiaNome ?? "",
          midiaTipo: existente?.followUpManual?.midiaTipo ?? "",
          atualizadoEm: new Date().toISOString(),
        }
      : existente?.followUpManual,
  };

  const cliente = existente
    ? await atualizarClienteCrm(existente.id, input)
    : await criarClienteCrm(input);

  if (extraido.dadosObservados) {
    await salvarDadosObservadosCliente({
      clienteId: cliente.id,
      telefone: telefoneNormalizado,
      dados: extraido.dadosObservados,
      resumo: extraido.observacoes,
      confianca: 0.75,
    }).catch((error) => {
      console.error("[recompra] erro_salvar_dados_observados", error);
    });
  }

  return { ok: true, cliente, extraido };
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

          if (url.searchParams.get("ia") === "config") {
            const [config, aprendizado] = await Promise.all([
              buscarIaPromptConfig(),
              buscarIaAprendizadoResumo(),
            ]);

            return json({ ...config, baseSystemPrompt: BASE_SYSTEM_PROMPT, aprendizado });
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
            | { tipo: "global"; desativada: boolean }
            | { tipo: "ia_config"; systemPrompt: string; regras: IaRegraCustomizada[] };

          if (body.tipo === "global") {
            return json(await definirIaGlobalDesativada(body.desativada));
          }

          if (body.tipo === "ia_config") {
            return json(
              await salvarIaPromptConfig({
                systemPrompt: body.systemPrompt,
                regras: body.regras,
              }),
            );
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
              iaAtiva: !body.aguardandoHumano,
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
                tipo: "midia";
                id: string;
                telefone: string;
                base64: string;
                legenda?: string;
                nomeArquivo?: string;
                mimeType?: string;
                audio?: boolean;
              }
            | {
                tipo: "sugestao_ia";
                historico: Array<{ role: "user" | "assistant"; content: string }>;
                texto: string;
              }
            | {
                tipo: "perfil_cliente_ia";
                telefone: string;
                nomeCliente?: string | null;
                historico: Conversa["historico"];
              }
            | { tipo: "sincronizar_whatsapp"; chatsLimite?: number; mensagensLimite?: number };

          if (body.tipo === "sugestao_ia") {
            const [aprendizados, config] = await Promise.all([
              buscarAprendizados(10),
              buscarIaPromptConfig(),
            ]);
            const resposta = await gerarResposta(body.historico, body.texto, aprendizados, config);

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

          if (body.tipo === "perfil_cliente_ia") {
            return json(
              await salvarPerfilExtraidoCliente({
                telefone: body.telefone,
                nomeCliente: body.nomeCliente,
                historico: Array.isArray(body.historico) ? body.historico : [],
              }),
            );
          }

          if (body.tipo === "sincronizar_whatsapp") {
            return json(
              await sincronizarWhatsapp({
                chatsLimite: body.chatsLimite,
                mensagensLimite: body.mensagensLimite,
              }),
            );
          }

          if (body.tipo === "midia") {
            if (!body.base64?.trim())
              return json({ ok: false, erro: "Midia vazia" }, { status: 400 });

            const legenda = body.legenda?.trim();
            const telefone = normalizarTelefone(body.telefone);
            const envio = await enviarMidiaBase64(
              `${telefone}@s.whatsapp.net`,
              body.base64,
              legenda,
              {
                fileName: body.nomeArquivo,
                mimetype: body.mimeType,
                ptt: body.audio,
              },
            );
            const mediaUrl = stringFromContent(envio, [
              "fileURL",
              "fileUrl",
              "mediaUrl",
              "mediaURL",
              "url",
              "downloadUrl",
              "downloadURL",
            ]);

            const conteudo = body.audio
              ? "[Audio enviado]"
              : legenda
                ? `[Midia enviada] ${legenda}`
                : `[Midia enviada] ${body.nomeArquivo ?? ""}`.trim();

            return json(
              await adicionarMensagemConversa({
                id: body.id,
                mensagem: {
                  role: "assistant",
                  content: conteudo,
                  source: "crm",
                  fromMe: true,
                  messageType: body.audio ? "audio" : body.mimeType,
                  mediaUrl,
                  mimeType: body.mimeType,
                  fileName: body.nomeArquivo,
                },
              }),
            );
          }

          const texto = body.texto.trim();
          if (!texto) return json({ ok: false, erro: "Mensagem vazia" }, { status: 400 });

          const telefone = normalizarTelefone(body.telefone);
          await enviarMensagemLonga(`${telefone}@s.whatsapp.net`, texto);

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
