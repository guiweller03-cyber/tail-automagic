import { clientes, type Cliente } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Plus, MessageCircle, Phone, X, Pencil, History, ShoppingBag, MapPin, Tag } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Clientes() {
  const [filter, setFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Cliente | null>(null);
  const [tab, setTab] = useState<"perfil" | "historico">("perfil");

  const list = clientes.filter(c => {
    const ok = filter === "Todos" || c.perfil === filter;
    const s = search.toLowerCase();
    return ok && (!s || c.nome.toLowerCase().includes(s) || c.telefone.includes(s) || c.pets.some(p=>p.toLowerCase().includes(s)));
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clientes.length} tutores · {clientes.reduce((s,c)=>s+c.pets.length,0)} pets cadastrados</p>
        </div>
        <button className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2">
          <Plus className="size-4" /> Novo cliente
        </button>
      </div>

      <div className="card-soft p-3 flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none" placeholder="Buscar por nome, pet ou telefone..." />
        </div>
        {["Todos", "VIP", "Premium", "Econômico", "Risco"].map((f) => (
          <button key={f} onClick={()=>setFilter(f)} className={`h-10 px-3.5 rounded-lg text-sm font-medium ${filter===f ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/70"}`}>{f}</button>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr className="text-xs text-muted-foreground text-left">
                <th className="font-medium px-4 py-3">Cliente</th>
                <th className="font-medium px-4 py-3">Pets</th>
                <th className="font-medium px-4 py-3 hidden md:table-cell">Origem</th>
                <th className="font-medium px-4 py-3 hidden lg:table-cell">Bairro</th>
                <th className="font-medium px-4 py-3">Ticket</th>
                <th className="font-medium px-4 py-3">Perfil</th>
                <th className="font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/30 cursor-pointer" onClick={()=>{setActive(c); setTab("perfil");}}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-primary/15 text-primary font-semibold text-xs grid place-items-center">
                        {c.nome.split(" ").map(n=>n[0]).slice(0,2).join("")}
                      </div>
                      <div>
                        <div className="font-semibold">{c.nome}</div>
                        <div className="text-xs text-muted-foreground">{c.telefone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{c.pets.map(p=>"🐾 "+p).join(", ")}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary">{c.origem}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{c.bairro}</td>
                  <td className="px-4 py-3 font-semibold">{brl(c.ticket)}</td>
                  <td className="px-4 py-3"><StatusBadge value={c.perfil} /></td>
                  <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                    <div className="flex gap-1">
                      <a href={`https://wa.me/55${c.telefone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-success/10 text-success" title="WhatsApp"><MessageCircle className="size-4" /></a>
                      <a href={`tel:${c.telefone.replace(/\D/g,"")}`} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Ligar"><Phone className="size-4" /></a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-foreground/40 backdrop-blur-sm" onClick={()=>setActive(null)}>
          <div onClick={e=>e.stopPropagation()} className="bg-card w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border flex items-start gap-4">
              <div className="size-12 rounded-2xl bg-primary/15 grid place-items-center text-primary font-bold">
                {active.nome.split(" ").map(n=>n[0]).slice(0,2).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg">{active.nome}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><MapPin className="size-3" /> {active.endereco} · {active.bairro}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{active.telefone}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge value={active.perfil} />
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-primary/10 text-primary inline-flex items-center gap-1"><Tag className="size-3" />{active.origem}</span>
                </div>
              </div>
              <button onClick={()=>setActive(null)} className="p-2 rounded-lg hover:bg-secondary"><X className="size-5" /></button>
            </div>

            <div className="px-5 pt-3 flex gap-2 border-b border-border">
              {(["perfil","historico"] as const).map(t => (
                <button key={t} onClick={()=>setTab(t)} className={`px-3 py-2 text-sm font-semibold capitalize border-b-2 ${tab===t?"border-primary text-foreground":"border-transparent text-muted-foreground"}`}>{t}</button>
              ))}
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              {tab === "perfil" ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Mini label="Total gasto" value={brl(active.totalGasto)} />
                    <Mini label="Lucro líquido" value={brl(active.lucroLiquido)} accent />
                    <Mini label="Descontos" value={brl(active.totalDescontos)} />
                    <Mini label="Ticket médio" value={brl(active.ticket)} />
                    <Mini label="Pedidos" value={String(active.pedidos)} />
                    <Mini label="Próx. recompra" value={active.proxRecompra} />
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Aquisição</div>
                    <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                      <span className="text-muted-foreground">Origem</span><span className="font-medium">{active.origem}</span>
                      {active.campanha && (<><span className="text-muted-foreground">Campanha</span><span className="font-medium">{active.campanha}</span></>)}
                      {active.cupom && (<><span className="text-muted-foreground">Cupom</span><span className="font-medium">{active.cupom}</span></>)}
                      {active.influenciador && (<><span className="text-muted-foreground">Influenciador</span><span className="font-medium">{active.influenciador}</span></>)}
                      <span className="text-muted-foreground">CAC estimado</span><span className="font-medium">{brl(active.cac)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Pets</div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {active.pets.map(p => (
                        <div key={p} className="rounded-xl bg-secondary p-3">
                          <div className="font-semibold text-sm">🐾 {p}</div>
                          <div className="text-xs text-muted-foreground">Frequência: {active.frequencia}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {[
                    { d: "13/05", t: "Pedido #10238 entregue · Ração Golden 15kg", v: 189.9 },
                    { d: "15/04", t: "Upsell aceito · Petisco natural", v: 36 },
                    { d: "10/04", t: "Pedido #10120 · Banho + Tosa", v: 95 },
                    { d: "02/04", t: "Reclamação resolvida · Atraso entrega", v: 0 },
                    { d: "20/03", t: "Pedido #10044 · Antipulga + Ração", v: 218 },
                  ].map((h,i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                      <div className="size-8 rounded-lg bg-primary/15 grid place-items-center text-primary"><History className="size-4" /></div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{h.t}</div>
                        <div className="text-[11px] text-muted-foreground">{h.d}</div>
                      </div>
                      {h.v > 0 && <span className="font-semibold text-sm">{brl(h.v)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex flex-wrap gap-2">
              <a href={`https://wa.me/55${active.telefone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[140px] h-10 px-4 rounded-xl bg-success text-success-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"><MessageCircle className="size-4" /> WhatsApp</a>
              <button className="flex-1 min-w-[140px] h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center justify-center gap-2"><ShoppingBag className="size-4" /> Adicionar pedido</button>
              <button className="h-10 px-4 rounded-xl bg-secondary text-foreground text-sm font-semibold inline-flex items-center justify-center gap-2"><Pencil className="size-4" /> Editar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? "bg-success/10" : "bg-secondary"}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${accent ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}
