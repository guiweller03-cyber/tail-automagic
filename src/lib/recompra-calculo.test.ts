import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDiasRecompraRacao,
  cicloEfetivoRecompra,
  classificarFaseRacao,
  classificarLinhaRacao,
  consumoDiarioPetRacao,
  ehRacaoParaRecompra,
  inferirPesoRacaoKg,
  listarRacasPesoBase,
  normalizarCicloManual,
  pesoAtualKg,
  pesoMedioPorRaca,
  pesoPadraoPorPorte,
} from "./recompra-calculo.ts";

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
  assert.equal(consumo.consumoDiaG, 576);
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
  assert.equal(consumo.consumoDiaG, 122);
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
  assert.equal(consumo.consumoDiaG, 42);
});

test("usa media exata informada por kg para Formula Natural Pro filhote mini", () => {
  const consumo = consumoDiarioPetRacao({
    produto: { nome: "Formula Natural Pro Filhotes Mini 3 kg" },
    pet: { nome: "Nina", especie: "cachorro", porte: "pequeno", pesoKg: 2 },
    especiePadrao: "cachorro",
    portePadrao: "medio",
  });

  assert.equal(consumo.consumoDiaG, 40);
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

  assert.equal(senior.consumoDiaG, 390);
  assert.equal(castrado.consumoDiaG, 52);
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
  assert.equal(consumo.consumoDiaG, 412);
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
  assert.equal(consumo.consumoDiaG, 128);
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
  assert.equal(calcularDiasRecompraRacao(0, 420), 30);
  assert.equal(calcularDiasRecompraRacao(15, 0), 30);
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
