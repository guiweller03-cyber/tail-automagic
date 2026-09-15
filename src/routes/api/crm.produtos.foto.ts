import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { cloudflareBindings } from "@/lib/cloudflare-env";
import {
  buscarProdutoFotoCrm,
  removerProdutoFotoCrm,
  salvarProdutoFotoCrm,
  type ProdutoFotoArquivo,
} from "@/lib/crm-supabase";

const UM_ANO_S = 365 * 24 * 60 * 60;
const FOTO_KV_TTL_S = 30 * 24 * 60 * 60;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function chaveFotoKv(versao: string): string {
  return `produto-foto:${versao}`;
}

function fotoResponse(
  bytes: ArrayBuffer,
  contentType: string,
  versao: string,
  imutavel: boolean,
): Response {
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      // O front pede ?v=<foto_path>, que muda a cada upload: com a versao certa o
      // navegador pode guardar a foto de vez em vez de baixar de novo a cada hora.
      "cache-control": imutavel
        ? `private, max-age=${UM_ANO_S}, immutable`
        : "private, max-age=3600",
      etag: `"${Buffer.from(versao).toString("base64url")}"`,
    },
  });
}

function isProdutoFotoArquivo(value: unknown): value is ProdutoFotoArquivo {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProdutoFotoArquivo).arrayBuffer === "function" &&
    typeof (value as ProdutoFotoArquivo).type === "string" &&
    typeof (value as ProdutoFotoArquivo).size === "number"
  );
}

export const Route = createFileRoute("/api/crm/produtos/foto")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const sku = url.searchParams.get("sku")?.trim() ?? "";
          if (!sku) {
            return json({ ok: false, erro: "SKU obrigatorio" }, { status: 400 });
          }

          // Cache no KV do Cloudflare: cada foto sai do Supabase uma vez so (egress).
          const versao = url.searchParams.get("v")?.trim() ?? "";
          const { CRM_CACHE } = await cloudflareBindings();
          if (CRM_CACHE && versao) {
            const cache = await CRM_CACHE.getWithMetadata<{ contentType?: string }>(
              chaveFotoKv(versao),
              "arrayBuffer",
            ).catch((error) => {
              console.error("[crm.produtos.foto] erro_ler_kv", error);
              return null;
            });
            if (cache?.value) {
              return fotoResponse(
                cache.value,
                cache.metadata?.contentType ?? "image/jpeg",
                versao,
                true,
              );
            }
          }

          const foto = await buscarProdutoFotoCrm(sku);
          if (!foto) {
            return json({ ok: false, erro: "Foto nao encontrada" }, { status: 404 });
          }

          if (CRM_CACHE) {
            await CRM_CACHE.put(chaveFotoKv(foto.cacheKey), foto.bytes, {
              expirationTtl: FOTO_KV_TTL_S,
              metadata: { contentType: foto.contentType },
            }).catch((error) => console.error("[crm.produtos.foto] erro_gravar_kv", error));
          }

          return fotoResponse(
            foto.bytes,
            foto.contentType,
            foto.cacheKey,
            versao === foto.cacheKey,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const sku = String(formData.get("sku") ?? "").trim();
          const foto = formData.get("foto");

          if (!sku || !isProdutoFotoArquivo(foto)) {
            return json({ ok: false, erro: "SKU e foto sao obrigatorios" }, { status: 400 });
          }

          return json(await salvarProdutoFotoCrm(sku, foto));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const sku = typeof body.sku === "string" ? body.sku.trim() : "";

          if (!sku) {
            return json({ ok: false, erro: "SKU obrigatorio" }, { status: 400 });
          }

          return json(await removerProdutoFotoCrm(sku));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
