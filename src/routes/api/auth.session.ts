import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getCurrentSession } from "@/lib/auth";
import { lojaOperacional } from "@/lib/loja-context";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getCurrentSession(request);

        return Response.json({ ok: Boolean(session), admin: session?.admin ?? null, loja: session?.loja ?? "loja1", loja2Operacional: lojaOperacional("loja2") }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
