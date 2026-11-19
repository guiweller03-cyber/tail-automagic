import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dataCivilValida,
  hojeLembretes,
  lembreteInputSchema,
  resumirLembretes,
  type Lembrete,
} from "./lembretes";

test("datas civis rejeitam dias inexistentes sem deslocar o dia escolhido", () => {
  assert.equal(dataCivilValida("2026-02-29"), false);
  assert.equal(dataCivilValida("2028-02-29"), true);
  assert.equal(dataCivilValida("2026-04-31"), false);
  assert.equal(dataCivilValida("2026-13-01"), false);
  assert.equal(dataCivilValida("2026-1-01"), false);
  assert.equal(hojeLembretes(new Date("2026-10-17T02:59:59Z")), "2026-10-16");
  assert.equal(hojeLembretes(new Date("2026-10-17T03:00:00Z")), "2026-10-17");
});

test("valida contato e anotação antes de persistir", () => {
  const input = {
    clienteNome: " Ana ",
    telefone: "+55 (11) 99999-9999",
    dia: "2026-10-16",
    anotacao: " Confirmar entrega ",
  };
  assert.deepEqual(lembreteInputSchema.parse(input), {
    ...input,
    clienteNome: "Ana",
    telefone: "5511999999999",
    anotacao: "Confirmar entrega",
  });
  for (const patch of [
    { anotacao: " " },
    { anotacao: "a".repeat(2001) },
    { clienteNome: "" },
    { telefone: "abc" },
    { dia: "2026-02-30" },
  ]) {
    assert.equal(lembreteInputSchema.safeParse({ ...input, ...patch }).success, false);
  }
});

test("dashboard conta clientes distintos, separa atrasos e retira concluídos e futuros", () => {
  const base: Lembrete = {
    id: "1",
    clienteNome: "Ana",
    telefone: "5511999999999",
    dia: "2026-10-16",
    anotacao: "Ligar",
    concluido: false,
  };
  const resumo = resumirLembretes(
    [
      base,
      { ...base, id: "2" },
      { ...base, id: "3", telefone: "5511888888888" },
      { ...base, id: "4", dia: "2026-10-15" },
      { ...base, id: "5", dia: "2026-10-17" },
      { ...base, id: "6", concluido: true },
      { ...base, id: "7", dia: "2026-10-14", concluido: true },
    ],
    "2026-10-16",
  );
  assert.equal(resumo.doDia.length, 3);
  assert.equal(resumo.clientesHoje, 2);
  assert.deepEqual(
    resumo.atrasados.map((item) => item.id),
    ["4"],
  );
});
