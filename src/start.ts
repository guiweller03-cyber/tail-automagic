import { createStart, createMiddleware } from "@tanstack/react-start";

import { getCurrentAdmin, hasConfiguredAdmins } from "./lib/auth";
import { renderErrorPage } from "./lib/error-page";

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/img/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhook/") ||
    pathname === "/api/mercadopago/webhook" ||
    pathname === "/api/uazapi/test" ||
    isStaticAsset(pathname)
  );
}

function redirectToLogin(request: Request, pathname: string): Response {
  const url = new URL(request.url);
  const loginUrl = new URL("/login", url.origin);
  loginUrl.searchParams.set("redirect", `${pathname}${url.search}`);

  return Response.redirect(loginUrl, 302);
}

const authMiddleware = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, next }) => {
    if (isPublicRoute(pathname)) {
      return next();
    }

    if (process.env.NODE_ENV !== "production" && !hasConfiguredAdmins()) {
      return next();
    }

    const admin = await getCurrentAdmin(request);
    if (admin) {
      return next();
    }

    if (pathname.startsWith("/api/crm/")) {
      return Response.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });
    }

    return redirectToLogin(request, pathname);
  },
);

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, authMiddleware],
}));
