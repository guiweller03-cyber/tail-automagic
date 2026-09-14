import assert from "node:assert/strict";
import test from "node:test";
import type { RecompraPrevista } from "@/lib/crm-types";
import {
  explicacaoCiclo,
  mensagemRecompra,
  nomesPets,
  previsaoPorMes,
  situacaoPainel,
} from "@/lib/painel-recompra";

function recompra(patch: Partial<RecompraPrevista> = {}): RecompraPrevista {
  return {
    id: "r1",
    clienteId: "c1",
    cliente: "Ana Silva",
    telefone: "31999999999",
    cidade: "Belo Horizonte",
    bairro: "Centro",
    pet: "Luna, Thor",
    especie: "cachorro",
    perfil: "Premium",
    sku: "RACAO-1",
    racao: "Ração Teste 10 kg",
    quantidade: 1,
    pesoKg: 10,
    consumoDiaKg: 0.2,
    ultimaCompra: "01/08",
    ultimaCompraIso: "2026-08-01",
    diasRestantes: 2,
    dataPrevista: "07/09",
    dataPrevistaIso: "2026-09-07",
    valorEstimado: 159.9,
    status: "urgente",
    mediaRecompra: 30,
    previsaoBase: 30,
    comportamento: "pontual",
    precisaoIA: 80,
    tendencia: "estavel",
    historicoDias: [],
    ...patch,
  };
}

test("classifica a fila pela quantidade real de dias restantes", () => {
  assert.equal(situacaoPainel(recompra({ diasRestantes: -1 })), "atrasado");
  assert.equal(situacaoPainel(recompra({ diasRestantes: 3 })), "urgente");
  assert.equal(situacaoPainel(recompra({ diasRestantes: 4 })), "normal");
});

test("prioriza os pets detalhados retornados pelo calculo", () => {
  assert.deepEqual(
    nomesPets(
      recompra({
        petsCalculo: [
          { nome: "Luna", especie: "cachorro" },
          { nome: "Thor", especie: "cachorro" },
        ],
      }),
    ),
    ["Luna", "Thor"],
  );
});

test("agrupa o valor previsto usando a data completa da API", () => {
  assert.deepEqual(
    previsaoPorMes([
      recompra({ valorEstimado: 100 }),
      recompra({ id: "r2", valorEstimado: 50 }),
    ]).map(({ chave, valor }) => ({ chave, valor })),
    [{ chave: "2026-09", valor: 150 }],
  );
});

test("explica de onde saiu o ciclo, inclusive o ajuste manual", () => {
  assert.match(
    explicacaoCiclo(recompra({ previsaoBase: 45, cicloManual: 45, cicloCalculado: 30 })),
    /manualmente para 45 dias.*sugeria 30 dias/,
  );
  assert.match(
    explicacaoCiclo(recompra({ origemCiclo: "historico", historicoDias: [28, 32] })),
    /média dos intervalos reais.*28, 32 dias/,
  );
  assert.match(
    explicacaoCiclo(recompra()),
    /10 kg de ração ÷ 200 g\/dia = aproximadamente 30 dias/,
  );
});

test("gera mensagem com dados reais do tutor, pets e produto", () => {
  const mensagem = mensagemRecompra(recompra());
  assert.match(mensagem, /Ana/);
  assert.match(mensagem, /Luna e Thor/);
  assert.match(mensagem, /Ração Teste 10 kg/);
});
