import assert from "node:assert/strict";
import { test } from "node:test";
import { petDoItem, petsSelecionados } from "./pdv-pets";

test("cada item mantém seu próprio pet quando a venda inclui vários pets", () => {
  const petsVenda = "Luna, Thor";
  assert.deepEqual(petsSelecionados(petsVenda), ["Luna", "Thor"]);
  assert.equal(petDoItem("Luna", petsVenda), "Luna");
  assert.equal(petDoItem("Thor", petsVenda), "Thor");
  assert.equal(petDoItem(null, petsVenda), null);
});

test("venda com um pet associa automaticamente o item sem vínculo", () => {
  assert.equal(petDoItem(null, "Luna"), "Luna");
  assert.equal(petDoItem("Thor", "Luna"), "Thor");
});
