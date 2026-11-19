import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createSessionCookie, getCurrentSession } from "@/lib/auth";
import { lojaOperacional, type LojaId } from "@/lib/loja-context";

export const Route = createFileRoute("/api/auth/loja")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getCurrentSession(request);
        if (!session) return Response.json({ ok: false }, { status: 401 });
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return Response.json({ ok: false }, { status: 403 });
        }
        const body = await request.json().catch(() => null) as { loja?: unknown } | null;
        if (body?.loja !== "loja1" && body?.loja !== "loja2") {
          return Response.json({ ok: false, erro: "Loja inválida" }, { status: 400 });
        }
        const loja: LojaId = body.loja;
        return Response.json(
          { ok: true, loja, operacional: lojaOperacional(loja) },
          { headers: { "set-cookie": await createSessionCookie(session.admin, request, loja), "cache-control": "no-store" } },
        );
      },
    },
  },
});
