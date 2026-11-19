import assert from "node:assert/strict";
import test from "node:test";
import { motivoIgnorarAutomacoesIa, textoMensagem } from "./webhook.whatsapp.ts";

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

test("audio e imagem com text vazio da UazAPI nao sao descartados", () => {
  assert.equal(
    textoMensagem({ chatid: "1@s.whatsapp.net", text: "", messageType: "AudioMessage" }),
    "[Audio recebido]",
  );
  assert.equal(
    textoMensagem({
      chatid: "1@s.whatsapp.net",
      text: "",
      messageType: "ImageMessage",
      fromMe: true,
    }),
    "[Imagem enviada]",
  );
  assert.equal(
    textoMensagem({ chatid: "1@s.whatsapp.net", text: "oi", messageType: "Conversation" }),
    "oi",
  );
});
