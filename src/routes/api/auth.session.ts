import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { getCurrentAdmin } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await getCurrentAdmin(request);

        return Response.json({ ok: Boolean(admin), admin });
      },
    },
  },
});
