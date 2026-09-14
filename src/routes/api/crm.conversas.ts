import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { extrairPerfilClienteDaConversa, gerarResposta, limparRespostaCliente } from "@/lib/openai";
import { processarComprovantesHistorico } from "@/lib/comprovantes";
import {
  adicionarMensagemConversa,
  atualizarConversaAguardandoHumano,
  atualizarConversaPipeline,
  buscarConversaPorId,
  buscarConversaPorTelefone,
  buscarIaAprendizadoResumo,
  buscarIaPromptConfig,
  buscarAprendizados,
  buscarIaStatus,
  buscarKanbanConfig,
  buscarClientePorTelefone,
  definirIaGlobalDesativada,
  definirConversaBloqueada,
  listarConversasBloqueadas,
  listarTelefonesBloqueados,
  marcarConversaLida,
  salvarIaPromptConfig,
  salvarKanbanConfig,
  listarConversas,
  listarConversasAtualizadasDesde,
  listarConversasResumo,
  resumoFinanceiroPorTelefone,
  salvarCadastroCliente,
  upsertConversas,
  type Conversa,
} from "@/lib/supabase";
import {
  atualizarClienteCrm,
  criarClienteCrm,
  excluirClienteCrm,
  listarClientes,
  type ClienteCrmInput,
} from "@/lib/crm-supabase";
import { removerLeadTotal } from "@/lib/leads-totais-supabase";
import type { PetDetalhe } from "@/lib/crm-types";
import type { PerfilClienteExtraido } from "@/lib/openai";
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
import { normalizarNomeContatoWhatsapp } from "@/lib/whatsapp-nomes";

const MEDIA_URL_RESPONSE_KEYS = [
  "fileURL",
  "fileUrl",
  "mediaUrl",
  "mediaURL",
  "url",
  "downloadUrl",
  "downloadURL",
];

const MAX_MIDIA_REMOTA_BYTES = 10 * 1024 * 1024;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function apiErrorResponse(error: unknown): Response {
  const rawMessage = error instanceof Error ? error.message : "Erro desconhecido";
  const isOpenAiError =
    /OpenAI/i.test(rawMessage) ||
    /api\.openai\.com/i.test(rawMessage) ||
    /invalid_api_key/i.test(rawMessage) ||
    /Incorrect API key/i.test(rawMessage);

  if (isOpenAiError) {
    const isInvalidKey = /invalid_api_key|Incorrect API key/i.test(rawMessage);

    console.error("[crm.conversas] openai_error", maskSensitiveError(rawMessage));

    return json(
      {
        ok: false,
        erro: isInvalidKey
          ? "A chave da OpenAI configurada no servidor esta invalida. Atualize o secret OPENAI_API_KEY no Cloudflare e publique novamente."
          : "Nao foi possivel consultar a OpenAI agora. Tente novamente em instantes.",
      },
      { status: 502 },
    );
  }

  console.error("[crm.conversas] api_error", maskSensitiveError(rawMessage));

  return json({ ok: false, erro: maskSensitiveError(rawMessage) }, { status: 500 });
}

function maskSensitiveError(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, (key) => {
    if (key.length <= 12) return "sk-***";
    return `${key.slice(0, 7)}...${key.slice(-4)}`;
  });
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function normalizarMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("URL da midia vazia");

  const url = new URL(trimmed);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("URL da midia invalida");
  }

  return url.toString();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function baixarMidiaUrlComoBase64(
  mediaUrl: string,
): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(mediaUrl);
  if (!response.ok) throw new Error("Foto indisponivel");

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MIDIA_REMOTA_BYTES) throw new Error("Foto muito grande");

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("URL nao retornou uma imagem");

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_MIDIA_REMOTA_BYTES) throw new Error("Foto muito grande");

  return { base64: arrayBufferToBase64(buffer), mimeType };
}

function nomeClienteSeguro(value?: string | null): string | undefined {
  return normalizarNomeContatoWhatsapp(value) ?? undefined;
}

const PESO_PADRAO_GATO_KG = 3.5;

function pesoPadraoPet(especie?: "cachorro" | "gato", pesoKg?: number): number | undefined {
  return pesoKg ?? (especie === "gato" ? PESO_PADRAO_GATO_KG : undefined);
}

function normalizarNomePet(value?: string | null): string {
  return value?.trim() ?? "";
}

function chaveNomePet(value?: string | null): string {
  return normalizarNomePet(value).toLowerCase();
}

function petTemDados(pet: PetDetalhe): boolean {
  return Boolean(
    normalizarNomePet(pet.nome) ||
    pet.especie ||
    pet.castrado !== undefined ||
    pet.raca ||
    pet.porte ||
    pet.pesoKg ||
    pet.idade ||
    pet.nascimento ||
    pet.observacao,
  );
}

function mesclarNomesPets(atuais: string[] = [], extraidos: string[] = []): string[] {
  const resultado: string[] = [];
  const vistos = new Set<string>();

  for (const nome of [...atuais, ...extraidos]) {
    const limpo = normalizarNomePet(nome);
    const chave = chaveNomePet(limpo);
    if (!limpo || vistos.has(chave)) continue;

    vistos.add(chave);
    resultado.push(limpo);
  }

  return resultado.slice(0, 20);
}

function mesclarPetDetalhe(atual: PetDetalhe, extraido: PetDetalhe): PetDetalhe {
  const observacaoAtual = atual.observacao?.trim();
  const observacaoExtraida = extraido.observacao?.trim();
  const observacao =
    observacaoAtual && observacaoExtraida && observacaoAtual !== observacaoExtraida
      ? `${observacaoAtual} | ${observacaoExtraida}`
      : observacaoExtraida || observacaoAtual || undefined;

  return {
    ...atual,
    nome: normalizarNomePet(extraido.nome) || normalizarNomePet(atual.nome),
    especie: extraido.especie ?? atual.especie,
    castrado: extraido.castrado ?? atual.castrado,
    raca: extraido.raca?.trim() || atual.raca,
    porte: extraido.porte ?? atual.porte,
    pesoKg: pesoPadraoPet(extraido.especie ?? atual.especie, extraido.pesoKg ?? atual.pesoKg),
    idade: extraido.idade?.trim() || atual.idade,
    nascimento: extraido.nascimento?.trim() || atual.nascimento,
    observacao,
  };
}

function mesclarPetsDetalhes(
  atuais: PetDetalhe[] = [],
  extraidos: PetDetalhe[] = [],
): PetDetalhe[] {
  const resultado = atuais
    .map((pet) => ({ ...pet, nome: normalizarNomePet(pet.nome) }))
    .filter(petTemDados);
  const indicePorNome = new Map<string, number>();

  resultado.forEach((pet, index) => {
    const chave = chaveNomePet(pet.nome);
    if (chave) indicePorNome.set(chave, index);
  });

  for (const extraido of extraidos) {
    const pet = { ...extraido, nome: normalizarNomePet(extraido.nome) };
    if (!petTemDados(pet)) continue;

    const chave = chaveNomePet(pet.nome);
    const index = chave ? indicePorNome.get(chave) : undefined;
    if (index !== undefined) {
      resultado[index] = mesclarPetDetalhe(resultado[index], pet);
      continue;
    }

    if (chave) indicePorNome.set(chave, resultado.length);
    resultado.push(pet);
  }

  return resultado.slice(0, 20);
}

/** Converte o perfil extraido pela IA em sugestoes de dados do pet editaveis. */
function petsDetalhesDoPerfil(perfil: PerfilClienteExtraido): PetDetalhe[] {
  const observados = perfil.dadosObservados?.pets ?? [];
  const especiePadrao = perfil.especies?.[0];
  const pets: PetDetalhe[] = [];
  const vistos = new Set<string>();
  const chave = (nome?: string) => (nome ?? "").trim().toLowerCase();

  for (const obs of observados) {
    const nome = obs.nome?.trim() ?? "";
    const especie = obs.especie ?? especiePadrao;
    pets.push({
      nome,
      especie,
      castrado: obs.castrado,
      raca: obs.raca,
      porte: obs.porte,
      pesoKg: pesoPadraoPet(especie, obs.pesoKg),
      idade: obs.idade,
      nascimento: obs.nascimento,
      observacao: obs.observacao ?? (obs.apetite ? `Apetite ${obs.apetite}` : undefined),
    });
    if (nome) vistos.add(chave(nome));
  }

  for (const nome of perfil.pets ?? []) {
    if (vistos.has(chave(nome))) continue;
    pets.push({
      nome: nome.trim(),
      especie: especiePadrao,
      pesoKg: pesoPadraoPet(especiePadrao),
    });
    vistos.add(chave(nome));
  }

  return pets
    .filter(
      (pet) =>
        pet.nome ||
        pet.especie ||
        pet.castrado !== undefined ||
        pet.raca ||
        pet.porte ||
        pet.pesoKg ||
        pet.idade ||
        pet.nascimento ||
        pet.observacao,
    )
    .slice(0, 20);
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
  const [chats, conversasExistentes, clientesExistentes, telefonesBloqueados] = await Promise.all([
    listarChatsWhatsApp({ limit: limiteChatsSeguro, offset: 0 }),
    listarConversas(),
    listarClientes(),
    listarTelefonesBloqueados(),
  ]);
  const conversasPorTelefone = new Map(
    conversasExistentes.map((conversa) => [normalizarTelefone(conversa.telefone), conversa]),
  );
  const clientesPorTelefone = new Set(
    clientesExistentes.map((cliente) => normalizarTelefone(cliente.telefone)),
  );
  const payloads: Parameters<typeof upsertConversas>[0] = [];
  const clientesParaRegistrar: Array<{ telefone: string; nome?: string | null }> = [];
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

    // Nao reintroduz contatos bloqueados: a listarConversas os esconde, entao sem
    // este filtro o sync recriaria a conversa a partir do historico do WhatsApp.
    if (telefonesBloqueados.has(telefone)) {
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

    const nomeCliente = nomeClienteSeguro(existente?.nome_cliente) ?? nomeFromChat(chat);
    payloads.push({
      telefone,
      historico,
      nome_cliente: nomeCliente,
      aguardando_humano: existente?.aguardando_humano ?? false,
      ia_ativa: existente?.ia_ativa ?? null,
      estagio: existente?.estagio ?? "novo",
      atualizado_em: ultimoHorarioHistorico(historico),
    });

    // Garante que todo contato sincronizado vire tambem um lead (cliente),
    // assim o painel de "Leads" nao diverge das conversas importadas.
    if (!clientesPorTelefone.has(telefone)) {
      clientesParaRegistrar.push({ telefone, nome: nomeCliente });
      clientesPorTelefone.add(telefone);
    }

    sincronizadas += 1;
    mensagensImportadas += adicionadas;
  }

  await upsertConversas(payloads);

  let clientesRegistrados = 0;
  for (const novoCliente of clientesParaRegistrar) {
    try {
      await salvarCadastroCliente({ telefone: novoCliente.telefone, nome: novoCliente.nome });
      clientesRegistrados += 1;
    } catch (error) {
      console.error(
        "[crm.conversas] erro_registrar_cliente_sync",
        maskSensitiveError(String(error)),
      );
    }
  }

  return {
    ok: true,
    chats_analisados: chats.length,
    conversas_sincronizadas: sincronizadas,
    clientes_registrados: clientesRegistrados,
    mensagens_importadas: mensagensImportadas,
    ignoradas,
  };
}

/**
 * Remove o lead/cliente de um contato bloqueado das tabelas clientes e
 * leads_totais. Tolerante a erro: o bloqueio da conversa ja vale por si, entao
 * uma falha aqui nao deve derrubar a resposta da API.
 */
async function removerLeadDoContatoBloqueado(telefone: string): Promise<void> {
  const telefoneLimpo = normalizarTelefone(telefone);
  if (!telefoneLimpo) return;

  try {
    const cliente = await buscarClientePorTelefone(telefoneLimpo);
    if (cliente) await excluirClienteCrm(cliente.id);
    await removerLeadTotal(telefoneLimpo);
  } catch (error) {
    console.error(
      "[crm.conversas] erro_remover_cliente_bloqueado",
      maskSensitiveError(String(error)),
    );
  }
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

async function confirmarComprovantesDoHistorico({
  telefone,
  nomeCliente,
  historico,
}: {
  telefone: string;
  nomeCliente?: string | null;
  historico: Conversa["historico"];
}) {
  return processarComprovantesHistorico({
    telefone,
    nomeCliente,
    historico,
    maxMensagens: 8,
    dedupPersistente: true,
  });
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

  const [extraido, comprovantesPix] = await Promise.all([
    extrairPerfilClienteDaConversa(historico),
    confirmarComprovantesDoHistorico({
      telefone: telefoneNormalizado,
      nomeCliente,
      historico,
    }),
  ]);
  const clientes = await listarClientes();
  const existente = clientes.find(
    (cliente) => normalizarTelefone(cliente.telefone) === telefoneNormalizado,
  );
  const petsDetalhesExtraidos = petsDetalhesDoPerfil(extraido);
  const petsExtraidos = mesclarNomesPets(
    extraido.pets ?? [],
    petsDetalhesExtraidos.map((pet) => pet.nome),
  );
  const petsDetalhes = mesclarPetsDetalhes(existente?.petsDetalhes ?? [], petsDetalhesExtraidos);
  const input: ClienteCrmInput = {
    nome:
      extraido.nome ??
      existente?.nome ??
      nomeClienteSeguro(nomeCliente) ??
      `Cliente ${telefoneNormalizado.slice(-4)}`,
    telefone: telefoneNormalizado,
    endereco: extraido.endereco ?? existente?.endereco,
    bairro: extraido.bairro ?? existente?.bairro,
    pets: mesclarNomesPets(existente?.pets ?? [], petsExtraidos),
    petsDetalhes: petsDetalhes.length > 0 ? petsDetalhes : undefined,
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

  return { ok: true, cliente, extraido, comprovantesPix };
}

const CONVERSAS_CACHE_MS = 15_000;
let conversasCache: { expiresAt: number; payload: unknown[] } | null = null;
let conversasRequestInFlight: Promise<unknown[]> | null = null;

async function listarConversasComResumoCache(): Promise<unknown[]> {
  if (conversasCache && conversasCache.expiresAt > Date.now()) return conversasCache.payload;
  if (conversasRequestInFlight) return conversasRequestInFlight;

  conversasRequestInFlight = (async () => {
    const conversas = await listarConversasResumo();

    return conversas.map((conversa) => {
      return {
        ...conversa,
        valor_potencial: 0,
        pedidos_total: 0,
        resumo_financeiro: null,
      };
    });
  })();

  try {
    const payload = await conversasRequestInFlight;
    conversasCache = { expiresAt: Date.now() + CONVERSAS_CACHE_MS, payload };
    return payload;
  } finally {
    conversasRequestInFlight = null;
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

          if (url.searchParams.get("ia") === "config") {
            const [config, aprendizado] = await Promise.all([
              buscarIaPromptConfig(),
              buscarIaAprendizadoResumo(),
            ]);

            return json({ ...config, baseSystemPrompt: BASE_SYSTEM_PROMPT, aprendizado });
          }

          if (url.searchParams.get("kanban") === "config") {
            return json({ columns: await buscarKanbanConfig() });
          }

          if (url.searchParams.get("bloqueados") === "lista") {
            return json(await listarConversasBloqueadas());
          }

          if (url.searchParams.get("financeiro") === "resumo") {
            return json(Object.fromEntries(await resumoFinanceiroPorTelefone()));
          }

          const telefone = normalizarTelefone(url.searchParams.get("telefone") ?? "");
          if (telefone) {
            const conversa = await buscarConversaPorTelefone(telefone);
            return conversa
              ? json(conversa)
              : json({ ok: false, erro: "Conversa nao encontrada" }, { status: 404 });
          }

          const detalheId = url.searchParams.get("detalhe");
          if (detalheId) {
            const conversa = await buscarConversaPorId(detalheId);
            return conversa
              ? json(conversa)
              : json({ ok: false, erro: "Conversa nao encontrada" }, { status: 404 });
          }

          const desde = url.searchParams.get("desde");
          if (desde) {
            const timestamp = new Date(desde);
            if (Number.isNaN(timestamp.getTime())) {
              return json(
                { ok: false, erro: "Timestamp de sincronizacao invalido" },
                { status: 400 },
              );
            }
            return json(await listarConversasAtualizadasDesde(timestamp.toISOString()));
          }

          return json(await listarConversasComResumoCache());
        } catch (error) {
          return apiErrorResponse(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as
            | { tipo: "conversa"; id: string; aguardandoHumano: boolean; iaAtiva?: boolean }
            | { tipo: "pipeline"; id: string; stage: string }
            | { tipo: "pipeline"; id: string; columnId: string }
            | { tipo: "kanban_config"; columns: unknown }
            | { tipo: "global"; desativada: boolean }
            | { tipo: "bloquear"; id: string; bloqueado: boolean }
            | { tipo: "marcar_lida"; id: string; lidoAte?: string }
            | { tipo: "ia_config"; systemPrompt: string; regras: IaRegraCustomizada[] };

          if (body.tipo === "global") {
            return json(await definirIaGlobalDesativada(body.desativada));
          }

          if (body.tipo === "bloquear") {
            const conversaBloqueio = await definirConversaBloqueada({
              id: body.id,
              bloqueado: body.bloqueado,
            });

            // Ao bloquear, tambem tira o contato da pagina Clientes e dos KPIs de
            // leads para nao poluir a operacao com gente fora da area de entrega.
            if (body.bloqueado) {
              await removerLeadDoContatoBloqueado(conversaBloqueio.telefone);
            }

            return json(conversaBloqueio);
          }

          if (body.tipo === "marcar_lida") {
            return json(await marcarConversaLida({ id: body.id, lidoAte: body.lidoAte }));
          }

          if (body.tipo === "ia_config") {
            return json(
              await salvarIaPromptConfig({
                systemPrompt: body.systemPrompt,
                regras: body.regras,
              }),
            );
          }

          if (body.tipo === "kanban_config") {
            return json({ columns: await salvarKanbanConfig(body.columns) });
          }

          if (body.tipo === "pipeline") {
            const columns = await buscarKanbanConfig();
            const requestedColumn =
              "columnId" in body
                ? columns.find((column) => column.id === body.columnId)
                : columns.find((column) => column.nome === body.stage);
            const pipeline = requestedColumn
              ? {
                  estagio: requestedColumn.estagioInterno,
                  aguardandoHumano: requestedColumn.id === "aguardando-pagamento",
                }
              : pipelineFromKanban("stage" in body ? body.stage : undefined);
            if (!pipeline) return json({ ok: false, erro: "Etapa invalida" }, { status: 400 });

            return json(
              await atualizarConversaPipeline({
                id: body.id,
                ...pipeline,
                kanbanColuna: requestedColumn?.id,
              }),
            );
          }

          return json(
            await atualizarConversaAguardandoHumano({
              id: body.id,
              aguardandoHumano: body.aguardandoHumano,
              iaAtiva: typeof body.iaAtiva === "boolean" ? body.iaAtiva : !body.aguardandoHumano,
            }),
          );
        } catch (error) {
          return apiErrorResponse(error);
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
                tipo: "midia_url";
                id: string;
                telefone: string;
                mediaUrl: string;
                legenda?: string;
                nomeArquivo?: string;
                mimeType?: string;
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
            | { tipo: "sugerir_pets_ia"; historico: Conversa["historico"] }
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

          if (body.tipo === "sugerir_pets_ia") {
            const perfil = await extrairPerfilClienteDaConversa(
              Array.isArray(body.historico) ? body.historico : [],
            );

            return json({ pets: petsDetalhesDoPerfil(perfil) });
          }

          if (body.tipo === "sincronizar_whatsapp") {
            return json(
              await sincronizarWhatsapp({
                chatsLimite: body.chatsLimite,
                mensagensLimite: body.mensagensLimite,
              }),
            );
          }

          if (body.tipo === "midia_url") {
            const mediaUrlOriginal = normalizarMediaUrl(body.mediaUrl);
            const legenda = body.legenda?.trim();
            const telefone = normalizarTelefone(body.telefone);

            const midia = await baixarMidiaUrlComoBase64(mediaUrlOriginal);
            const envio = await enviarMidiaBase64(
              `${telefone}@s.whatsapp.net`,
              midia.base64,
              legenda,
              {
                fileName: body.nomeArquivo,
                mimetype: midia.mimeType,
              },
            );

            const mediaUrl = stringFromContent(envio, MEDIA_URL_RESPONSE_KEYS) ?? mediaUrlOriginal;
            const conteudo = legenda
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
                  messageType: midia.mimeType ?? "image",
                  mediaUrl,
                  mimeType: midia.mimeType,
                  fileName: body.nomeArquivo,
                },
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
            const mediaUrl = stringFromContent(envio, MEDIA_URL_RESPONSE_KEYS);

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
          return apiErrorResponse(error);
        }
      },
    },
  },
});
