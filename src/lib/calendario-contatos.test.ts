import assert from "node:assert/strict";
import test from "node:test";
import { agruparContatosPorDia, diaSaoPaulo, intervaloDoMes } from "./calendario-contatos.ts";

test("intervalo do mes usa meia-noite de Sao Paulo", () => {
  assert.deepEqual(intervaloDoMes("2026-10"), {
    inicio: "2026-10-01T03:00:00.000Z",
    fim: "2026-11-01T03:00:00.000Z",
  });
  assert.deepEqual(intervaloDoMes("2026-12")?.fim, "2027-01-01T03:00:00.000Z");
  assert.equal(intervaloDoMes("2026-13"), null);
  assert.equal(intervaloDoMes("lixo"), null);
});

test("dia considera o fuso de Sao Paulo", () => {
  assert.equal(diaSaoPaulo("2026-10-06T02:30:00.000Z"), "2026-10-05");
  assert.equal(diaSaoPaulo("2026-10-06T03:00:00.000Z"), "2026-10-06");
});

test("agrupa so mensagens recebidas, por conversa e dia", () => {
  const { inicio, fim } = intervaloDoMes("2026-10")!;
  const contatos = agruparContatosPorDia(
    [
      {
        id: "a",
        telefone: "5511999990000",
        nome_cliente: "Ana",
        historico: [
          { role: "user", content: "oi", at: "2026-10-06T12:00:00.000Z" },
          { role: "assistant", content: "ola", at: "2026-10-06T12:01:00.000Z" },
          { role: "user", content: "quero racao", at: "2026-10-06T13:00:00.000Z" },
          { role: "user", content: "ontem", at: "2026-10-05T13:00:00.000Z" },
          { role: "user", content: "mes passado", at: "2026-09-30T13:00:00.000Z" },
          { role: "user", content: "sem data" },
        ],
      },
      {
        id: "b",
        telefone: "5511888880000",
        nome_cliente: null,
        historico: [
          { role: "assistant", content: "promo", at: "2026-10-06T10:00:00.000Z", fromMe: true },
        ],
      },
    ],
    inicio,
    fim,
  );

  assert.equal(contatos.length, 2);
  assert.deepEqual(
    contatos.map((c) => [c.dia, c.mensagens, c.ultimaMensagem]),
    [
      ["2026-10-05", 1, "ontem"],
      ["2026-10-06", 2, "quero racao"],
    ],
  );
});
