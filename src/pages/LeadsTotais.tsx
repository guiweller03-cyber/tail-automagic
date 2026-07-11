import type { Cliente } from "@/lib/crm-types";
import { MessageCircle, PawPrint, Search, ShoppingBag, Tag, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PERFIS = ["Todos", "Novo", "VIP", "Premium", "Econômico", "Risco"] as const;

type PerfilFiltro = (typeof PERFIS)[number];

export function LeadsTotais({ clientes }: { clientes: Cliente[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PerfilFiltro>("Todos");

  const leads = useMemo(() => {
    const termo = search.trim().toLowerCase();

    return clientes.filter((cliente) => {
      const matchesPerfil = filter === "Todos" || cliente.perfil === filter;
      if (!matchesPerfil) return false;
      if (!termo) return true;

      return (
        cliente.nome.toLowerCase().includes(termo) ||
        cliente.telefone.includes(termo.replace(/\D/g, "")) ||
        cliente.origem.toLowerCase().includes(termo) ||
        cliente.bairro.toLowerCase().includes(termo) ||
        cliente.pets.some((pet) => pet.toLowerCase().includes(termo))
      );
    });
  }, [clientes, filter, search]);

  const resumo = useMemo(() => {
    const totalGasto = clientes.reduce((total, cliente) => total + cliente.totalGasto, 0);
    const pedidos = clientes.reduce((total, cliente) => total + cliente.pedidos, 0);
    const ticketMedio = pedidos > 0 ? totalGasto / pedidos : 0;

    return {
      total: clientes.length,
      novos: clientes.filter((cliente) => cliente.perfil === "Novo").length,
      pedidos,
      ticketMedio,
    };
  }, [clientes]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Leads totais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todos os leads cadastrados no CRM, sem expirar por dia ou semana.
          </p>
        </div>
        <a
          href="/clientes"
          className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"
        >
          <Users className="size-4" /> Abrir clientes
        </a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ResumoCard icon={<Users />} label="Leads totais" value={String(resumo.total)} />
        <ResumoCard icon={<Tag />} label="Novos" value={String(resumo.novos)} />
        <ResumoCard
          icon={<ShoppingBag />}
          label="Pedidos vinculados"
          value={String(resumo.pedidos)}
        />
        <ResumoCard icon={<Wallet />} label="Ticket medio" value={brl(resumo.ticketMedio)} />
      </div>

      <div className="card-soft p-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:min-w-[220px] sm:flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none"
            placeholder="Buscar por nome, telefone, pet, origem ou bairro..."
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {PERFIS.map((perfil) => (
            <button
              key={perfil}
              onClick={() => setFilter(perfil)}
              className={`h-10 shrink-0 px-3.5 rounded-lg text-sm font-medium ${
                filter === perfil
                  ? "bg-foreground text-background"
                  : "bg-secondary hover:bg-secondary/70"
              }`}
            >
              {perfil}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground px-1">
        {leads.length} de {clientes.length} leads exibidos
      </div>

      <div className="grid gap-3 md:hidden">
        {leads.length === 0 ? (
          <EmptyState />
        ) : (
          leads.map((lead) => <LeadMobileCard key={lead.id} lead={lead} />)
        )}
      </div>

      <div className="card-soft hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Lead</th>
                <th className="font-medium px-4 py-3">Pets</th>
                <th className="font-medium px-4 py-3">Origem</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Ultima interacao</th>
                <th className="font-medium px-4 py-3">Ticket</th>
                <th className="font-medium px-4 py-3">Perfil</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState />
                  </td>
                </tr>
              ) : (
                leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResumoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card-soft p-4">
      <div className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center [&_svg]:size-4">
        {icon}
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-0.5 tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

function LeadAvatar({ lead }: { lead: Cliente }) {
  const initials = lead.nome
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="size-9 rounded-full bg-primary/15 text-primary font-semibold text-xs grid place-items-center shrink-0">
      {initials || <PawPrint className="size-4" />}
    </div>
  );
}

function LeadRow({ lead }: { lead: Cliente }) {
  return (
    <tr className="border-t border-border hover:bg-secondary/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <LeadAvatar lead={lead} />
          <div className="min-w-0">
            <div className="font-semibold truncate max-w-[220px]">{lead.nome}</div>
            <div className="text-xs text-muted-foreground">{lead.telefone}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {lead.pets.length ? lead.pets.join(", ") : "Sem pets"}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium">{lead.origem || "Sem origem"}</div>
        <div className="text-xs text-muted-foreground">{lead.bairro || "Sem bairro"}</div>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
        {lead.ultima || "Sem registro"}
      </td>
      <td className="px-4 py-3 font-semibold tabular-nums">{brl(lead.ticket)}</td>
      <td className="px-4 py-3">
        <StatusBadge value={lead.perfil} />
      </td>
      <td className="px-4 py-3 text-right">
        <a
          href={`https://wa.me/55${lead.telefone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="h-9 px-3 rounded-lg bg-success text-success-foreground text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      </td>
    </tr>
  );
}

function LeadMobileCard({ lead }: { lead: Cliente }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-start gap-3">
        <LeadAvatar lead={lead} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{lead.nome}</div>
              <div className="text-xs text-muted-foreground">{lead.telefone}</div>
            </div>
            <StatusBadge value={lead.perfil} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Mini label="Origem" value={lead.origem || "Sem origem"} />
            <Mini label="Ticket" value={brl(lead.ticket)} />
            <Mini label="Pets" value={lead.pets.length ? lead.pets.join(", ") : "Sem pets"} />
            <Mini label="Ultima" value={lead.ultima || "Sem registro"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-2 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-semibold">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
      Nenhum lead encontrado.
    </div>
  );
}
