import assert from "node:assert/strict";
import { test } from "node:test";
import { colunaVendaAprovada, sanitizeKanbanColumns } from "./kanban-config";

test("kanban antigo passa a ter coluna Aprovada", () => {
  const columns = sanitizeKanbanColumns([
    { id: "aguardando-pagamento", nome: "Aguardando pagamento", estagioInterno: "vendendo" },
  ]);

  assert.equal(colunaVendaAprovada(columns)?.id, "aprovada");
  assert.equal(colunaVendaAprovada(columns)?.estagioInterno, "pos_venda");
});

test("coluna personalizada de aprovação é preservada", () => {
  const columns = sanitizeKanbanColumns([
    { id: "vendas-aprovadas", nome: "Vendas aprovadas", estagioInterno: "pos_venda" },
  ]);

  assert.equal(colunaVendaAprovada(columns)?.id, "vendas-aprovadas");
  assert.equal(columns.length, 1);
});
