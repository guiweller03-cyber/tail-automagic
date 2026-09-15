// Modulo do runtime do Cloudflare Workers (bindings do wrangler.jsonc).
// Tipado de forma solta de proposito: src/lib/cloudflare-env.ts define os tipos usados.
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
