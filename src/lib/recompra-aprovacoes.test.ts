import assert from "node:assert/strict";
import test from "node:test";
import type { RecompraPrevista } from "./crm-types";
import type { Followup } from "./followups-supabase";
import {
  aguardandoDecisao,
  agruparRecomprasPorTelefone,
  followupWhatsappAutorizado,
  clienteTemCadastroCompleto,
  houveMensagemDoClienteApos,
  mensagemContatoSemCadastro,
  mensagemRecompraAgrupada,
  recompraElegivelParaAprovacao,
  selecionarContatosRecompraSemPrevisao,
  telefoneRecompraValido,
} from "./recompra-aprovacoes";

function followupWhatsapp(patch: Partial<Followup> = {}): Followup {
  return {
    id: "f1",
    telefone: "5511999990000",
    clienteNome: "Ana Souza",
    agendadoPara: "2026-09-15T12:00:00.000Z",
    modo: "manual",
    disparo: "confirmar",
    mensagem: "Oi, Ana! Tudo bem?",
    contexto: { origem: "whatsapp_ia" },
    canal: "WhatsApp",
    status: "aguardando_confirmacao",
    criadoEm: "2026-09-14T12:00:00.000Z",
    atualizadoEm: "2026-09-14T12:00:00.000Z",
    ...patch,
  };
}

function recompra(patch: Partial<RecompraPrevista> = {}): RecompraPrevista {
  return {
    id: "r1",
    clienteId: "c1",
    cliente: "Ana Souza",
    telefone: "(11) 99999-0000",
    cidade: "São Paulo",
    bairro: "Centro",
    pet: "Luna",
    especie: "cachorro",
    perfil: "Premium",
    sku: "RAC-01",
    racao: "Ração Teste 10 kg",
    quantidade: 1,
    pesoKg: 10,
    consumoDiaKg: 0.2,
    ultimaCompra: "01/09/2026",
    ultimaCompraIso: "2026-09-01",
    diasRestantes: 5,
    dataPrevista: "19/09/2026",
    dataPrevistaIso: "2026-09-19",
    valorEstimado: 150,
    status: "semana",
    mediaRecompra: 30,
    previsaoBase: 30,
    comportamento: "pontual",
    precisaoIA: 65,
    tendencia: "estavel",
    historicoDias: [],
    ...patch,
  };
}

test("seleciona somente recompras dentro da janela e ainda nao contatadas", () => {
  assert.equal(recompraElegivelParaAprovacao(recompra({ diasRestantes: 10 }), 10), true);
  assert.equal(recompraElegivelParaAprovacao(recompra({ diasRestantes: 11 }), 10), false);
  assert.equal(recompraElegivelParaAprovacao(recompra({ contatado: true }), 10), false);
  assert.equal(telefoneRecompraValido("551787094706084"), false);
});

test("usa texto neutro quando nome do cliente ou do pet nao serve para a mensagem", () => {
  const mensagem = mensagemRecompraAgrupada([
    recompra({ cliente: "cliente@example.com", pet: "1", diasRestantes: 1 }),
  ]);
  assert.match(mensagem, /^Oi!/);
  assert.match(mensagem, /do seu pet/);
  assert.match(mensagem, /1 dia\b/);
  assert.doesNotMatch(mensagem, /1 dias/);

  const petGenerico = mensagemRecompraAgrupada([recompra({ pet: "Pet" })]);
  assert.match(petGenerico, /do seu pet/);
});

test("agrupa previsoes do mesmo telefone em uma unica aprovacao", () => {
  const grupos = agruparRecomprasPorTelefone([
    recompra(),
    recompra({ id: "r2", sku: "RAC-02", telefone: "5511999990000", pet: "Thor" }),
  ]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].length, 2);
  assert.match(mensagemRecompraAgrupada(grupos[0]), /Luna e Thor/);
});

test("detecta somente mensagem recebida depois da entrada na fila", () => {
  const referencia = "2026-09-14T12:00:00.000Z";
  assert.equal(
    houveMensagemDoClienteApos(
      [{ role: "user", content: "Ainda tenho ração", at: "2026-09-14T12:01:00.000Z" }],
      referencia,
    ),
    true,
  );
  assert.equal(
    houveMensagemDoClienteApos(
      [{ role: "assistant", content: "Oi", at: "2026-09-14T12:01:00.000Z" }],
      referencia,
    ),
    false,
  );
  assert.equal(
    houveMensagemDoClienteApos(
      [{ role: "user", content: "Mensagem antiga", at: "2026-09-14T11:59:00.000Z" }],
      referencia,
    ),
    false,
  );
});

test("follow-up do WhatsApp aguarda decisao antes de voltar para a agenda", () => {
  const aguardando = followupWhatsapp();
  assert.equal(aguardandoDecisao(aguardando), true);
  assert.equal(followupWhatsappAutorizado(aguardando), false);

  const autorizado = followupWhatsapp({ status: "pendente", disparo: "automatico" });
  assert.equal(aguardandoDecisao(autorizado), false);
  assert.equal(followupWhatsappAutorizado(autorizado), true);
});

test("inclui contatos na etapa de recompra sem previsao e ignora os demais", () => {
  const conversa = (id: string, telefone: string, kanban_coluna = "recompra") => ({
    id,
    telefone,
    nome_cliente: "Ana",
    historico: [],
    kanban_coluna,
    criado_em: "2026-09-14T10:00:00.000Z",
    atualizado_em: "2026-09-14T11:00:00.000Z",
  });
  const selecionados = selecionarContatosRecompraSemPrevisao(
    [
      conversa("nova", "5511999990000"),
      conversa("duplicada", "11999990000"),
      conversa("com-previsao", "5511888880000"),
      conversa("bloqueada", "5511777770000"),
      conversa("outra-etapa", "5511666660000", "hoje"),
      conversa("invalida", "123"),
    ],
    ["11888880000"],
    ["5511777770000"],
  );

  assert.deepEqual(
    selecionados.map((item) => item.id),
    ["nova"],
  );
});

test("distingue cadastro basico criado pelo WhatsApp de cadastro completo", () => {
  assert.equal(
    clienteTemCadastroCompleto({ endereco: "", bairro: "", pets: [], pedidos: 0 }),
    false,
  );
  assert.equal(
    clienteTemCadastroCompleto({ endereco: "", bairro: "Centro", pets: [], pedidos: 0 }),
    true,
  );
  assert.equal(
    clienteTemCadastroCompleto({ endereco: "", bairro: "", pets: ["Luna"], pedidos: 0 }),
    true,
  );
});

test("gera mensagem neutra para contato ainda sem dados de recompra", () => {
  assert.match(mensagemContatoSemCadastro("Ana Souza"), /^Oi, Ana!/);
  assert.match(mensagemContatoSemCadastro(null), /^Oi!/);
  assert.match(mensagemContatoSemCadastro(null), /qual produto costuma usar/);
});
