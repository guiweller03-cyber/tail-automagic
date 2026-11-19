import assert from "node:assert/strict";
import { test } from "node:test";
import { comLoja, configuracaoLoja, lojaAtual, lojaOperacional } from "./loja-context";

test("requisições concorrentes mantêm as credenciais de cada loja", async () => {
  const antes1 = process.env.SUPABASE_URL;
  const antes2 = process.env.LOJA2_SUPABASE_URL;
  process.env.SUPABASE_URL = "https://loja1.invalid";
  process.env.LOJA2_SUPABASE_URL = "https://loja2.invalid";
  try {
    const [primeira, segunda] = await Promise.all([
      comLoja("loja1", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return [lojaAtual(), configuracaoLoja("SUPABASE_URL")];
      }),
      comLoja("loja2", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return [lojaAtual(), configuracaoLoja("SUPABASE_URL")];
      }),
    ]);
    assert.deepEqual(primeira, ["loja1", "https://loja1.invalid"]);
    assert.deepEqual(segunda, ["loja2", "https://loja2.invalid"]);
  } finally {
    if (antes1 === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = antes1;
    if (antes2 === undefined) delete process.env.LOJA2_SUPABASE_URL; else process.env.LOJA2_SUPABASE_URL = antes2;
  }
});

test("Loja 2 sem credencial não herda a chave da Loja 1", () => {
  const antes = process.env.LOJA2_UAZAPI_TOKEN;
  delete process.env.LOJA2_UAZAPI_TOKEN;
  try {
    assert.equal(comLoja("loja2", () => configuracaoLoja("UAZAPI_TOKEN")), undefined);
  } finally {
    if (antes !== undefined) process.env.LOJA2_UAZAPI_TOKEN = antes;
  }
});

test("Loja 2 só fica operacional após ativação explícita", () => {
  const antes = process.env.LOJA2_ATIVA;
  delete process.env.LOJA2_ATIVA;
  try {
    assert.equal(lojaOperacional("loja2"), false);
  } finally {
    if (antes !== undefined) process.env.LOJA2_ATIVA = antes;
  }
});
