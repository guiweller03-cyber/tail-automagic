import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createSessionCookie, verifyAdminCredentials } from "@/lib/auth";
import { cloudflareBindings } from "@/lib/cloudflare-env";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { CRM_API_RATE_LIMIT } = await cloudflareBindings();
          const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
          if (CRM_API_RATE_LIMIT && !(await CRM_API_RATE_LIMIT.limit({ key: `login:${ip}` })).success) {
            return json({ ok: false, erro: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
          }
          const body = (await request.json()) as { login?: unknown; password?: unknown };
          const login = typeof body.login === "string" ? body.login : "";
          const password = typeof body.password === "string" ? body.password : "";
          const admin = verifyAdminCredentials(login, password);

          if (!admin) {
            return json({ ok: false, erro: "Login ou senha invalidos" }, { status: 401 });
          }

          return json(
            { ok: true, admin },
            {
              headers: {
                "set-cookie": await createSessionCookie(admin, request),
              },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
