import type { Produto } from "@/lib/crm-types";

/**
 * URL da foto do produto servida pelo proxy /api/crm/produtos/foto, que guarda a
 * foto no KV do Cloudflare. Evita baixar direto do Storage do Supabase (egress) a
 * cada exibicao. O `v` muda a cada upload, entao o navegador pode cachear de vez.
 */
export function produtoFotoProxyUrl(
  produto: Pick<Produto, "sku" | "fotoPath" | "fotoUrl">,
): string {
  const version = produto.fotoPath ?? produto.fotoUrl ?? "";
  const params = new URLSearchParams({ sku: produto.sku });
  if (version) params.set("v", version);
  return `/api/crm/produtos/foto?${params}`;
}
