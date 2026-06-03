import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole, Moon, PawPrint, Sun } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/login")) return "/";

  return value;
}

async function hasActiveSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return false;

    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    void hasActiveSession().then((authenticated) => {
      if (authenticated) {
        window.location.assign(safeRedirect(redirect));
      }
    });
  }, [redirect]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    setDarkMode(savedTheme ? savedTheme === "dark" : prefersDark);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;

    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode, themeReady]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const payload = (await response.json()) as { ok?: boolean; erro?: string };

      if (!response.ok || !payload.ok) {
        toast.error(payload.erro ?? "Login ou senha invalidos");
        return;
      }

      window.location.assign(safeRedirect(redirect));
    } catch {
      toast.error("Nao foi possivel entrar agora");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <button
        type="button"
        onClick={() => setDarkMode((current) => !current)}
        aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
        title={darkMode ? "Modo claro" : "Modo escuro"}
        className="fixed right-4 top-4 z-10 grid size-10 place-items-center rounded-md border border-border bg-card shadow-sm transition hover:bg-secondary"
      >
        {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm lg:grid-cols-[1fr_420px]">
          <section className="hidden bg-secondary/70 p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                <PawPrint className="size-5" />
              </div>
              <div>
                <div className="text-lg font-bold">Mundo Pet</div>
                <div className="text-sm text-muted-foreground">CRM inteligente</div>
              </div>
            </div>
            <div>
              <p className="max-w-md text-3xl font-bold leading-tight">
                Acesso restrito aos administradores do CRM.
              </p>
              <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
                Use um dos dois logins cadastrados no ambiente para visualizar vendas, clientes,
                pedidos e automacoes.
              </p>
            </div>
          </section>

          <section className="p-6 sm:p-8">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
                <PawPrint className="size-5" />
              </div>
              <div>
                <div className="font-bold">Mundo Pet</div>
                <div className="text-xs text-muted-foreground">CRM inteligente</div>
              </div>
            </div>

            <div className="mb-7">
              <div className="mb-4 grid size-11 place-items-center rounded-lg bg-secondary">
                <LockKeyhole className="size-5 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Entrar no CRM</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Informe seu login de administrador para continuar.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="login">Login</Label>
                <Input
                  id="login"
                  autoComplete="username"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  placeholder="admin@mundopet.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                  required
                />
              </div>
              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
