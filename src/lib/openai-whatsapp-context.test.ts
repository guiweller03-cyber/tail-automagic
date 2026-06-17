import assert from "node:assert/strict";
import test from "node:test";
import { respostaAutomaticaWhatsappPorContexto, type Mensagem } from "./openai.ts";

const historicoComPreco: Mensagem[] = [
  {
    role: "user",
    content: "Qual a racao que vc teria disponivel p caes de grande porte",
  },
  {
    role: "assistant",
    content:
      'Temos a racao "Formula Natural Life Adulto Porte Medio e Grande" de 15 kg por R$264,90 e tambem a "Formula Natural Life Filhote Porte Medio e Grande" de 15 kg por R$269,90. Alguma delas te interessa?',
  },
];

test("pergunta curta de preco continua no pre-atendimento sem informar valor", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("E o preco", historicoComPreco);

  assert.match(resposta ?? "", /adulto ou filhote/i);
  assert.doesNotMatch(resposta ?? "", /R\$/);
  assert.doesNotMatch(resposta ?? "", /\[HANDOFF\]/);
  assert.doesNotMatch(resposta ?? "", /Bom dia|Guilherme/i);
});

test("pedido comercial com pre-atendimento completo aguarda humano", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("Qual o valor?", [
    {
      role: "user",
      content:
        "E para cachorro adulto de porte grande. Ele tem 5 anos. Procuro racao Golden. Estou no Centro.",
    },
  ]);

  assert.match(resposta ?? "", /atendente da equipe continua/i);
  assert.match(resposta ?? "", /\[HANDOFF\]/);
  assert.doesNotMatch(resposta ?? "", /R\$/);
});

test("nao recomenda racoes mesmo quando existem produtos relevantes", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto(
    "Quero uma racao para gato adulto castrado, ele tem 4 anos e estou no Centro",
    [],
    [
      { nome: "Golden Gatos Castrados Frango 1kg" },
      { nome: "Premier Gatos Castrados Salmao 1,5kg" },
      { nome: "Formula Natural Gatos Castrados 1kg" },
      { nome: "Quarta opcao nao deve aparecer" },
    ],
  );

  assert.match(resposta ?? "", /atendente da equipe continua/i);
  assert.match(resposta ?? "", /\[HANDOFF\]/);
  assert.match(resposta ?? "", /\[DADOS_OBSERVADOS/);
  assert.doesNotMatch(resposta ?? "", /Golden Gatos Castrados/);
  assert.doesNotMatch(resposta ?? "", /Premier Gatos Castrados/);
  assert.doesNotMatch(resposta ?? "", /Formula Natural Gatos Castrados/);
  assert.doesNotMatch(resposta ?? "", /Quarta opcao/);
  assert.doesNotMatch(resposta ?? "", /R\$/);
});

test("avanca para castracao ou fase quando cliente ja informou gato e marca", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("Boa noite, quero Golden para gato", []);

  assert.match(resposta ?? "", /gato adulto, filhote ou castrado/i);
  assert.match(resposta ?? "", /\[DADOS_OBSERVADOS/);
  assert.match(resposta ?? "", /especie="gato"/);
  assert.match(resposta ?? "", /racao="golden"/);
});

test("avanca para fase quando cliente ja informou cachorro e porte", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("Quero racao para cachorro grande", []);

  assert.match(resposta ?? "", /cachorro adulto ou filhote/i);
  assert.match(resposta ?? "", /especie="cachorro"/);
  assert.match(resposta ?? "", /porte="grande"/);
});

test("pedido de areia pergunta preferencia antes de entrevista de pet", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("Quero areia", []);

  assert.match(resposta ?? "", /preferencia.*areia/i);
  assert.match(resposta ?? "", /silica/i);
  assert.match(resposta ?? "", /biodegradavel/i);
  assert.match(resposta ?? "", /produto="areia"/);
});

test("fora do horario comercial orienta aguardar proximo horario", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto(
    "Qual o valor?",
    [
      {
        role: "user",
        content: "E para gato adulto castrado, ele tem 3 anos. Quero Golden e estou no Centro.",
      },
    ],
    [],
    { horarioComercial: false },
  );

  assert.match(resposta ?? "", /proximo horario comercial/i);
  assert.match(resposta ?? "", /\[HANDOFF\]/);
});

test("encerra agradecimento curto sem reiniciar atendimento", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto("Ok obrigado", historicoComPreco);

  assert.equal(resposta, "Por nada! Qualquer coisa me chama.");
});

test("frustracao do cliente segue no automatico sem handoff", () => {
  const resposta = respostaAutomaticaWhatsappPorContexto(
    "Meu Deus mas ai fica dificil ne",
    historicoComPreco,
  );

  assert.equal(resposta, null);
});
