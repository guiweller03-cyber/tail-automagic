import assert from "node:assert/strict";
import test from "node:test";
import {
  conversaCorrespondeBusca,
  normalizarBuscaConversa,
  telefoneCorrespondeBusca,
} from "./conversa-search.ts";

test("busca nome ignorando acento e caixa", () => {
  assert.equal(
    conversaCorrespondeBusca({ cliente: "José da Silva", telefone: "5511999998888" }, "JOSE SILVA"),
    true,
  );
});

test("busca pelo nome atualizado na ficha do cliente", () => {
  assert.equal(
    conversaCorrespondeBusca({ cliente: "Contato WhatsApp", telefone: "5511987654321" }, "Bruna", {
      nome: "Bruna Almeida",
      telefone: "(11) 98765-4321",
    }),
    true,
  );
});

test("busca telefone com ou sem ddi e formatacao", () => {
  assert.equal(telefoneCorrespondeBusca("5511987654321", "(11) 98765-4321"), true);
  assert.equal(telefoneCorrespondeBusca("11 98765-4321", "+55 11 98765-4321"), true);
  assert.equal(telefoneCorrespondeBusca("5511987654321", "4321"), true);
});

test("nao usa consultas numericas curtas", () => {
  assert.equal(telefoneCorrespondeBusca("5511987654321", "21"), false);
});

test("normaliza pontuacao e espacos", () => {
  assert.equal(normalizarBuscaConversa("  Maria-d'Ávila  "), "maria d avila");
});
