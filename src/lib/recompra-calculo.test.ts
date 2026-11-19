import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularCicloPorHistorico,
  calcularDiasRecompraRacao,
  cicloEfetivoRecompra,
  classificarFaseRacao,
  classificarLinhaRacao,
  consumoDiarioPetRacao,
  dataBaseRecompra,
  ehRacaoParaRecompra,
  filtrarPetsPorEspecieProduto,
  inferirPesoRacaoKg,
  listarRacasPesoBase,
  normalizarCicloManual,
  normalizarDataCompraRecompra,
  normalizarPorteRacao,
  pesoAtualKg,
  pesoMedioPorRaca,
  pesoPadraoPorPorte,
  portePadraoProdutoRecompra,
  skuRacaoAvulsa,
} from "./recompra-calculo.ts";

test("gera SKU estavel para racao vendida fora do catalogo", () => {
  assert.equal(
    skuRacaoAvulsa("Ração Outra Marca Adulto 15 kg"),
    "AVULSA-RACAO-OUTRA-MARCA-ADULTO-15-KG",
  );
  assert.equal(skuRacaoAvulsa("  "), "");
});

test("valida data de compra sem deslocar o dia pelo fuso", () => {
  assert.equal(normalizarDataCompraRecompra("2026-09-30"), "2026-09-30");
  assert.throws(() => normalizarDataCompraRecompra("2026-02-30"));
  assert.throws(() => normalizarDataCompraRecompra("30/09/2026"));
});

test("usa a data real da venda antes da data de faturamento", () => {
  assert.equal(
    dataBaseRecompra({
      criadoEm: "2026-09-01T15:00:00.000Z",
      faturadoEm: "2026-09-18T15:00:00.000Z",
    }),
    "2026-09-01T15:00:00.000Z",
  );
  assert.equal(
    dataBaseRecompra({ criadoEm: null, faturadoEm: "2026-09-18T15:00:00.000Z" }),
    "2026-09-18T15:00:00.000Z",
  );
});

test("ajuste manual do ciclo vence o calculo automatico", () => {
  assert.equal(cicloEfetivoRecompra(36, 45), 45);
  assert.equal(cicloEfetivoRecompra(36, null), 36);
  assert.equal(cicloEfetivoRecompra(36.4), 36);
});

test("valida o ciclo manual digitado pelo operador", () => {
  assert.equal(normalizarCicloManual("40"), 40);
  assert.equal(normalizarCicloManual(""), null);
  assert.equal(normalizarCicloManual(null), null);
  assert.throws(() => normalizarCicloManual(0));
  assert.throws(() => normalizarCicloManual(400));
  assert.throws(() => normalizarCicloManual("abc"));
});

const produtoFreshAdulto = {
  nome: "Formula Natural Fresh Meat Adulto Mini e Pequeno 7 kg",
  detalhes_tecnicos: {
    linha: "Fresh Meat Adulto Mini e Pequeno",
    porte: "Mini e Pequeno",
    idade: "Adulto",
  },
};

const produtoLifeFilhote = {
  nome: "Formula Natural Life Filhote Porte Medio e Grande 15 kg",
  detalhes_tecnicos: {
    linha: "Life Filhote Porte Medio e Grande",
    porte: "Medio/Grande",
    idade: "Filhote",
  },
};

test("classifica linha e fase pela tag tecnica ou nome da racao", () => {
  assert.equal(classificarLinhaRacao(produtoFreshAdulto), "fresh_meat");
  assert.equal(classificarFaseRacao(produtoFreshAdulto), "adulto");
  assert.equal(classificarLinhaRacao(produtoLifeFilhote), "pro_life");
  assert.equal(classificarFaseRacao(produtoLifeFilhote), "filhote");
});

test("nao trata snack de marca de racao como pacote de consumo diario", () => {
  assert.equal(
    ehRacaoParaRecompra({ nome: "Snack Formula Natural Pelo & Pelagem Mini e Pequeno" }),
    false,
  );
  assert.equal(ehRacaoParaRecompra(produtoFreshAdulto), true);
});

test("usa peso real do pet quando cadastrado", () => {
  const consumo = consumoDiarioPetRacao({
    produto: produtoLifeFilhote,
    pet: { nome: "Thor", especie: "cachorro", porte: "grande", pesoKg: 32 },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.pesoInformado, true);
  assert.equal(consumo.pesoKg, 32);
  assert.equal(consumo.consumoDiaG, 511);
});

test("usa media do porte quando o pet nao tem peso cadastrado", () => {
  const consumo = consumoDiarioPetRacao({
    produto: produtoFreshAdulto,
    pet: { nome: "Mel", especie: "cachorro", porte: "pequeno" },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.pesoInformado, false);
  assert.equal(consumo.pesoKg, pesoPadraoPorPorte("pequeno"));
  assert.equal(consumo.consumoDiaG, 134);
});

test("gato sem peso usa peso medio de gato", () => {
  const consumo = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Fresh Meat Gato Castrado Salmao 7 kg" },
    pet: { nome: "Lua", especie: "gato" },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.pesoKg, 3.5);
  assert.equal(consumo.porte, "pequeno");
  assert.equal(consumo.consumoDiaG, 44);
});

test("usa media exata informada por kg para Formula Natural Pro filhote mini", () => {
  const consumo = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Pro Filhotes Mini 3 kg" },
    pet: { nome: "Nina", especie: "cachorro", porte: "pequeno", pesoKg: 2 },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.consumoDiaG, 64);
});

test("diferencia senior e castrado nas linhas Formula Natural", () => {
  const senior = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Life Senior Grande 15 kg" },
    pet: { nome: "Bob", especie: "cachorro", porte: "grande", pesoKg: 30 },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });
  const castrado = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Life Gato Castrado 7 kg" },
    pet: { nome: "Mia", especie: "gato", pesoKg: 4 },
    especiePadrao: "gato",
    portePadrao: "pequeno",
  });

  assert.equal(senior.consumoDiaG, 346);
  assert.equal(castrado.consumoDiaG, 51);
});

test("usa peso medio da raca quando o tutor nao sabe o peso", () => {
  const consumo = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Life Adulto Medio e Grande 15 kg" },
    pet: { nome: "Sol", especie: "cachorro", raca: "Golden Retriever" },
    especiePadrao: "cachorro",
    portePadrao: "pequeno",
  });

  assert.deepEqual(pesoMedioPorRaca("cachorro", "Golden Retriever"), {
    pesoKg: 29.45,
    porte: "grande",
  });
  assert.equal(consumo.pesoInformado, false);
  assert.equal(consumo.pesoOrigem, "raca");
  assert.equal(consumo.pesoKg, 29.45);
  assert.equal(consumo.porte, "grande");
  assert.equal(consumo.consumoDiaG, 379);
});

test("peso real informado tem prioridade sobre a media da raca", () => {
  const consumo = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Life Adulto Mini 7 kg" },
    pet: { nome: "Theo", especie: "cachorro", raca: "Shih Tzu", pesoKg: 8 },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.pesoInformado, true);
  assert.equal(consumo.pesoOrigem, "informado");
  assert.equal(consumo.pesoKg, 8);
  assert.equal(consumo.porte, "pequeno");
  assert.equal(consumo.consumoDiaG, 143);
});

test("prioriza raca especifica antes de alias generico", () => {
  assert.deepEqual(pesoMedioPorRaca("cachorro", "Poodle Grande"), {
    pesoKg: 22,
    porte: "medio",
  });
  assert.deepEqual(pesoMedioPorRaca("cachorro", "Poodle"), {
    pesoKg: 12,
    porte: "medio",
  });
});

test("lista racas com peso base para cadastro do pet", () => {
  const racas = listarRacasPesoBase();
  const golden = racas.find((raca) => raca.nome === "Golden Retriever");

  assert.ok(golden);
  assert.equal(golden.especie, "cachorro");
  assert.equal(golden.pesoKg, 29.45);
  assert.equal(golden.porte, "grande");

  const pastorBelga = racas.find((raca) => raca.nome === "Pastor Belga");

  assert.ok(pastorBelga);
  assert.equal(pastorBelga.especie, "cachorro");
  assert.equal(pastorBelga.pesoKg, 25);
  assert.equal(pastorBelga.porte, "grande");
});

test("calcula peso dinamico de filhote por raca e idade", () => {
  const peso = pesoAtualKg(
    {
      especie: "cachorro",
      raca: "Labrador Retriever",
      dataNascimentoEstimada: "2026-02-01",
    },
    "2026-08-01T12:00:00.000Z",
  );

  assert.equal(peso.origem, "crescimento");
  assert.equal(peso.porte, "grande");
  assert.equal(peso.pesoKg, 21.12);
});

test("peso medido recente sobrescreve a curva do filhote", () => {
  const consumo = consumoDiarioPetRacao({
    produto: produtoLifeFilhote,
    pet: {
      nome: "Kyra",
      especie: "cachorro",
      raca: "Pastor Alemao",
      pesoKg: 25,
      pesoKgMedidoEm: "2026-07-20",
      dataNascimentoEstimada: "2026-02-01",
    },
    especiePadrao: "cachorro",
    portePadrao: "medio",
    hoje: "2026-08-01T12:00:00.000Z",
  });

  assert.equal(consumo.pesoOrigem, "medido");
  assert.equal(consumo.pesoKg, 25);
});

test("extrai kg da racao por detalhes tecnicos ou nome e multiplica pela quantidade", () => {
  assert.equal(
    inferirPesoRacaoKg(
      { nome: "Formula Natural Life Adulto", detalhesTecnicos: { peso: "15 kg" } },
      2,
    ),
    30,
  );
  assert.equal(Number(inferirPesoRacaoKg({ nome: "Sachê Gato 85g" }, 10).toFixed(2)), 0.85);
});

test("calcula dias de recompra por kg da embalagem e consumo diario", () => {
  assert.equal(calcularDiasRecompraRacao(15, 420), 36);
  assert.equal(calcularDiasRecompraRacao(0, 420), 0);
  assert.equal(calcularDiasRecompraRacao(15, 0), 0);
});

test("recompra fica mais proxima quando a racao e cadastrada para dois cachorros", () => {
  const produto = {
    nome: "Formula Natural Fresh Meat Adulto Mini e Pequeno 7 kg",
    detalhes_tecnicos: { linha: "Fresh Meat Adulto Mini e Pequeno", peso: "7 kg" },
  };
  const luna = consumoDiarioPetRacao({
    produto,
    pet: { nome: "Luna", especie: "cachorro", porte: "pequeno" },
    especiePadrao: "cachorro",
    portePadrao: "pequeno",
  });
  const thor = consumoDiarioPetRacao({
    produto,
    pet: { nome: "Thor", especie: "cachorro", porte: "pequeno" },
    especiePadrao: "cachorro",
    portePadrao: "pequeno",
  });

  const diasUmCachorro = calcularDiasRecompraRacao(7, luna.consumoDiaG);
  const diasDoisCachorros = calcularDiasRecompraRacao(7, luna.consumoDiaG + thor.consumoDiaG);

  assert.ok(diasDoisCachorros < diasUmCachorro);
  assert.equal(diasDoisCachorros, Math.round(diasUmCachorro / 2));
});

test("historico: primeira compra nao tem ciclo real (usa metricas)", () => {
  assert.equal(calcularCicloPorHistorico([{ data: "2026-09-10", pesoKg: 15 }]), null);
});

test("historico: comprou dia 10 e dia 20, recompra em ~10 dias", () => {
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-09-10", pesoKg: 15 },
    { data: "2026-09-20", pesoKg: 15 },
  ]);
  assert.equal(ciclo?.dias, 10);
  assert.deepEqual(ciclo?.intervalos, [10]);
  assert.equal(ciclo?.consumoRealG, 1500);
});

test("historico: ciclo é a média de dias entre compras, sem escalar por kg", () => {
  // Comprou de 30 em 30 dias: a próxima é em 30, mesmo levando 30 kg agora.
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-08-01", pesoKg: 15 },
    { data: "2026-08-31", pesoKg: 30 },
  ]);
  assert.equal(ciclo?.dias, 30);
});

test("historico: compras com ate 3 dias de diferenca contam como uma", () => {
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-08-01", pesoKg: 10 },
    { data: "2026-08-03", pesoKg: 5 },
    { data: "2026-08-31", pesoKg: 15 },
  ]);
  assert.deepEqual(ciclo?.intervalos, [30]);
  assert.equal(ciclo?.dias, 30);
});

test("historico: pacote extra logo apos a compra conta como a mesma compra", () => {
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-08-01", pesoKg: 15 },
    { data: "2026-08-31", pesoKg: 15 },
    { data: "2026-09-02", pesoKg: 15 },
  ]);
  assert.deepEqual(ciclo?.intervalos, [30]);
  assert.equal(ciclo?.dias, 30);
});

test("historico: media simples de todos os intervalos entre compras", () => {
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-03-01", pesoKg: 15 },
    { data: "2026-03-31", pesoKg: 15 },
    { data: "2026-06-29", pesoKg: 15 },
    { data: "2026-07-29", pesoKg: 15 },
    { data: "2026-08-28", pesoKg: 15 },
  ]);
  // (30 + 30 + 90 + 30) / 4 = 45
  assert.deepEqual(ciclo?.intervalos, [30, 30, 90, 30]);
  assert.equal(ciclo?.dias, 45);
});

test("historico: sem peso usa media dos dias", () => {
  const ciclo = calcularCicloPorHistorico([
    { data: "2026-08-01", pesoKg: 0 },
    { data: "2026-08-21", pesoKg: 0 },
    { data: "2026-09-12", pesoKg: 0 },
  ]);
  // (22*2 + 20*1) / 3 = 21,3
  assert.equal(ciclo?.dias, 21);
});

test("ração de cachorro sem pet na venda não soma o gato do cliente", () => {
  const pets = filtrarPetsPorEspecieProduto(
    [
      { nome: "Mel", especie: "cachorro" as const },
      { nome: "Mingau", especie: "gato" as const },
    ],
    { nome: "Golden Formula Cães Adultos Mini Bits 2kg" },
  );
  assert.deepEqual(
    pets.map((pet) => pet.nome),
    ["Mel"],
  );
});

test("produto 'Mini Bits' indica porte pequeno e porte abreviado é aceito", () => {
  assert.equal(
    portePadraoProdutoRecompra({ nome: "Bob Dog Frango e Arroz Mini Bits 1KG" }),
    "pequeno",
  );
  assert.equal(normalizarPorteRacao("cachorro", "P"), "pequeno");
  assert.equal(normalizarPorteRacao("cachorro", "G"), "grande");
});
