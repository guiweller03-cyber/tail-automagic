import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferirOrigemVenda,
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
