/** npx tsx --env-file=.env scripts/auditar-recompra.ts [--aplicar]
 * Gera backup e comparação antes de escrever. Não cria/envia mensagens.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { recalcularRecompraCliente } from "../src/lib/recompra-supabase";
import { requireSupabaseServerKey } from "../src/lib/server-env";

const headers = {
  apikey: requireSupabaseServerKey(),
  authorization: `Bearer ${requireSupabaseServerKey()}`,
};
const base = process.env.SUPABASE_URL! + "/rest/v1";
async function all(path: string) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 300) {
    const res = await fetch(base + path + `&limit=300&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`Falha na leitura (${res.status})`);
    const page = (await res.json()) as any[];
    result.push(...page);
    if (page.length < 300) return result;
  }
}
const [antes, vendas, manuais] = await Promise.all([
  all("/recompra_previsoes?select=*&order=id.asc"),
  all("/vendas?select=cliente_id&order=id.asc"),
  all("/recompra_compras_manuais?select=*&order=id.asc"),
]);
const diretorio = `output/recompra-${new Date().toISOString().replace(/[:.]/g, "-")}`;
await mkdir(diretorio, { recursive: true });
await writeFile(diretorio + "/backup.json", JSON.stringify({ previsoes: antes, manuais }, null, 2));
const clientes = [
  ...new Set([...antes, ...vendas, ...manuais].map((r) => r.cliente_id).filter(Boolean)),
];
const depois: any[] = [];
for (const [index, id] of clientes.entries()) {
  depois.push(...(await recalcularRecompraCliente(id, true)));
  if ((index + 1) % 20 === 0) console.log(`Simulados ${index + 1}/${clientes.length} clientes`);
}
const comparacao = depois.map((p) => {
  const anterior = antes.find((a) => a.id === p.id);
  return {
    clienteId: p.cliente_id,
    previsaoId: p.id,
    grupo: p.calculo.grupo,
    compraAnterior: anterior?.ultima_compra_em ?? null,
    compraNova: p.ultima_compra_em,
    cicloAnterior: anterior?.dias_estimados ?? null,
    cicloNovo: p.dias_estimados,
    dataAnterior: anterior?.proxima_compra_em ?? null,
    dataNova: p.calculo.pendencia ? null : p.proxima_compra_em,
    fonte: p.fonte,
    pendencia: p.calculo.pendencia,
  };
});
await writeFile(diretorio + "/comparacao.json", JSON.stringify(comparacao, null, 2));
await writeFile(diretorio + "/projecao.json", JSON.stringify(depois, null, 2));
console.log(
  JSON.stringify({
    diretorio,
    clientes: clientes.length,
    antes: antes.length,
    depois: depois.length,
    historico: depois.filter((p) => p.fonte === "historico").length,
    pendentes: depois.filter((p) => p.calculo.pendencia).length,
    alteradas: comparacao.filter((p) => p.dataAnterior !== p.dataNova).length,
  }),
);
if (process.argv.includes("--aplicar")) {
  for (const [index, id] of clientes.entries()) {
    await recalcularRecompraCliente(id);
    if ((index + 1) % 20 === 0) console.log(`Aplicados ${index + 1}/${clientes.length} clientes`);
  }
  const aplicado = await all("/recompra_previsoes?select=*&order=id.asc");
  await writeFile(diretorio + "/aplicado.json", JSON.stringify(aplicado, null, 2));
  console.log(`Aplicadas ${aplicado.length} previsões. Backup: ${diretorio}/backup.json`);
}
