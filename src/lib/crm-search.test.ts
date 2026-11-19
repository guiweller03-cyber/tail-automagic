import assert from "node:assert/strict";
import test from "node:test";
import {
  clienteCorrespondeBusca,
  correspondeBusca,
  telefoneCorrespondeBusca,
} from "./crm-search.ts";
import { conversaCorrespondeBusca } from "./conversa-search.ts";

const cliente = {
  nome: "José da Silva",
  telefone: "+55 (11) 98765-4321",
  pets: ["Fubá"],
  petsDetalhes: [{ nome: "Lúcia", raca: "Poodle" }],
  bairro: "São João",
};

test("nomes não correspondem a todos os telefones nos leads", () => {
  assert.equal(clienteCorrespondeBusca(cliente, "fernanda"), false);
  assert.equal(clienteCorrespondeBusca(cliente, "SILVA JOSE"), true);
  assert.equal(clienteCorrespondeBusca(cliente, "sao joao"), true);
});
test("busca pets em cadastros antigos e detalhados", () => {
  for (const termo of ["fuba", "lucia", "poodle", "fuba jose"]) {
    assert.equal(clienteCorrespondeBusca(cliente, termo), true, termo);
  }
  assert.equal(
    conversaCorrespondeBusca({ cliente: "Contato", telefone: cliente.telefone }, "lucia", cliente),
    true,
  );
});
test("busca números formatados, DDI, trechos e nono dígito", () => {
  for (const termo of ["11987654321", "(11) 98765-4321", "4321", "1187654321"]) {
    assert.equal(clienteCorrespondeBusca(cliente, termo), true, termo);
  }
  assert.equal(telefoneCorrespondeBusca("1187654321", "5511987654321"), true);
  assert.equal(telefoneCorrespondeBusca(cliente.telefone, "21987654321"), false);
  assert.equal(telefoneCorrespondeBusca(cliente.telefone, "21"), false);
});
test("nome e número precisam corresponder juntos, sem ignorar texto", () => {
  assert.equal(clienteCorrespondeBusca(cliente, "jose (11) 98765-4321"), true);
  assert.equal(clienteCorrespondeBusca(cliente, "maria 4321"), false);
  assert.equal(clienteCorrespondeBusca(cliente, "jose 99999999"), false);
});
test("busca produtos e pedidos com palavras em qualquer ordem", () => {
  assert.equal(correspondeBusca("golden racao 15", ["Ração Golden Adulto 15kg"]), true);
  assert.equal(correspondeBusca("PED-123", ["PED-123", "José"]), true);
  assert.equal(correspondeBusca("maria 123", ["PED-123", "José"]), false);
  assert.equal(correspondeBusca("   ", []), true);
});
