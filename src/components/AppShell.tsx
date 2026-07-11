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
  Search,
  Bell,
  Menu,
  X,
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
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { dispatchCrmReload } from "@/lib/crm-refresh";
import { GlobalSearchContext } from "@/lib/global-search";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads-totais", label: "Leads totais", icon: Users },
  { to: "/conversas", label: "WhatsApp IA", icon: MessageCircle },
  { to: "/assistente", label: "Assistente IA", icon: Sparkles },
  { to: "/notas", label: "Notas", icon: FileText },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/pets", label: "Pets", icon: PawPrint },
  { to: "/indicacoes", label: "Indicações", icon: Gift },
  { to: "/recompra-prevista", label: "Recompra Prevista", icon: ArrowRightLeft },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/pdv", label: "PDV", icon: Store },
  { to: "/entregas", label: "Entregas", icon: Truck },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/produtos-procurados", label: "Procurados", icon: PackageSearch },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/disparos", label: "Disparos", icon: Send },
  { to: "/automacoes", label: "Automações", icon: Zap },
] as const;

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const loc = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  return (
    <GlobalSearchContext.Provider value={{ query: globalSearch, setQuery: setGlobalSearch }}>
      <div className="min-h-screen bg-background overflow-x-hidden lg:pl-64">
        {/* Sidebar desktop */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <Brand />
          <NavList currentPath={loc.pathname} />
          <UserCard />
        </aside>

        {/* Sidebar mobile */}
        {open && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
            <aside className="relative w-[min(18rem,calc(100vw-2rem))] bg-sidebar h-full flex flex-col shadow-xl">
              <div className="flex items-center justify-between p-4">
                <Brand />
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg hover:bg-secondary"
                >
                  <X className="size-5" />
                </button>
              </div>
              <NavList currentPath={loc.pathname} onNavigate={() => setOpen(false)} />
              <div className="px-3 pb-2">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <LogOut className="size-[18px]" />
                  <span>Sair</span>
                </button>
              </div>
              <UserCard />
            </aside>
          </div>
        )}

        <div className="min-w-0 flex flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 min-h-12 bg-background/90 backdrop-blur border-b border-border flex items-center gap-2 px-3 py-1.5 sm:h-16 sm:gap-3 sm:px-4 lg:px-8">
            <button
              className="lg:hidden grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary sm:size-10"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <div className="flex-1 max-w-xl relative hidden sm:block">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                aria-label="Busca global"
                placeholder="Buscar cliente, pet, pedido…"
                className="w-full h-10 pl-9 pr-4 rounded-xl bg-secondary border border-transparent focus:border-primary focus:bg-card outline-none text-sm transition"
              />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => void reloadCrm()}
                disabled={reloading}
                aria-label="Atualizar CRM"
                title="Atualizar CRM"
                className="grid size-9 place-items-center rounded-lg bg-secondary hover:bg-secondary/70 transition disabled:opacity-60 disabled:cursor-not-allowed sm:size-10 sm:rounded-xl"
              >
                <RefreshCw className={cn("size-5", reloading && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={() => setDarkMode((current) => !current)}
                aria-label={darkMode ? "Ativar modo claro" : "Ativar modo escuro"}
                title={darkMode ? "Modo claro" : "Modo escuro"}
                className="hidden size-10 place-items-center rounded-xl bg-secondary hover:bg-secondary/70 transition sm:grid"
              >
                {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                aria-label="Sair"
                title="Sair"
                className="hidden size-10 place-items-center rounded-xl bg-secondary hover:bg-secondary/70 transition sm:grid"
              >
                <LogOut className="size-5" />
              </button>
              <button className="relative hidden size-10 place-items-center rounded-xl bg-secondary hover:bg-secondary/70 md:grid">
                <Bell className="size-5" />
              </button>
              <div className="hidden sm:flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-secondary">
                <div className="size-7 rounded-lg bg-primary/20 grid place-items-center text-primary font-semibold text-xs">
                  MP
                </div>
                <div className="text-xs leading-tight">
                  <div className="font-semibold">Mundo Pet</div>
                  <div className="text-muted-foreground">Loja Vila Mariana</div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-3 py-3 sm:px-4 sm:py-6 lg:px-8 lg:py-8 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </GlobalSearchContext.Provider>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-5 pt-6 pb-4">
      <div className="size-10 rounded-2xl bg-primary grid place-items-center shadow-sm">
        <PawPrint className="size-5 text-primary-foreground" />
      </div>
      <div>
        <div className="font-bold text-base leading-tight">Mundo Pet</div>
        <div className="text-[11px] text-muted-foreground -mt-0.5">CRM inteligente</div>
      </div>
    </Link>
  );
}

function NavList({ currentPath, onNavigate }: { currentPath: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 px-3 pt-2 space-y-0.5 overflow-y-auto scrollbar-thin">
      {nav.map((item) => {
        const active = currentPath === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-[18px]", active && "text-primary")} />
            <span className="flex-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard() {
  return (
    <div className="m-3 p-4 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 border border-primary/20">
      <div className="text-xs font-semibold text-foreground">Relatorio IA</div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Resumo disponivel quando houver dados reais suficientes.
      </p>
      <button className="mt-3 w-full text-xs font-semibold py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition">
        Ativar resumo diário
      </button>
    </div>
  );
}
