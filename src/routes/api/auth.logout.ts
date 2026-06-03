import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createLogoutCookie } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json(
          { ok: true },
          {
            headers: {
              "set-cookie": createLogoutCookie(),
            },
          },
        );
      },
    },
  },
});
