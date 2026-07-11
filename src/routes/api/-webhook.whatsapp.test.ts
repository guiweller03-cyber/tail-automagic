import assert from "node:assert/strict";
import test from "node:test";
import { motivoIgnorarAutomacoesIa } from "./webhook.whatsapp.ts";

test("ignora automacoes quando IA global esta desligada e conversa nao tem override", () => {
  assert.equal(
    motivoIgnorarAutomacoesIa(
      { ia_ativa: null, aguardando_humano: false },
      { globalDesativada: true },
    ),
    "ia_global_desativada",
  );
});

test("ignora automacoes quando IA da conversa esta desligada", () => {
  assert.equal(
    motivoIgnorarAutomacoesIa(
      { ia_ativa: false, aguardando_humano: false },
      { globalDesativada: false },
    ),
    "ia_conversa_desativada",
  );
});

test("permite automacoes quando conversa tem IA ligada como override", () => {
  assert.equal(
    motivoIgnorarAutomacoesIa(
      { ia_ativa: true, aguardando_humano: true },
      { globalDesativada: true },
    ),
    null,
  );
});
