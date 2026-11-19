import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferirOrigemVenda,
  listarVendasFinanceiras,
  mapVendaFinanceira,
  type VendaFinanceiraItem,
} from "./financeiro-supabase";

describe("histórico financeiro", () => {
  it("identifica vendas do PDV, WhatsApp e CRM pela observação", () => {
    assert.equal(inferirOrigemVenda("Venda rápida pelo PDV"), "PDV");
    assert.equal(inferirOrigemVenda("Pedido recebido no WhatsApp"), "WhatsApp IA");
    assert.equal(inferirOrigemVenda("Atendimento manual"), "CRM");
  });

  it("mantém o nome avulso e calcula os totais dos itens", () => {
    const itens: VendaFinanceiraItem[] = [
      {
        id: "item-1",
        sku: "RACAO-1",
        nome: "Ração",
        quantidade: 2,
        precoUnitario: 50,
        custoUnitario: 30,
        subtotal: 100,
        custoTotal: 60,
      },
    ];

    const venda = mapVendaFinanceira(
      {
        id: "venda-1",
        cliente_id: null,
        cliente_nome: "Cliente sem cadastro",
        telefone: "11999999999",
        pet_nome: null,
        total: 90,
        total_bruto: 100,
        desconto_cupom: 10,
        lucro: 30,
        forma_pagamento: "pix",
        status_pagamento: "pago",
        status: "concluida",
        processo: "novo",
        observacao: "Venda rápida pelo PDV",
        cupom_codigo: null,
        venda_origem: null,
        criado_em: "2026-09-14T12:00:00.000Z",
        atualizado_em: "2026-09-14T12:00:00.000Z",
        faturado_em: "2026-09-14T12:01:00.000Z",
        clientes: null,
      },
      itens,
    );

    assert.equal(venda.cliente, "Cliente sem cadastro");
    assert.equal(venda.quantidadeItens, 2);
    assert.equal(venda.totalBruto, 100);
    assert.equal(venda.desconto, 10);
    assert.equal(venda.custoProdutos, 60);
    assert.equal(venda.origem, "PDV");
  });

  it("calcula o lucro a partir dos itens quando o registro antigo não o possui", () => {
    const venda = mapVendaFinanceira(
      {
        id: "venda-antiga",
        cliente_id: null,
        cliente_nome: "Cliente antigo",
        telefone: null,
        pet_nome: null,
        total: 80,
        total_bruto: null,
        desconto_cupom: null,
        lucro: null,
        forma_pagamento: null,
        status_pagamento: null,
        status: null,
        processo: null,
        observacao: null,
        cupom_codigo: null,
        venda_origem: null,
        criado_em: "2026-07-04T12:00:00.000Z",
        atualizado_em: "2026-07-04T12:00:00.000Z",
        faturado_em: null,
        clientes: null,
      },
      [
        {
          id: "item-antigo",
          sku: "SKU-1",
          nome: "Produto",
          quantidade: 1,
          precoUnitario: 80,
          custoUnitario: 50,
          subtotal: 80,
          custoTotal: 50,
        },
      ],
    );

    assert.equal(venda.custoProdutos, 50);
    assert.equal(venda.lucro, 30);
  });
});

describe("listarVendasFinanceiras em banco com migrations atrasadas", () => {
  it("ignora colunas opcionais ausentes em vez de falhar", async () => {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_ANON_KEY = "chave-teste";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "chave-teste";
    const ausentes = new Set(["venda_origem", "pet_nome"]);
    const urls: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const select = new URL(url).searchParams.get("select") ?? "";
      const faltando = [...ausentes].find((coluna) => select.split(",").includes(coluna));
      if (faltando) {
        const tabela = url.includes("/venda_itens") ? "venda_itens" : "vendas";
        return new Response(
          JSON.stringify({
            code: "42703",
            message: `column ${tabela}.${faltando} does not exist`,
          }),
          { status: 400 },
        );
      }
      if (url.includes("/venda_itens")) return Response.json([]);
      return Response.json([
        {
          id: "v1",
          total: 99.9,
          lucro: 28.9,
          observacao: "Venda rápida pelo PDV",
          criado_em: "2026-11-18T12:00:00Z",
        },
      ]);
    }) as typeof fetch;

    try {
      const vendas = await listarVendasFinanceiras();
      assert.equal(vendas.length, 1);
      assert.equal(vendas[0].total, 99.9);
      assert.equal(vendas[0].origem, "PDV");
      const ultimaVendas = urls.filter((u) => u.includes("/vendas?")).at(-1) ?? "";
      assert.ok(!ultimaVendas.includes("venda_origem"));
      assert.ok(!ultimaVendas.includes("pet_nome"));
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
