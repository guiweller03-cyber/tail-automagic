import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularDuracoesHistorico,
  compararCicloComHistorico,
  type HistoricoVendaItem,
} from "@/lib/historico-recompra";

const racao = (pesoKg: number, entraNoCiclo = true): HistoricoVendaItem => ({
  sku: "R1",
  nome: "Ração 15 kg",
  quantidade: 1,
  preco: 200,
  petNome: "Sol",
  racao: true,
  pesoKg,
  entraNoCiclo,
});
const petisco: HistoricoVendaItem = {
  ...racao(0, false),
  sku: "P1",
  nome: "Petisco",
  racao: false,
};

function venda(data: string, itens: HistoricoVendaItem[]) {
  const kgCiclo = itens.filter((i) => i.entraNoCiclo).reduce((s, i) => s + i.pesoKg, 0);
  return { vendaId: data, data, total: 200, status: null, itens, kgCiclo };
}

test("calcula quanto cada compra de ração durou, ignorando vendas fora do ciclo", () => {
  const vendas = calcularDuracoesHistorico([
    venda("2026-08-01", [racao(15)]),
    venda("2026-08-20", [petisco]),
    venda("2026-08-31", [racao(15)]),
    venda("2026-09-30", [racao(15)]),
  ]);
  assert.deepEqual(
    vendas.map((v) => v.data),
    ["2026-09-30", "2026-08-31", "2026-08-20", "2026-08-01"],
  );
  assert.deepEqual(
    vendas.map((v) => v.durouDias),
    [null, 30, null, 30],
  );
  assert.equal(vendas[1].consumoRealG, 500);
});

test("diz se a previsão bate, está curta ou longa", () => {
  const vendas = calcularDuracoesHistorico([
    venda("2026-08-01", [racao(15)]),
    venda("2026-08-31", [racao(15)]),
    venda("2026-09-30", [racao(15)]),
  ]);
  assert.equal(compararCicloComHistorico(vendas, 31).veredito, "bate");
  const longo = compararCicloComHistorico(vendas, 45);
  assert.equal(longo.veredito, "longo");
  assert.equal(longo.cicloHistorico, 30);
  assert.equal(longo.diferencaDias, 15);
  assert.equal(longo.intervaloMedioDias, 30);
  assert.equal(compararCicloComHistorico(vendas, 20).veredito, "curto");
});

test("sem 2 compras de ração não compara", () => {
  const vendas = calcularDuracoesHistorico([venda("2026-09-30", [racao(15)])]);
  const resultado = compararCicloComHistorico(vendas, 30);
  assert.equal(resultado.veredito, "sem_dados");
  assert.equal(resultado.comprasNoCiclo, 1);
});
