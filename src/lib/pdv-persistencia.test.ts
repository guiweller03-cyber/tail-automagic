import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { criarPedidoManual, editarPedidoManual, baixarEstoqueDaVenda } from "./supabase";

function banco(t: TestContext) {
  process.env.SUPABASE_URL = "https://pdv.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "teste";
  process.env.SUPABASE_ANON_KEY = "teste";
  const cliente = { id: "c1", nome: "Cliente", telefone: "5500000000000", pets: [], pedidos: 0 };
  const state = {
    venda: null as Record<string, unknown> | null,
    itens: [] as Record<string, unknown>[],
    estoque: 10,
    baixas: 0,
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input));
      assert.equal(url.host, "pdv.invalid", "Teste nunca acessa serviços reais");
      const table = url.pathname.split("/").pop();
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : null;
      if (table === "clientes") return Response.json([cliente]);
      if (table === "leads_totais") return Response.json([]);
      if (table === "vendas") {
        if (method === "POST")
          state.venda = { id: "v1", criado_em: new Date().toISOString(), ...body };
        if (method === "PATCH") state.venda = { ...state.venda, ...body };
        return Response.json(state.venda ? [state.venda] : []);
      }
      if (table === "venda_itens") {
        if (method === "POST")
          state.itens.push(
            ...body.map((item: object, i: number) => ({
              id: `i${i}`,
              estoque_baixado: false,
              ...item,
            })),
          );
        if (method === "DELETE") state.itens = [];
        if (method === "PATCH") {
          const id = url.searchParams.get("id")?.slice(3);
          const item = state.itens.find((i) => i.id === id);
          Object.assign(item!, body);
          return Response.json(item ? [item] : []);
        }
        return Response.json(
          state.itens.filter(
            (item) => url.searchParams.get("sku") !== "not.is.null" || item.sku !== null,
          ),
        );
      }
      if (table === "produtos") {
        if (method === "PATCH") {
          state.estoque = body.estoque;
          state.baixas++;
        }
        return Response.json([
          { sku: "SKU-1", nome: "Produto", estoque: state.estoque, preco: 100, preco_compra: 60 },
        ]);
      }
      if (
        ["recompra_previsoes", "recompra_compras_manuais", "recompra_racao_modelos"].includes(
          table!,
        )
      )
        return Response.json([]);
      if (table === "salvar_previsoes_recompra") return Response.json(true);
      throw new Error(`Requisição inesperada: ${method} ${url.pathname}`);
    },
  );
  return state;
}

for (const avulso of [false, true]) {
  test(`salva preço e custo editados e relê a venda ${avulso ? "avulsa" : "do estoque"}`, async (t) => {
    const state = banco(t);
    const pedido = await criarPedidoManual({
      nome: "Cliente",
      telefone: "5500000000000",
      total: 180.5,
      itens: [
        {
          sku: avulso ? "avulso" : "SKU-1",
          nome: "Produto",
          quantidade: 1,
          preco: 200.5,
          precoCompra: 120.25,
        },
      ],
      totalBruto: 200.5,
      descontoValor: 20,
    });
    assert.equal(pedido.total, 180.5);
    assert.equal(pedido.itens[0].preco, 200.5);
    assert.equal(pedido.itens[0].precoCompra, 120.25);
    assert.equal(state.venda!.lucro, 60.25);
    assert.equal(state.itens[0].sku, avulso ? null : "SKU-1");
    assert.equal(await baixarEstoqueDaVenda(pedido.id), avulso ? 0 : 1);
    assert.equal(state.baixas, avulso ? 0 : 1);
    assert.equal(state.estoque, avulso ? 10 : 9);
  });
}

test("editar venda avulsa mantém custo e não tenta baixar estoque", async (t) => {
  const state = banco(t);
  const pedido = await criarPedidoManual({
    nome: "Cliente",
    telefone: "5500000000000",
    total: 150,
    itens: [{ sku: "avulso", nome: "Ração avulsa", quantidade: 1, preco: 150, precoCompra: 100 }],
  });
  const editado = await editarPedidoManual({
    id: pedido.id,
    nome: "Cliente",
    total: 170.5,
    itens: pedido.itens.map((i) => ({ ...i, preco: 170.5 })),
  });
  assert.equal(editado.total, 170.5);
  assert.equal(editado.itens[0].precoCompra, 100);
  assert.equal(state.venda!.lucro, 70.5);
  assert.equal(state.itens[0].sku, null);
  assert.equal(state.baixas, 0);
});

test("salva rações de pets diferentes como itens separados", async (t) => {
  const state = banco(t);
  const pedido = await criarPedidoManual({
    nome: "Cliente",
    telefone: "5500000000000",
    total: 200,
    pet: "Luna, Thor",
    itens: [
      { sku: "SKU-1", nome: "Ração", quantidade: 1, preco: 100, precoCompra: 60, petNome: "Luna" },
      { sku: "SKU-1", nome: "Ração", quantidade: 1, preco: 100, precoCompra: 60, petNome: "Thor" },
    ],
  });
  assert.deepEqual(state.itens.map((item) => item.pet_nome), ["Luna", "Thor"]);
  assert.deepEqual(pedido.itens.map((item) => item.petNome), ["Luna", "Thor"]);
});
