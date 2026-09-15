/**
 * Bindings do Cloudflare declarados no wrangler.jsonc (KV e rate limit).
 * Fora do runtime do Workers (vite dev, tsx, testes) o modulo nao existe: as
 * funcoes que dependem dele seguem sem cache e sem limite, como antes.
 */

export type KvNamespace = {
  get(key: string): Promise<string | null>;
  getWithMetadata<Metadata>(
    key: string,
    type: "arrayBuffer",
  ): Promise<{ value: ArrayBuffer | null; metadata: Metadata | null }>;
  put(
    key: string,
    value: ArrayBuffer | string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void>;
};

export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type CloudflareBindings = {
  CRM_CACHE?: KvNamespace;
  CRM_API_RATE_LIMIT?: RateLimiter;
};

let bindingsPromise: Promise<CloudflareBindings> | undefined;

export function cloudflareBindings(): Promise<CloudflareBindings> {
  bindingsPromise ??= import("cloudflare:workers")
    .then((mod) => (mod.env ?? {}) as CloudflareBindings)
    .catch(() => ({}));
  return bindingsPromise;
}
