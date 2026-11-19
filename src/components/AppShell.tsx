import { GlobalSearch } from "@/components/GlobalSearch";
import { Link, Outlet, useLocation, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  ShoppingBag,
  Store,
  Truck,
  Boxes,
  Wallet,
  Megaphone,
  Zap,
  PawPrint,
  Menu,
  X,
  ChevronDown,
  Sparkles,
  PackageSearch,
  ArrowRightLeft,
  Gift,
  RefreshCw,
  Moon,
  Sun,
  LogOut,
  FileText,
  Send,
  ListFilter,
  MessageSquareCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { dispatchCrmReload } from "@/lib/crm-refresh";
import { GlobalSearchContext } from "@/lib/global-search";
import { LojaContext } from "@/lib/loja-ui";
import type { LojaId } from "@/lib/loja-context";
import { toast } from "sonner";

const navGroups = [
  {
    label: "Visão geral",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/leads-totais", label: "Leads totais", icon: Users },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { to: "/conversas", label: "WhatsApp IA", icon: MessageCircle },
      { to: "/assistente", label: "Assistente IA", icon: Sparkles },
      { to: "/clientes", label: "Clientes", icon: Users },
      { to: "/pets", label: "Pets", icon: PawPrint },
      { to: "/notas", label: "Notas", icon: FileText },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/pedidos", label: "Pedidos", icon: ShoppingBag },
      { to: "/pdv", label: "PDV", icon: Store },
      { to: "/entregas", label: "Entregas", icon: Truck },
      { to: "/estoque", label: "Estoque", icon: Boxes },
      { to: "/produtos-procurados", label: "Produtos procurados", icon: PackageSearch },
    ],
  },
  {
    label: "Crescimento",
    items: [
      { to: "/financeiro", label: "Financeiro", icon: Wallet },
      { to: "/recompra-prevista", label: "Recompra prevista", icon: ArrowRightLeft },
      { to: "/painel-recompra", label: "Painel de recompra", icon: ListFilter },
      { to: "/aprovacoes-recompra", label: "Aprovar recompras", icon: MessageSquareCheck },
      { to: "/indicacoes", label: "Indicações", icon: Gift },
      { to: "/campanhas", label: "Campanhas", icon: Megaphone },
      { to: "/disparos", label: "Disparos", icon: Send },
      { to: "/automacoes", label: "Automações", icon: Zap },
    ],
  },
] as const;
const nav = navGroups.flatMap((group) => [...group.items]);

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [loja, setLoja] = useState<LojaId>("loja1");
  const [trocandoLoja, setTrocandoLoja] = useState(false);
  const [loja2Operacional, setLoja2Operacional] = useState(false);
  const [sessaoPronta, setSessaoPronta] = useState(false);
  const loc = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          ok?: boolean;
          loja?: LojaId;
          loja2Operacional?: boolean;
        };
        if (!data.ok) {
          window.location.assign("/login");
          return;
        }
        setLoja(data.loja === "loja2" ? "loja2" : "loja1");
        window.sessionStorage.setItem("crm_loja", data.loja === "loja2" ? "loja2" : "loja1");
        setLoja2Operacional(Boolean(data.loja2Operacional));
        setSessaoPronta(true);
      })
      .catch(() => toast.error("Não foi possível verificar a sessão"));
  }, []);

  async function trocarLoja(proxima: LojaId) {
    if (proxima === loja || trocandoLoja) return;
    setTrocandoLoja(true);
    try {
      const response = await fetch("/api/auth/loja", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loja: proxima }),
      });
      if (!response.ok) throw new Error("Falha ao trocar de loja");
      queryClient.clear();
      window.sessionStorage.setItem("crm_loja", proxima);
      window.location.assign("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao trocar de loja");
      setTrocandoLoja(false);
    }
  }

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

  async function reloadCrm() {
    if (reloading) return;

    setReloading(true);
    dispatchCrmReload();

    try {
      await Promise.all([router.invalidate(), queryClient.invalidateQueries()]);
    } finally {
      setReloading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    queryClient.clear();
    window.location.assign("/login");
  }

  const pageTitle = nav.find((item) => item.to === loc.pathname)?.label ?? "Mundo Pet";
  const lojaOperacional = loja === "loja1" || loja2Operacional;

  return (
    <LojaContext.Provider value={loja}>
      <GlobalSearchContext.Provider value={{ query: globalSearch, setQuery: setGlobalSearch }}>
        <div className="min-h-screen bg-background lg:pl-[260px]">
          <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
            <Brand />
            <SidebarStore loja={loja} operacional={lojaOperacional} />
            <NavList currentPath={loc.pathname} />
            <SidebarFooter
              darkMode={darkMode}
              onTheme={() => setDarkMode((v) => !v)}
              onLogout={logout}
            />
          </aside>

          {open && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <button
                type="button"
                aria-label="Fechar menu"
                className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />
              <aside className="relative flex h-full w-[min(290px,calc(100vw-2.5rem))] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl">
                <div className="flex items-start justify-between">
                  <Brand />
                  <button
                    type="button"
                    aria-label="Fechar menu"
                    onClick={() => setOpen(false)}
                    className="mr-4 mt-5 rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <SidebarStore loja={loja} operacional={lojaOperacional} />
                <NavList currentPath={loc.pathname} onNavigate={() => setOpen(false)} />
                <SidebarFooter
                  darkMode={darkMode}
                  onTheme={() => setDarkMode((v) => !v)}
                  onLogout={logout}
                />
              </aside>
            </div>
          )}

          <div className="min-w-0">
            <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-3">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setOpen(true)}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground lg:hidden"
                >
                  <Menu className="size-5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Mundo Pet / CRM
                  </p>
                  <p className="truncate text-base font-bold leading-tight tracking-tight sm:text-lg">
                    {pageTitle}
                  </p>
                </div>
                <div className="order-3 w-full sm:order-none sm:ml-auto sm:min-w-[200px] sm:max-w-[360px] sm:flex-1">
                  <GlobalSearch />
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
                  <div className="relative">
                    <select
                      aria-label="Loja ativa"
                      value={loja}
                      disabled={trocandoLoja}
                      onChange={(event) => void trocarLoja(event.target.value as LojaId)}
                      className="h-10 min-w-[108px] appearance-none rounded-xl border border-border bg-secondary py-2 pl-3 pr-8 text-sm font-bold text-foreground outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 xl:min-w-[126px]"
                    >
                      <option value="loja1">Loja 1</option>
                      <option value="loja2">Loja Tijucas{loja2Operacional ? "" : " · preparar"}</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                  <button
                    type="button"
                    onClick={() => void reloadCrm()}
                    disabled={reloading}
                    aria-label="Atualizar CRM"
                    title="Atualizar CRM"
                    className="grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-[18px]", reloading && "animate-spin")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDarkMode((v) => !v)}
                    aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
                    title={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
                    className="hidden size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-primary md:grid"
                  >
                    {darkMode ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                  </button>
                </div>
              </div>
            </header>

            <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-[1680px] min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              {sessaoPronta && !lojaOperacional ? (
                <div
                  role="status"
                  className="mx-auto mt-10 max-w-2xl rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-10"
                >
                  <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Store className="size-7" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                    Loja Tijucas
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    Estamos preparando esta loja
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                    Os dados desta loja ficarão separados. O acesso será liberado após configurar
                    Supabase, Uazapi e o webhook.
                  </p>
                  <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground">
                    <span className="size-2 rounded-full bg-accent" /> Aguardando ativação
                  </div>
                </div>
              ) : sessaoPronta ? (
                <Outlet />
              ) : (
                <div role="status" className="animate-pulse space-y-4">
                  <div className="h-9 w-64 rounded-xl bg-secondary" />
                  <div className="h-36 rounded-2xl bg-secondary" />
                  <div className="h-36 rounded-2xl bg-secondary" />
                </div>
              )}
            </main>
          </div>
        </div>
      </GlobalSearchContext.Provider>
    </LojaContext.Provider>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 px-5 pb-5 pt-6 text-sidebar-foreground">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <PawPrint className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-extrabold leading-tight tracking-tight">
          Mundo Pet
        </span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/55">
          CRM inteligente
        </span>
      </span>
    </Link>
  );
}

function SidebarStore({ loja, operacional }: { loja: LojaId; operacional: boolean }) {
  return (
    <div className="mx-3 mb-4 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-sidebar-accent-foreground">
        <Store className="size-[17px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">{loja === "loja1" ? "Loja 1" : "Loja Tijucas"}</p>
        <p className="mt-0.5 truncate text-[11px] text-sidebar-foreground/55">
          {operacional ? "Ambiente ativo" : "Em preparação"}
        </p>
      </div>
      <span className={cn("size-2 rounded-full", operacional ? "bg-success" : "bg-accent")} />
    </div>
  );
}

function NavList({ currentPath, onNavigate }: { currentPath: string; onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Navegação principal"
      className="flex-1 space-y-5 overflow-y-auto px-3 pb-5 scrollbar-thin"
    >
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = currentPath === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-9 items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                    active
                      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[17px] shrink-0",
                      active
                        ? "text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground",
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({
  darkMode,
  onTheme,
  onLogout,
}: {
  darkMode: boolean;
  onTheme: () => void;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/20 text-xs font-bold text-primary">
          MP
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Mundo Pet</p>
          <p className="text-[11px] text-sidebar-foreground/50">Sessão administrativa</p>
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          onClick={onTheme}
          className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {darkMode ? "Modo claro" : "Modo escuro"}
        </button>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-sidebar-foreground/65 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </div>
  );
}
