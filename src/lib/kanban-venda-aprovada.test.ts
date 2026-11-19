import assert from "node:assert/strict";
import { test } from "node:test";
import { moverConversaParaVendaAprovada } from "./supabase";

test("pagamento confirmado move a conversa para a coluna Aprovada", async (t) => {
  process.env.SUPABASE_URL = "https://kanban.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "teste";
  let conversa = { id: "conversa-1", kanban_coluna: "aguardando-pagamento", estagio: "vendendo" };
  let atualizacoes = 0;

  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    assert.equal(url.host, "kanban.invalid", "Teste nunca acessa serviços reais");
    if (url.pathname.endsWith("/crm_configuracoes")) {
      return Response.json([{ valor: [{ id: "aguardando-pagamento", nome: "Aguardando pagamento", estagioInterno: "vendendo" }] }]);
    }
    if (url.pathname.endsWith("/conversas")) {
      if (init.method === "PATCH") {
        conversa = { ...conversa, ...JSON.parse(String(init.body)) };
        atualizacoes += 1;
        return new Response(null, { status: 204 });
      }
      assert.equal(url.searchParams.get("telefone"), "eq.5511999999999");
      return Response.json([conversa]);
    }
    throw new Error(`Consulta inesperada: ${url.pathname}`);
  });

  await moverConversaParaVendaAprovada("+55 (11) 99999-9999");
  assert.equal(conversa.kanban_coluna, "aprovada");
  assert.equal(conversa.estagio, "pos_venda");
  await moverConversaParaVendaAprovada("5511999999999");
  assert.equal(atualizacoes, 1);
});
