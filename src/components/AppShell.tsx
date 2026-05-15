import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, MessageCircle, Users, ShoppingBag, Store, Truck,
  Boxes, Wallet, Megaphone, Zap, PawPrint, Search, Bell, Menu, X,
  Sparkles, PackageSearch, ArrowRightLeft, Gift
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/conversas", label: "WhatsApp IA", icon: MessageCircle, badge: 6 },
  { to: "/assistente", label: "Assistente IA", icon: Sparkles },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/indicacoes", label: "Indicações", icon: Gift },
  { to: "/recompra-prevista", label: "Recompra Prevista", icon: ArrowRightLeft, badge: 4 },
  { to: "/pedidos", label: "Pedidos", icon: ShoppingBag, badge: 3 },
  { to: "/pdv", label: "PDV", icon: Store },
  { to: "/entregas", label: "Entregas", icon: Truck },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/produtos-procurados", label: "Procurados", icon: PackageSearch, badge: 6 },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/automacoes", label: "Automações", icon: Zap },
] as const;

export function AppShell() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sticky top-0 h-screen">
        <Brand />
        <NavList currentPath={loc.pathname} />
        <UserCard />
      </aside>

      {/* Sidebar mobile */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-sidebar h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4">
              <Brand />
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-secondary">
                <X className="size-5" />
              </button>
            </div>
            <NavList currentPath={loc.pathname} onNavigate={() => setOpen(false)} />
            <UserCard />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur border-b border-border flex items-center gap-3 px-4 lg:px-8">
          <button className="lg:hidden p-2 rounded-lg hover:bg-secondary" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="flex-1 max-w-xl relative hidden sm:block">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar cliente, pet, pedido…"
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-secondary border border-transparent focus:border-primary focus:bg-card outline-none text-sm transition"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative p-2.5 rounded-xl bg-secondary hover:bg-secondary/70">
              <Bell className="size-5" />
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />
            </button>
            <div className="hidden sm:flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-secondary">
              <div className="size-7 rounded-lg bg-primary/20 grid place-items-center text-primary font-semibold text-xs">MP</div>
              <div className="text-xs leading-tight">
                <div className="font-semibold">Mundo Pet</div>
                <div className="text-muted-foreground">Loja Vila Mariana</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
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
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
          >
            <Icon className={cn("size-[18px]", active && "text-primary")} />
            <span className="flex-1">{item.label}</span>
            {"badge" in item && item.badge ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard() {
  return (
    <div className="m-3 p-4 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 border border-primary/20">
      <div className="text-xs font-semibold text-foreground">Relatório IA · 22h</div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Hoje você vendeu R$ 4.870. Deseja receber o resumo no seu WhatsApp?
      </p>
      <button className="mt-3 w-full text-xs font-semibold py-2 rounded-lg bg-foreground text-background hover:opacity-90 transition">
        Ativar resumo diário
      </button>
    </div>
  );
}
