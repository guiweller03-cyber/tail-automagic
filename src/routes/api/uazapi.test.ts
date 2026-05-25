import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/uazapi/test")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const baseUrl = process.env.UAZAPI_URL;
          const token = process.env.UAZAPI_TOKEN;

          if (!baseUrl) {
            throw new Error("Missing environment variable: UAZAPI_URL");
          }

          if (!token) {
            throw new Error("Missing environment variable: UAZAPI_TOKEN");
          }

          const response = await fetch(`${baseUrl.replace(/\/$/, "")}/instance/status`, {
            method: "GET",
            headers: { token },
          });

          const data = (await response.json()) as {
            instance?: Record<string, unknown>;
            [key: string]: unknown;
          };
          const instance = data.instance;

          return json(
            instance
              ? {
                  instance: {
                    id: instance.id,
                    status: instance.status,
                    name: instance.name,
                    profileName: instance.profileName,
                  },
                }
              : { ok: response.ok, status: response.status },
            { status: response.status },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
