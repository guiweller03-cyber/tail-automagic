import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, LockKeyhole, Moon, PawPrint, ShieldCheck, Sun } from "lucide-react";
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 size-[420px] rounded-full bg-primary/[0.05] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 size-[480px] rounded-full bg-accent/[0.08] blur-3xl"
      />
      <button
        type="button"
        onClick={() => setDarkMode((current) => !current)}
        aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
        title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
        className="absolute right-5 top-5 z-10 grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary"
      >
        {darkMode ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>
      <div className="relative grid w-full max-w-[980px] overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_80px_-36px_rgba(15,23,42,0.22)] lg:min-h-[600px] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-primary/20 p-10 text-foreground lg:flex xl:p-12">
          <div
            aria-hidden
            className="absolute -right-20 top-20 size-80 rounded-full border border-foreground/10"
          />
          <div
            aria-hidden
            className="absolute -right-5 top-36 size-56 rounded-full border border-foreground/10"
          />
          <div
            aria-hidden
            className="absolute -bottom-36 -left-20 size-80 rounded-full bg-primary/15 blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <PawPrint className="size-6" />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">Mundo Pet</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                CRM inteligente
              </span>
            </span>
          </div>
          <div className="relative max-w-[410px]">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/80">
              <span className="size-1.5 rounded-full bg-success" /> Tudo em um só lugar
            </span>
            <h2 className="text-[39px] font-bold leading-[1.13] tracking-[-0.04em]">
              Seu dia de trabalho, mais claro.
            </h2>
            <p className="mt-5 text-[15px] leading-7 text-muted-foreground">
              Atendimento, clientes, pedidos e resultados organizados para você cuidar de cada
              venda.
            </p>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> Acesso protegido para a equipe Mundo Pet
          </div>
        </section>

        <section className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <PawPrint className="size-5" />
            </span>
            <span>
              <span className="block font-extrabold tracking-tight">Mundo Pet</span>
              <span className="block text-[11px] text-muted-foreground">CRM inteligente</span>
            </span>
          </div>
          <div className="mb-8">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Bem-vindo de volta
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">Entre na sua conta</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Acesse o espaço de trabalho da Mundo Pet.
            </p>
          </div>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="login" className="text-xs font-semibold">
                Login
              </Label>
              <Input
                id="login"
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Seu e-mail de acesso"
                required
                className="h-12 rounded-xl border-border bg-secondary/60 px-4 focus-visible:ring-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
                className="h-12 rounded-xl border-border bg-secondary/60 px-4 focus-visible:ring-primary/20"
              />
            </div>
            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-xl text-sm font-bold shadow-sm"
              disabled={loading}
            >
              {loading ? (
                "Entrando..."
              ) : (
                <span className="inline-flex items-center gap-2">
                  Entrar no CRM <ArrowRight className="size-4" />
                </span>
              )}
            </Button>
          </form>
          <p className="mt-10 text-center text-xs text-muted-foreground">
            Acesso exclusivo para administradores cadastrados.
          </p>
        </section>
      </div>
    </main>
  );
}
