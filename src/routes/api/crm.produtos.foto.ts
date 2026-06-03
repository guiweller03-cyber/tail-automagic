import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  removerProdutoFotoCrm,
  salvarProdutoFotoCrm,
  type ProdutoFotoArquivo,
} from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function isProdutoFotoArquivo(value: FormDataEntryValue | null): value is ProdutoFotoArquivo {
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
