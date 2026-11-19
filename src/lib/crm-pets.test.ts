import assert from "node:assert/strict";
import test from "node:test";
import { clienteDaVenda, nomesPetsDoCliente, petsDoCadastro } from "./crm-pets.ts";

test("venda espera cliente exato e preserva a escolha entre homonimos", () => {
  const clientes = [
    { id: "1", nome: "Maria Silva", telefone: "11911111111" },
    { id: "2", nome: "Maria Silva", telefone: "11922222222" },
  ];
  assert.equal(clienteDaVenda(clientes, "Maria"), undefined);
  assert.equal(clienteDaVenda(clientes, "Maria Silva"), undefined);
  assert.equal(clienteDaVenda(clientes, "Maria Silva", "2")?.id, "2");
  assert.equal(clienteDaVenda(clientes, "11911111111")?.id, "1");
  assert.equal(clienteDaVenda([{ id: "3", nome: ".", telefone: "11933333333" }], ".", "3")?.id, "3");
});

test("pets antigos continuam visíveis quando outro pet ganha ficha detalhada", () => {
  const cliente = { pets: ["Fubá", "Antigo"], petsDetalhes: [{ nome: "fuba", pesoKg: 10 }] };
  assert.deepEqual(petsDoCadastro(cliente), [{ nome: "fuba", pesoKg: 10 }, { nome: "Antigo" }]);
  assert.equal(cliente.petsDetalhes.length, 1);
});

test("seleção inicial da ração inclui todos os pets sem duplicar fichas", () => {
  const cliente = {
    pets: ["Fubá", "Mia", "Novo"],
    petsDetalhes: [{ nome: "fuba", pesoKg: 10 }, { nome: "Mia", pesoKg: 4 }],
  };
  assert.equal(nomesPetsDoCliente(cliente), "fuba, Mia, Novo");
});
