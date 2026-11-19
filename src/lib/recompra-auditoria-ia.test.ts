import assert from "node:assert/strict";
import test from "node:test";
import { interpretarRespostaAuditoria } from "./recompra-auditoria-ia.ts";

test("auditoria: ajuste válido é aceito com ciclo arredondado", () => {
  const r = interpretarRespostaAuditoria(
    '{"veredito":"ajustar","ciclo_sugerido_dias":44.6,"confianca":"alta","justificativa":"Cliente disse que 15 kg dura 45 dias.","alertas":["venda duplicada em 12/10"]}',
    90,
  );
  assert.equal(r.veredito, "ajustar");
  assert.equal(r.cicloSugeridoDias, 45);
  assert.equal(r.confianca, "alta");
  assert.deepEqual(r.alertas, ["venda duplicada em 12/10"]);
});

test("auditoria: ciclo fora da faixa vira verificar sem sugestão", () => {
  const r = interpretarRespostaAuditoria(
    '{"veredito":"ajustar","ciclo_sugerido_dias":400,"confianca":"alta","justificativa":"x"}',
    60,
  );
  assert.equal(r.veredito, "verificar");
  assert.equal(r.cicloSugeridoDias, null);
});

test("auditoria: ok mantém o ciclo atual", () => {
  const r = interpretarRespostaAuditoria(
    '{"veredito":"ok","ciclo_sugerido_dias":38,"confianca":"media","justificativa":"bate"}',
    40,
  );
  assert.equal(r.veredito, "ok");
  assert.equal(r.cicloSugeridoDias, 40);
});

test("auditoria: ajuste igual ao ciclo atual vira ok", () => {
  const r = interpretarRespostaAuditoria(
    '{"veredito":"ajustar","ciclo_sugerido_dias":30,"confianca":"media","justificativa":"igual"}',
    30,
  );
  assert.equal(r.veredito, "ok");
});

test("auditoria: resposta ilegível não quebra e pede verificação", () => {
  const r = interpretarRespostaAuditoria("desculpe, não consigo", 30);
  assert.equal(r.veredito, "verificar");
  assert.equal(r.confianca, "baixa");
});

test("auditoria: veredito e confiança inventados caem no padrão seguro", () => {
  const r = interpretarRespostaAuditoria(
    'texto antes {"veredito":"aplicar_ja","ciclo_sugerido_dias":20,"confianca":"total"} depois',
    50,
  );
  assert.equal(r.veredito, "verificar");
  assert.equal(r.confianca, "baixa");
});
