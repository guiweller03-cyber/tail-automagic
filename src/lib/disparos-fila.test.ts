import assert from "node:assert/strict";
import test from "node:test";
import {
  COOLDOWNS,
  cooldownAleatorio,
  executarFilaDisparo,
  formatarDuracao,
  tempoEstimadoMs,
  type CooldownNivel,
} from "./disparos-fila";

// Relogio falso: o envio "demora" duracaoEnvioMs e aguardar() avanca o tempo.
function relogioFalso(duracaoEnvioMs = 0) {
  let agora = 0;
  const envios: number[] = [];
  return {
    envios,
    agora: () => agora,
    aguardar: async (ms: number) => {
      agora += ms;
    },
    enviar: async () => {
      envios.push(agora);
      agora += duracaoEnvioMs;
    },
  };
}

for (const nivel of Object.keys(COOLDOWNS) as CooldownNivel[]) {
  test(`cooldown ${nivel}: intervalo entre envios fica dentro da faixa`, async () => {
    const { minMs, maxMs } = COOLDOWNS[nivel];
    const relogio = relogioFalso(1_500);
    const itens = Array.from({ length: 30 }, (_, i) => i);

    const resultado = await executarFilaDisparo({
      itens,
      enviar: relogio.enviar,
      intervaloMs: () => cooldownAleatorio(nivel),
      aguardar: relogio.aguardar,
      deveParar: () => false,
      agora: relogio.agora,
    });

    assert.deepEqual(resultado, { processados: 30, interrompido: false });
    assert.equal(relogio.envios.length, 30);
    for (let i = 1; i < relogio.envios.length; i += 1) {
      const gap = relogio.envios[i] - relogio.envios[i - 1];
      assert.ok(gap >= minMs && gap <= maxMs, `gap ${gap} fora de [${minMs}, ${maxMs}]`);
    }
  });
}

test("cooldownAleatorio cobre os extremos da faixa", () => {
  assert.equal(
    cooldownAleatorio("seguro", () => 0),
    COOLDOWNS.seguro.minMs,
  );
  assert.equal(
    cooldownAleatorio("seguro", () => 1),
    COOLDOWNS.seguro.maxMs,
  );
});

test("envio mais lento que o cooldown nao gera espera negativa", async () => {
  const relogio = relogioFalso(90_000);
  const esperas: number[] = [];
  await executarFilaDisparo({
    itens: [1, 2],
    enviar: relogio.enviar,
    intervaloMs: () => 30_000,
    aguardar: relogio.aguardar,
    deveParar: () => false,
    agora: relogio.agora,
    onEsperando: (ms) => esperas.push(ms),
  });
  assert.deepEqual(esperas, [0]);
});

test("nao espera depois do ultimo contato", async () => {
  const esperas: number[] = [];
  await executarFilaDisparo({
    itens: [1],
    enviar: async () => {},
    intervaloMs: () => 60_000,
    aguardar: async (ms) => {
      esperas.push(ms);
    },
    deveParar: () => false,
  });
  assert.deepEqual(esperas, []);
});

test("parar durante o cooldown interrompe antes do proximo envio", async () => {
  let parar = false;
  const enviados: number[] = [];
  const resultado = await executarFilaDisparo({
    itens: [1, 2, 3],
    enviar: async (item) => {
      enviados.push(item);
    },
    intervaloMs: () => 60_000,
    aguardar: async () => {
      parar = true;
    },
    deveParar: () => parar,
  });
  assert.deepEqual(enviados, [1]);
  assert.deepEqual(resultado, { processados: 1, interrompido: true });
});

test("erro num contato nao para a fila nem pula o cooldown", async () => {
  const relogio = relogioFalso();
  const resultado = await executarFilaDisparo({
    itens: [1, 2, 3],
    enviar: async (item) => {
      await relogio.enviar();
      if (item === 2) throw new Error("uazapi 500");
    },
    intervaloMs: () => 45_000,
    aguardar: relogio.aguardar,
    deveParar: () => false,
    agora: relogio.agora,
  });
  assert.equal(resultado.processados, 3);
  assert.deepEqual(relogio.envios, [0, 45_000, 90_000]);
});

test("tempo estimado e formatacao", () => {
  assert.equal(tempoEstimadoMs(1, "seguro"), 0);
  assert.equal(tempoEstimadoMs(11, "seguro"), 50 * 60_000);
  assert.equal(formatarDuracao(45_000), "45s");
  assert.equal(formatarDuracao(150_000), "2min30s");
  assert.equal(formatarDuracao(50 * 60_000), "50min");
  assert.equal(formatarDuracao(125 * 60_000), "2h05");
});
