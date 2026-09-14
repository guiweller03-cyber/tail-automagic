import type { Cliente, RecompraPrevista } from "./crm-types";
import type { Mensagem } from "./openai";
import { mensagemRecompra, nomesPets, telefoneWhatsApp } from "./painel-recompra";
import {
  atualizarFollowupCampos,
  criarFollowup,
  listarFollowups,
  obterFollowup,
  type Followup,
} from "./followups-supabase";
import { enviarFollowupAgora } from "./followups-runner";
import { listarClientes } from "./crm-supabase";
import { listarRecompraPrevista, marcarRecompraContato } from "./recompra-supabase";
import {
  buscarConversaPorTelefone,
  listarConversasResumo,
  listarTelefonesBloqueados,
  type Conversa,
} from "./supabase";

const JANELA_PADRAO_DIAS = 10;
const JANELA_MAXIMA_DIAS = 30;
const OBJETIVO_RECOMPRA = "Recompra aguardando aprovação do operador";
const MOTIVO_CICLO_ADIADO =
  "O ciclo da recompra foi ajustado e a previsão saiu da janela de aviso.";

export type ResultadoAprovacaoRecompra = {
  aprovacao: Followup;
  bloqueadoPor?: string;
  agendada?: boolean;
};

export function ehAprovacaoWhatsappIa(followup: Followup): boolean {
  return followup.contexto.origem === "whatsapp_ia";
}

export function aguardandoDecisao(followup: Followup): boolean {
  if (ehAprovacaoWhatsappIa(followup)) {
    return ["aguardando_confirmacao", "erro"].includes(followup.status);
  }
  return ["pendente", "aguardando_confirmacao", "erro"].includes(followup.status);
}

export function followupWhatsappAutorizado(followup: Followup): boolean {
  return (
    ehAprovacaoWhatsappIa(followup) &&
    followup.status === "pendente" &&
    followup.disparo === "automatico"
  );
}

export function janelaRecompraSegura(value: number): number {
  if (!Number.isFinite(value)) return JANELA_PADRAO_DIAS;
  return Math.max(0, Math.min(JANELA_MAXIMA_DIAS, Math.round(value)));
}

export function recompraElegivelParaAprovacao(
  item: RecompraPrevista,
  janelaDias = JANELA_PADRAO_DIAS,
): boolean {
  return (
    telefoneRecompraValido(item.telefone) &&
    item.contatado !== true &&
    item.diasRestantes <= janelaRecompraSegura(janelaDias)
  );
}

export function telefoneRecompraValido(value: string): boolean {
  const telefone = telefoneWhatsApp(value);
  return telefone.length === 12 || telefone.length === 13;
}

function telefoneComparavel(value: string): string {
  return telefoneWhatsApp(value).slice(-9);
}

export function selecionarContatosRecompraSemPrevisao(
  conversas: Array<
    Pick<
      Conversa,
      | "id"
      | "telefone"
      | "nome_cliente"
      | "historico"
      | "kanban_coluna"
      | "criado_em"
      | "atualizado_em"
    >
  >,
  telefonesComPrevisao: Iterable<string> = [],
  telefonesBloqueados: Iterable<string> = [],
) {
  const comPrevisao = new Set(
    Array.from(telefonesComPrevisao, (telefone) => telefoneComparavel(telefone)),
  );
  const bloqueados = new Set(
    Array.from(telefonesBloqueados, (telefone) => telefoneComparavel(telefone)),
  );
  const vistos = new Set<string>();

  return conversas.filter((conversa) => {
    const telefone = telefoneWhatsApp(conversa.telefone);
    const comparavel = telefoneComparavel(telefone);
    if (
      !telefoneRecompraValido(telefone) ||
      !comparavel ||
      conversa.kanban_coluna !== "recompra" ||
      comPrevisao.has(comparavel) ||
      bloqueados.has(comparavel) ||
      vistos.has(comparavel)
    ) {
      return false;
    }

    vistos.add(comparavel);
    return true;
  });
}

export function clienteTemCadastroCompleto(
  cliente: Pick<Cliente, "endereco" | "bairro" | "pets" | "pedidos"> | undefined,
): boolean {
  return Boolean(
    cliente &&
    (cliente.endereco?.trim() ||
      cliente.bairro?.trim() ||
      cliente.pets.some((pet) => pet.trim()) ||
      cliente.pedidos > 0),
  );
}

function nomeContatoSemCadastro(nome: string | null | undefined, telefone: string): string {
  const valor = nome?.trim() ?? "";
  return /\p{L}/u.test(valor) ? valor : `Contato ${telefone.slice(-4)}`;
}

export function mensagemContatoSemCadastro(nome: string | null | undefined): string {
  const primeiroNome = nome?.trim().split(/\s+/)[0] ?? "";
  const saudacao = /\p{L}/u.test(primeiroNome) ? `Oi, ${primeiroNome}!` : "Oi!";

  return [
    `${saudacao} Tudo bem? Passando para saber se você precisa repor a ração do seu pet.`,
    "Se quiser, me diga qual produto costuma usar que eu verifico e já separo para você.",
  ].join("\n\n");
}

export function agruparRecomprasPorTelefone(
  items: RecompraPrevista[],
  janelaDias = JANELA_PADRAO_DIAS,
): RecompraPrevista[][] {
  const grupos = new Map<string, RecompraPrevista[]>();

  for (const item of items.filter((recompra) =>
    recompraElegivelParaAprovacao(recompra, janelaDias),
  )) {
    const telefone = telefoneWhatsApp(item.telefone);
    const grupo = grupos.get(telefone) ?? [];
    grupo.push(item);
    grupos.set(telefone, grupo);
  }

  return [...grupos.values()]
    .map((grupo) => grupo.sort((a, b) => a.diasRestantes - b.diasRestantes))
    .sort((a, b) => a[0].diasRestantes - b[0].diasRestantes);
}

function juntarComE(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
}

export function mensagemRecompraAgrupada(items: RecompraPrevista[]): string {
  const principal = [...items].sort((a, b) => a.diasRestantes - b.diasRestantes)[0];
  if (!principal) return "";
  if (items.length === 1) return mensagemRecompra(principal);

  const primeiroNome = principal.cliente.trim().split(/\s+/)[0] || "Oi";
  const saudacao = primeiroNome.includes("@") ? "Oi!" : `Oi, ${primeiroNome}!`;
  const pets = Array.from(new Set(items.flatMap(nomesPets))).filter(Boolean);
  const referenciaPet = pets.length > 0 ? `de ${juntarComE(pets)}` : "do seu pet";
  const produtos = Array.from(new Set(items.map((item) => item.racao.trim()).filter(Boolean)));
  const quando =
    principal.diasRestantes < 0
      ? `podem ter acabado há cerca de ${Math.abs(principal.diasRestantes)} ${Math.abs(principal.diasRestantes) === 1 ? "dia" : "dias"}`
      : principal.diasRestantes === 0
        ? "podem acabar hoje"
        : `podem acabar em cerca de ${principal.diasRestantes} ${principal.diasRestantes === 1 ? "dia" : "dias"}`;

  return [
    `${saudacao} Pelas nossas contas, os produtos ${referenciaPet} ${quando}.`,
    `Na última compra você levou ${juntarComE(produtos.slice(0, 3))}.`,
    "Quer que eu já separe novamente para você?",
  ].join("\n\n");
}

function dataMaisRecente(items: RecompraPrevista[]): string {
  return (
    items
      .map((item) => item.ultimaCompraIso ?? "")
      .filter(Boolean)
      .sort()
      .at(-1) ?? ""
  );
}

function idsRecompra(followup: Followup): string[] {
  const ids = followup.contexto.recompraIds?.filter(Boolean) ?? [];
  if (ids.length > 0) return ids;
  return followup.contexto.recompraId ? [followup.contexto.recompraId] : [];
}

function horarioMensagem(mensagem: Mensagem): number {
  const time = mensagem.at ? new Date(mensagem.at).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function mensagemRecebida(mensagem: Mensagem): boolean {
  return mensagem.fromMe === false || (mensagem.fromMe === undefined && mensagem.role === "user");
}

export function houveMensagemDoClienteApos(
  historico: Mensagem[],
  referenciaIso: string,
  conversaAtualizadaEm?: string,
): boolean {
  const referencia = new Date(referenciaIso).getTime();
  if (!Number.isFinite(referencia)) return false;

  if (
    historico.some(
      (mensagem) => mensagemRecebida(mensagem) && horarioMensagem(mensagem) > referencia,
    )
  ) {
    return true;
  }

  const ultima = historico.at(-1);
  const atualizada = conversaAtualizadaEm ? new Date(conversaAtualizadaEm).getTime() : 0;
  return Boolean(
    ultima &&
    mensagemRecebida(ultima) &&
    !horarioMensagem(ultima) &&
    Number.isFinite(atualizada) &&
    atualizada > referencia,
  );
}

/** Cria, no máximo, uma aprovação por cliente e ciclo de compra. */
export async function sincronizarAprovacoesRecompra(janelaDias = JANELA_PADRAO_DIAS): Promise<{
  aprovacoes: Followup[];
  criadas: number;
}> {
  const janela = janelaRecompraSegura(janelaDias);
  const [{ recompras }, existentes, conversas, clientes, telefonesBloqueados] = await Promise.all([
    listarRecompraPrevista(),
    listarFollowups({ origem: "recompra" }),
    listarConversasResumo(),
    listarClientes(),
    listarTelefonesBloqueados(),
  ]);
  const grupos = agruparRecomprasPorTelefone(recompras, janela);
  const contatosSemPrevisao = selecionarContatosRecompraSemPrevisao(
    conversas,
    recompras.map((recompra) => recompra.telefone),
    telefonesBloqueados,
  );
  const contatosSemPrevisaoAtuais = new Set(
    contatosSemPrevisao.map((conversa) => telefoneComparavel(conversa.telefone)),
  );
  const clientesPorTelefone = new Map(
    clientes.map((cliente) => [telefoneComparavel(cliente.telefone), cliente]),
  );
  let criadas = 0;

  for (const followup of existentes) {
    if (
      !telefoneRecompraValido(followup.telefone) &&
      ["pendente", "aguardando_confirmacao", "erro"].includes(followup.status)
    ) {
      await atualizarFollowupCampos(followup.id, {
        status: "cancelado",
        erro: "Telefone inválido; o disparo foi bloqueado antes da aprovação.",
      });
    }
  }

  for (const followup of existentes) {
    if (
      followup.contexto.contatoSemPrevisao === true &&
      ["pendente", "aguardando_confirmacao", "erro"].includes(followup.status) &&
      !contatosSemPrevisaoAtuais.has(telefoneComparavel(followup.telefone))
    ) {
      await atualizarFollowupCampos(followup.id, {
        status: "cancelado",
        erro: "O contato saiu da etapa de recompra ou passou a ter uma previsão cadastrada.",
      });
    }
  }

  // Se o ciclo foi ajustado para mais dias, a mensagem pendente ("acaba em 2
  // dias") ficou errada: tira da fila ate a previsao voltar para a janela.
  const recompraPorId = new Map(recompras.map((item) => [item.id, item]));
  for (const [index, followup] of existentes.entries()) {
    const previsoes = idsRecompra(followup).flatMap((id) => recompraPorId.get(id) ?? []);
    if (
      followup.contexto.objetivo === OBJETIVO_RECOMPRA &&
      ["pendente", "aguardando_confirmacao", "erro"].includes(followup.status) &&
      previsoes.length > 0 &&
      previsoes.every((item) => item.diasRestantes > janela)
    ) {
      existentes[index] = await atualizarFollowupCampos(followup.id, {
        status: "cancelado",
        erro: MOTIVO_CICLO_ADIADO,
      });
    }
  }

  for (const grupo of grupos) {
    const principal = grupo[0];
    const telefone = telefoneWhatsApp(principal.telefone);
    const cicloCompraEm = dataMaisRecente(grupo);
    const existente = existentes.find(
      (followup) =>
        telefoneWhatsApp(followup.telefone) === telefone &&
        followup.contexto.cicloCompraEm === cicloCompraEm,
    );
    const mensagemGerada = mensagemRecompraAgrupada(grupo);
    const contexto = {
      nome: principal.cliente,
      pet: Array.from(new Set(grupo.flatMap(nomesPets))).join(", ") || "Seu pet",
      objetivo: OBJETIVO_RECOMPRA,
      resumo: `${grupo.length} previsão(ões) no ciclo atual`,
      origem: "recompra" as const,
      recompraId: principal.id,
      recompraIds: grupo.map((item) => item.id),
      cicloCompraEm,
      produto: Array.from(new Set(grupo.map((item) => item.racao))).join(" | "),
      dataPrevista: principal.dataPrevistaIso ?? principal.dataPrevista,
      diasRestantes: String(principal.diasRestantes),
      mensagemGerada,
    };

    if (existente) {
      const reativar = existente.status === "cancelado" && existente.erro === MOTIVO_CICLO_ADIADO;
      if (
        (reativar || ["pendente", "aguardando_confirmacao", "erro"].includes(existente.status)) &&
        existente.contexto.objetivo === OBJETIVO_RECOMPRA
      ) {
        const atualizada = await atualizarFollowupCampos(existente.id, {
          mensagem: mensagemGerada,
          contexto,
          ...(reativar ? { status: "aguardando_confirmacao" as const, erro: null } : {}),
        });
        const index = existentes.findIndex((item) => item.id === existente.id);
        existentes[index] = atualizada;
      }
      continue;
    }

    try {
      const criada = await criarFollowup(
        {
          telefone,
          clienteNome: principal.cliente,
          agendadoPara: new Date().toISOString(),
          modo: "manual",
          disparo: "confirmar",
          mensagem: mensagemGerada,
          contexto,
          canal: "WhatsApp",
        },
        "aguardando_confirmacao",
      );
      existentes.push(criada);
      criadas += 1;
    } catch (error) {
      // O indice unico pode vencer uma corrida entre duas abas. Nesse caso a
      // outra requisicao ja criou exatamente a aprovacao desejada.
      const message = error instanceof Error ? error.message : String(error);
      if (!/23505|duplicate key|recompra_ciclo_unico/i.test(message)) throw error;
    }
  }

  for (const conversa of contatosSemPrevisao) {
    const telefone = telefoneWhatsApp(conversa.telefone);
    const cicloContato = `contato:${conversa.id}`;
    const existente = existentes.find(
      (followup) =>
        telefoneComparavel(followup.telefone) === telefoneComparavel(telefone) &&
        followup.contexto.cicloCompraEm === cicloContato,
    );
    if (existente) continue;

    const clienteNome = nomeContatoSemCadastro(conversa.nome_cliente, telefone);
    const mensagemGerada = mensagemContatoSemCadastro(conversa.nome_cliente);
    const ultimaMensagem = conversa.historico.at(-1)?.content?.trim().slice(0, 240);
    const cliente = clientesPorTelefone.get(telefoneComparavel(telefone));
    const contatoSemCadastro = !clienteTemCadastroCompleto(cliente);
    const contexto = {
      nome: clienteNome,
      objetivo: "Contato sem previsão aguardando aprovação do operador",
      resumo: contatoSemCadastro
        ? "Contato do WhatsApp ainda sem cadastro completo no CRM"
        : "Contato na etapa de recompra ainda sem previsão cadastrada",
      origem: "recompra" as const,
      cicloCompraEm: cicloContato,
      contatoSemCadastro,
      contatoSemPrevisao: true,
      conversaId: conversa.id,
      ultimaInteracao: conversa.atualizado_em,
      ultimaMensagem,
      mensagemGerada,
    };

    try {
      const criada = await criarFollowup(
        {
          telefone,
          clienteNome,
          agendadoPara: new Date().toISOString(),
          modo: "manual",
          disparo: "confirmar",
          mensagem: mensagemGerada,
          contexto,
          canal: "WhatsApp",
        },
        "aguardando_confirmacao",
      );
      existentes.push(criada);
      criadas += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/23505|duplicate key|recompra_ciclo_unico/i.test(message)) throw error;
    }
  }

  const [aprovacoesRecompra, aprovacoesWhatsappIa] = await Promise.all([
    listarFollowups({ origem: "recompra" }),
    listarFollowups({ origem: "whatsapp_ia" }),
  ]);
  const aprovacoes = [...aprovacoesRecompra, ...aprovacoesWhatsappIa].sort((a, b) =>
    a.agendadoPara.localeCompare(b.agendadoPara),
  );
  return { aprovacoes, criadas };
}

export async function motivoBloqueioAprovacaoRecompra(followup: Followup): Promise<string | null> {
  if (followup.contexto.origem !== "recompra") return null;

  const conversa = await buscarConversaPorTelefone(telefoneWhatsApp(followup.telefone));
  if (
    conversa &&
    houveMensagemDoClienteApos(conversa.historico ?? [], followup.criadoEm, conversa.atualizado_em)
  ) {
    return "O cliente enviou uma mensagem depois que esta aprovação entrou na fila.";
  }

  const ids = new Set(idsRecompra(followup));
  const cicloOriginal = followup.contexto.cicloCompraEm ?? "";
  const { recompras } = await listarRecompraPrevista();
  const atuais = recompras.filter((item) => ids.has(item.id));

  if (ids.size > 0 && atuais.length === 0) {
    return "A previsão antiga não está mais ativa; provavelmente houve uma nova compra.";
  }
  if (atuais.some((item) => item.contatado === true)) {
    return "Este cliente já foi marcado como contatado neste ciclo.";
  }
  if (cicloOriginal && atuais.some((item) => (item.ultimaCompraIso ?? "") > cicloOriginal)) {
    return "Existe uma compra mais nova que a usada para gerar esta mensagem.";
  }

  return null;
}

export async function enviarAprovacaoRecompra(
  id: string,
  mensagem?: string,
): Promise<ResultadoAprovacaoRecompra> {
  let followup = await obterFollowup(id);
  if (
    !followup ||
    (followup.contexto.origem !== "recompra" && followup.contexto.origem !== "whatsapp_ia")
  ) {
    throw new Error("Aprovação não encontrada");
  }

  if (followup.status === "cancelado") throw new Error("Esta mensagem já foi cancelada");
  if (followup.status === "enviado") return { aprovacao: followup };

  if (typeof mensagem === "string") {
    const texto = mensagem.trim();
    if (!texto) throw new Error("A mensagem não pode ficar vazia");
    followup = await atualizarFollowupCampos(id, { mensagem: texto });
  }

  if (ehAprovacaoWhatsappIa(followup)) {
    if (!followup.mensagem.trim()) throw new Error("A mensagem não pode ficar vazia");
    if (followupWhatsappAutorizado(followup)) {
      return { aprovacao: followup, agendada: true };
    }

    const aprovada = await atualizarFollowupCampos(id, {
      status: "pendente",
      disparo: "automatico",
      erro: null,
      contexto: {
        ...followup.contexto,
        aprovadoEm: new Date().toISOString(),
      },
    });
    return { aprovacao: aprovada, agendada: true };
  }

  const bloqueadoPor = await motivoBloqueioAprovacaoRecompra(followup);
  if (bloqueadoPor) {
    const cancelada = await atualizarFollowupCampos(id, {
      status: "cancelado",
      erro: bloqueadoPor,
    });
    return { aprovacao: cancelada, bloqueadoPor };
  }

  const enviada = await enviarFollowupAgora(id);
  await Promise.allSettled(
    idsRecompra(enviada).map((recompraId) => marcarRecompraContato(recompraId, true)),
  );
  return { aprovacao: enviada };
}

export async function cancelarAprovacaoRecompra(id: string): Promise<Followup> {
  const followup = await obterFollowup(id);
  if (
    !followup ||
    (followup.contexto.origem !== "recompra" && followup.contexto.origem !== "whatsapp_ia")
  ) {
    throw new Error("Aprovação não encontrada");
  }
  return atualizarFollowupCampos(id, { status: "cancelado", erro: null });
}
