import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import {
  recalcularRecompraCliente,
  recalcularRecompraVenda,
  listarRecompraPrevista,
  registrarRecompraManual,
} from "./recompra-supabase";
import { preverRecompra, consumoDiarioPetRacao } from "./recompra-calculo";

const pet = { nome: "Rex", especie: "cachorro", porte: "grande", pesoKg: 30 };
const cliente = {
  id: "c1",
  nome: "Teste",
  pets: ["Rex"],
  pets_detalhes: [pet],
  especies: ["cachorro"],
};
const produto = (sku: string) => ({
  sku,
  nome: "Racao adulto caes 15 kg",
  categoria: "Racao",
  preco: 100,
  detalhes_tecnicos: { peso: "15 kg" },
});
function item(id: string, data: string, sku = "A", petNome = "Rex", quantidade = 1) {
  return {
    id,
    venda_id: id,
    sku,
    nome: "Racao adulto caes 15 kg",
    pet_nome: petNome,
    quantidade,
    preco: 100,
    vendas: {
      id,
      cliente_id: "c1",
      criado_em: data + "T15:00:00Z",
      status: "concluida",
      observacao: "",
    },
  };
}

/** REST em memória: falha em qualquer chamada não prevista e nunca acessa a rede. */
function banco(t: TestContext, itens: ReturnType<typeof item>[], cl: object = cliente) {
  process.env.SUPABASE_URL = "https://teste.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-ficticia";
  const state = { previsoes: [] as any[], manuais: [] as any[], conflitos: 0, gravacoes: 0 };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const q = u.searchParams;
    const method = init.method ?? "GET";
    let rows: any = [];
    if (method === "GET") {
      if (u.pathname.endsWith("/clientes")) rows = [cl];
      else if (u.pathname.endsWith("/produtos"))
        rows = [...new Set(itens.map((i) => i.sku))].map(produto);
      else if (u.pathname.endsWith("/vendas"))
        rows = itens
          .filter((i) => !q.has("id") || i.venda_id === q.get("id")!.slice(3))
          .map((i) => i.vendas);
      else if (u.pathname.endsWith("/venda_itens")) rows = itens;
      else if (u.pathname.endsWith("/recompra_racao_modelos")) rows = [];
      else if (u.pathname.endsWith("/recompra_compras_manuais")) rows = state.manuais;
      else if (u.pathname.endsWith("/recompra_previsoes"))
        rows = state.previsoes
          .filter((p) => !q.has("venda_id") || p.venda_id === q.get("venda_id")!.slice(3))
          .map((p) => ({ ...p, clientes: cl, produtos: produto(p.sku) }));
      else throw new Error("GET inesperado: " + u.pathname);
      const offset = Number(q.get("offset") || 0);
      rows = rows.slice(offset, offset + Number(q.get("limit") || 10000));
    } else if (method === "POST" && u.pathname.endsWith("/rpc/salvar_previsoes_recompra")) {
      const body = JSON.parse(init.body as string);
      if (state.conflitos > 0) {
        state.conflitos--;
        rows = false;
      } else {
        state.previsoes = body.p_previsoes;
        state.gravacoes++;
        rows = true;
      }
    } else if (method === "POST" && u.pathname.endsWith("/recompra_compras_manuais")) {
      rows = JSON.parse(init.body as string);
      if (
        q.get("on_conflict") === "id" &&
        String(init.headers && new Headers(init.headers).get("Prefer")).includes(
          "ignore-duplicates",
        )
      ) {
        rows = rows.filter((r: any) => !state.manuais.some((m) => m.id === r.id));
      }
      state.manuais.push(...rows);
    } else throw new Error("Mutação inesperada: " + method + " " + u.pathname);
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return state;
}

test("primeira compra usa pet e peso; depois vale a média de dias entre as compras", async (t) => {
  const itens = [item("v1", "2026-08-01")];
  const db = banco(t, itens);
  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes[0].dias_estimados, 39);
  assert.equal(db.previsoes[0].consumo_diario_g, 385);
  itens.push(item("v2", "2026-08-31", "B", "Rex", 2));
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes.length, 1);
  assert.equal(db.previsoes[0].dias_estimados, 30);
  assert.equal(db.previsoes[0].consumo_diario_g, 500);
  itens.push(item("v3", "2026-09-30", "C"));
  await recalcularRecompraVenda("v3");
  assert.equal(db.previsoes[0].dias_estimados, 30);
  assert.deepEqual(db.previsoes[0].historico_dias, [30, 30]);
});

test("uma ração para dois pets cria previsão compartilhada e a edição separa as rações", async (t) => {
  const itens = [item("v1", "2026-08-01", "A", "Rex, Mia")];
  const db = banco(t, itens, {
    ...cliente,
    pets: ["Rex", "Mia"],
    pets_detalhes: [pet, { nome: "Mia", especie: "cachorro", porte: "pequeno", pesoKg: 6 }],
  });

  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes.length, 1);
  assert.deepEqual(db.previsoes[0].pets.map((p: { nome: string }) => p.nome), ["Mia", "Rex"]);

  itens[0].pet_nome = "Rex";
  itens.push({ ...item("i2", "2026-08-01", "B", "Mia"), venda_id: "v1", vendas: itens[0].vendas });
  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes.length, 2);
  assert.deepEqual(
    db.previsoes.map((p) => p.pet_nome).sort(),
    ["mia", "rex"],
  );
});

test("reprocessar venda antiga de outro SKU mantém referência mais recente e o ajuste", async (t) => {
  const db = banco(t, [item("v1", "2026-08-01"), item("v2", "2026-08-31", "B")]);
  await recalcularRecompraVenda("v2");
  const id = db.previsoes[0].id;
  db.previsoes[0].dias_manual = 45;
  db.previsoes[0].contatado = true;
  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes[0].venda_id, "v2");
  assert.equal(db.previsoes[0].id, id);
  assert.equal(db.previsoes[0].dias_estimados, 45);
  assert.equal(db.previsoes[0].contatado, true);
});

test("nova compra limpa ciclo manual anterior", async (t) => {
  const itens = [item("v1", "2026-08-01")];
  const db = banco(t, itens);
  await recalcularRecompraVenda("v1");
  db.previsoes[0].dias_manual = 90;
  itens.push(item("v2", "2026-08-31"));
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes[0].dias_manual, null);
  assert.equal(db.previsoes[0].dias_estimados, 30);
});

test("duas primeiras compras próximas somam pacotes e descontam o consumo passado", async (t) => {
  const db = banco(t, [item("v1", "2026-08-01"), item("v2", "2026-08-03")]);
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes[0].peso_kg, 30);
  assert.equal(db.previsoes[0].dias_estimados, 76);
  assert.equal(db.previsoes[0].calculo.diasTranscorridos, 2);
});

test("sem pet selecionado separa espécies e conecta histórico explícito compatível", async (t) => {
  const db = banco(t, [item("v1", "2026-08-01", "A", ""), item("v2", "2026-08-31")], {
    ...cliente,
    pets_detalhes: [pet, { nome: "Mia", especie: "gato", pesoKg: 4 }],
  });
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes.length, 1);
  assert.equal(db.previsoes[0].pets.length, 1);
  assert.equal(db.previsoes[0].dias_estimados, 30);
});

test("mesmo SKU para dois pets não copia marcador nem apaga previsão do outro", async (t) => {
  const a = item("v1", "2026-08-01");
  const b = item("v2", "2026-08-01", "A", "Lua");
  const obs =
    'recompra_auto sku="A" pet="Rex" confirmado=true consumo_diario_g=420 dias=36 peso_kg=15 | recompra_auto sku="A" pet="Lua" confirmado=true consumo_diario_g=150 dias=100 peso_kg=15';
  a.vendas.observacao = obs;
  b.vendas.observacao = obs;
  const db = banco(t, [a, b], {
    ...cliente,
    pets_detalhes: [pet, { ...pet, nome: "Lua", pesoKg: 10 }],
  });
  await recalcularRecompraVenda("v1");
  assert.deepEqual(
    db.previsoes.map((p) => p.dias_estimados).sort((a, b) => a - b),
    [36, 100],
  );
});

test("marcador automático antigo não congela dados do pet corrigidos", async (t) => {
  const venda = item("v1", "2026-08-01");
  venda.vendas.observacao = 'recompra_auto sku="A" dias=100 consumo_diario_g=150 peso_kg=15';
  const db = banco(t, [venda]);
  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes[0].dias_estimados, 39);
});

test("nomes normalizados e ordem diferente não separam o mesmo grupo", async (t) => {
  const db = banco(t, [
    item("v1", "2026-08-01", "A", "Rex, Lua"),
    item("v2", "2026-08-31", "B", " lua , REX "),
  ]);
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes.length, 1);
  assert.equal(db.previsoes[0].dias_estimados, 30);
});

test("cancelamento restaura previsão anterior e última compra cancelada remove projeção", async (t) => {
  const itens = [item("v1", "2026-08-01"), item("v2", "2026-08-31")];
  const db = banco(t, itens);
  await recalcularRecompraVenda("v2");
  itens[1].vendas.status = "cancelada";
  await recalcularRecompraVenda("v2");
  assert.equal(db.previsoes[0].venda_id, "v1");
  itens[0].vendas.status = "cancelada";
  await recalcularRecompraVenda("v1");
  assert.equal(db.previsoes.length, 0);
});

test("sem peso conhecido não inventa 30 dias", async (t) => {
  const venda = item("v1", "2026-08-01");
  venda.nome = "Racao sem peso";
  const db = banco(t, [venda]);
  // Produto avulso não tem catálogo que complete o peso.
  db.manuais.push({
    id: "m1",
    cliente_id: "c1",
    sku: "Z",
    produto_nome: "Racao sem peso",
    pet_nome: "Lua",
    especie: "cachorro",
    comprado_em: "2026-08-01",
    quantidade: 1,
    peso_kg: 0,
    pets_detalhes: [],
  });
  await recalcularRecompraCliente("c1");
  const semPeso = db.previsoes.find((p) => p.calculo.produtoSku === "Z");
  assert.equal(semPeso.dias_estimados, 0);
  assert.ok(semPeso.calculo.pendencia);
  assert.equal(
    (await listarRecompraPrevista()).recompras.find((p) => p.sku === "Z")?.status,
    "pendente",
  );
});

test("conflito concorrente refaz leitura e só grava projeção aceita", async (t) => {
  const db = banco(t, [item("v1", "2026-08-01")]);
  db.conflitos = 1;
  await recalcularRecompraVenda("v1");
  assert.equal(db.gravacoes, 1);
});

test("compras manuais alimentam histórico sem criar vendas financeiras", async (t) => {
  const db = banco(t, []);
  const input = {
    clienteId: "c1",
    sku: "A",
    produtoNome: "Racao adulto caes 15 kg",
    petNome: "Rex",
    pesoKg: 15,
    diasRecompra: 36,
    compraEm: "2026-08-01",
  };
  await registrarRecompraManual(input);
  await registrarRecompraManual({ ...input, compraEm: "2026-08-31", pesoKg: 30 });
  assert.equal(db.manuais.length, 2);
  assert.equal(db.previsoes[0].dias_estimados, 30);
  assert.equal(db.previsoes[0].venda_id, null);
});

test("painel diferencia intervalo observado de duração ajustada e consumo usado", async (t) => {
  banco(t, [item("v1", "2026-08-01"), item("v2", "2026-08-31", "A", "Rex", 2)]);
  await recalcularRecompraVenda("v2");
  const r = (await listarRecompraPrevista()).recompras[0];
  assert.equal(r.intervaloPedidos, 30);
  assert.equal(r.previsaoBase, 30);
  assert.equal(r.consumoHistoricoG, 500);
  assert.equal(r.consumoEstimadoG, 385);
  assert.equal(r.precisaoIA, 0);
});

test("repetir envio manual com a mesma chave não duplica o abastecimento", async (t) => {
  const db = banco(t, []);
  const input = {
    clienteId: "c1",
    sku: "A",
    produtoNome: "Racao adulto caes 15 kg",
    petNome: "Rex",
    pesoKg: 15,
    diasRecompra: 36,
    compraEm: "2026-08-01",
    requisicaoId: "tentativa-1",
  };
  await registrarRecompraManual(input);
  await registrarRecompraManual(input);
  assert.equal(db.manuais.length, 1);
  assert.equal(db.previsoes[0].peso_kg, 15);
  assert.equal(db.previsoes[0].dias_estimados, 39);
});

test("filhote usa data da compra e integra crescimento durante o pacote", () => {
  const consumo = (data: string) =>
    consumoDiarioPetRacao({
      produto: { nome: "Racao filhote 15 kg" },
      pet: {
        nome: "Rex",
        especie: "cachorro",
        raca: "Labrador Retriever",
        nascimento: "2026-02-01",
      },
      especiePadrao: "cachorro",
      portePadrao: "grande",
      hoje: data,
    }).consumoDiaG;
  const r = preverRecompra({
    compras: [{ data: "2026-04-01", pesoKg: 15 }],
    consumoNaData: consumo,
  });
  assert.ok(r.dias < Math.round(15000 / consumo("2026-04-01")));
  assert.ok(r.dias > 0);
  assert.equal(r.pendencia, null);
});

test("venda retroativa repetida do mesmo pacote não multiplica o peso do abastecimento", async (t) => {
  const original = item("v1", "2026-07-22");
  const repetidas = ["v2", "v3", "v4"].map((id) => {
    const venda = item(id, "2026-07-23");
    venda.vendas.observacao = "Venda retroativa (22/07) - mesma ração";
    return venda;
  });
  const db = banco(t, [original, ...repetidas]);
  await recalcularRecompraCliente("c1");
  assert.equal(db.previsoes[0].peso_kg, 15);
  assert.equal(db.previsoes[0].dias_estimados, 39);
});

test("pacote enorme para pet pequeno fica limitado ao teto do ciclo automático", async (t) => {
  const db = banco(t, [item("v1", "2026-08-01", "A", "Rex", 4)], {
    ...cliente,
    pets_detalhes: [{ ...pet, pesoKg: 3 }],
  });
  await recalcularRecompraCliente("c1");
  assert.equal(db.previsoes[0].peso_kg, 60);
  assert.equal(db.previsoes[0].dias_estimados, 120);
});

test("histórico com peso lançado errado não afeta: vale só a distância entre compras", () => {
  // 0,5 kg lançado no lugar de 2,5 kg não importa: voltou em 74 dias.
  const r = preverRecompra({
    compras: [
      { data: "2026-07-28", pesoKg: 0.505 },
      { data: "2026-10-10", pesoKg: 2.525 },
    ],
    consumoNaData: () => 57,
  });
  assert.equal(r.dias, 74);
});
