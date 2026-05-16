import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ticket, Plus, Pencil, Trash2, Image as ImageIcon, Mic, Video,
  MessageCircle, X, Filter, Search, BarChart3, Eye, MousePointerClick, ShoppingCart,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

type CupomTipo = "percentual" | "fixo";
type CupomMarca = "Todas" | "Golden" | "Premier" | "Fórmula Natural" | "Royal Canin" | "Hills";

type Anexo = { tipo: "foto" | "audio" | "video"; nome: string; url?: string };

type Cupom = {
  id: string;
  codigo: string;
  desconto: number;
  tipo: CupomTipo;
  marca: CupomMarca;
  validade: string; // YYYY-MM-DD
  limiteUso: number;
  ativo: boolean;
  anexos: Anexo[];
  enviados: number;
  abertos: number;
  cliques: number;
  usos: number;
  faturamento: number;
  criadoEm: string;
};

const KEY = "cupons_v1";

const SEED: Cupom[] = [
  { id: "c1", codigo: "GABI10",  desconto: 10, tipo: "percentual", marca: "Golden",          validade: "2026-06-30", limiteUso: 100, ativo: true,  anexos: [{ tipo: "foto", nome: "banner-golden.jpg" }], enviados: 142, abertos: 118, cliques: 64, usos: 28, faturamento: 5880, criadoEm: "2026-05-01" },
  { id: "c2", codigo: "VOLTA15", desconto: 15, tipo: "percentual", marca: "Todas",           validade: "2026-05-31", limiteUso: 200, ativo: true,  anexos: [], enviados: 198, abertos: 132, cliques: 38, usos: 16, faturamento: 2410, criadoEm: "2026-04-20" },
  { id: "c3", codigo: "PREMIER20", desconto: 20, tipo: "percentual", marca: "Premier",       validade: "2026-06-15", limiteUso: 80,  ativo: true,  anexos: [{ tipo: "video", nome: "premier-gourmet.mp4" }], enviados: 86, abertos: 71, cliques: 42, usos: 19, faturamento: 4180, criadoEm: "2026-05-08" },
  { id: "c4", codigo: "BLACK50",  desconto: 50, tipo: "fixo",       marca: "Todas",          validade: "2025-11-30", limiteUso: 500, ativo: false, anexos: [], enviados: 410, abertos: 312, cliques: 188, usos: 142, faturamento: 28400, criadoEm: "2025-11-01" },
];

const MARCAS: CupomMarca[] = ["Todas", "Golden", "Premier", "Fórmula Natural", "Royal Canin", "Hills"];

function load(): Cupom[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SEED;
    return JSON.parse(raw) as Cupom[];
  } catch { return SEED; }
}

export function Cupons() {
  const [items, setItems] = useState<Cupom[]>(load);
  const [editing, setEditing] = useState<Cupom | null>(null);
  const [creating, setCreating] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroMarca, setFiltroMarca] = useState<CupomMarca | "all">("all");
  const [aba, setAba] = useState<"lista" | "envios">("lista");

  useEffect(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* noop */ }
  }, [items]);

  const filtrados = useMemo(() => items.filter((c) => {
    const q = busca.toLowerCase();
    const okBusca = !q || c.codigo.toLowerCase().includes(q) || c.marca.toLowerCase().includes(q);
    const okMarca = filtroMarca === "all" || c.marca === filtroMarca;
    return okBusca && okMarca;
  }), [items, busca, filtroMarca]);

  const totais = useMemo(() => ({
    ativos: items.filter((c) => c.ativo).length,
    enviados: items.reduce((s, c) => s + c.enviados, 0),
    usos: items.reduce((s, c) => s + c.usos, 0),
    faturamento: items.reduce((s, c) => s + c.faturamento, 0),
  }), [items]);

  function salvar(c: Cupom) {
    setItems((arr) => {
      const exists = arr.some((x) => x.id === c.id);
      return exists ? arr.map((x) => x.id === c.id ? c : x) : [c, ...arr];
    });
    toast.success(exists(items, c.id) ? "Cupom atualizado" : "Cupom criado");
    setEditing(null); setCreating(false);
  }
  function remover(id: string) {
    setItems((arr) => arr.filter((c) => c.id !== id));
    toast.success("Cupom removido");
  }
  function toggle(id: string) {
    setItems((arr) => arr.map((c) => c.id === id ? { ...c, ativo: !c.ativo } : c));
  }
  function enviarWhats(c: Cupom) {
    const msg = `Oi! Tenho um cupom especial pra você 🎁\n\n*${c.codigo}* — ${c.tipo === "percentual" ? `${c.desconto}% OFF` : `R$ ${c.desconto} OFF`}\nMarca: ${c.marca}\nVálido até: ${new Date(c.validade).toLocaleDateString("pt-BR")}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    setItems((arr) => arr.map((x) => x.id === c.id ? { ...x, enviados: x.enviados + 1 } : x));
    toast.success("Abrindo WhatsApp...");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Ticket className="size-6 text-accent" /> Cupons inteligentes</h1>
          <p className="text-sm text-muted-foreground">Criação, segmentação por marca e acompanhamento em tempo real</p>
        </div>
        <button onClick={() => setCreating(true)} className="h-10 px-4 rounded-xl bg-foreground text-background text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90">
          <Plus className="size-4" /> Novo cupom
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Ativos" value={String(totais.ativos)} icon={<Ticket className="size-4" />} />
        <Kpi label="Envios" value={totais.enviados.toLocaleString("pt-BR")} icon={<MessageCircle className="size-4" />} />
        <Kpi label="Usos" value={totais.usos.toLocaleString("pt-BR")} icon={<ShoppingCart className="size-4" />} />
        <Kpi label="Faturamento" value={totais.faturamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} icon={<BarChart3 className="size-4" />} tone="success" />
      </div>

      <div className="card-soft p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cupom ou marca..." className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:bg-card border border-transparent focus:border-primary" />
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs">
          <Filter className="size-3.5 text-muted-foreground" />
          <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value as CupomMarca | "all")} className="h-9 px-3 rounded-lg bg-secondary outline-none border border-transparent focus:border-primary">
            <option value="all">Todas marcas</option>
            {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1 ml-auto">
          {(["lista", "envios"] as const).map((t) => (
            <button key={t} onClick={() => setAba(t)} className={`px-3 h-7 rounded-md text-xs font-semibold ${aba === t ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
              {t === "lista" ? "Cupons" : "Envios em tempo real"}
            </button>
          ))}
        </div>
      </div>

      {aba === "lista" ? (
        <div className="card-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr><Th>Código</Th><Th>Desconto</Th><Th>Marca</Th><Th>Validade</Th><Th>Limite</Th><Th>Usos</Th><Th>Faturamento</Th><Th>Status</Th><Th></Th></tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-secondary/40">
                  <Td>
                    <div className="font-bold">{c.codigo}</div>
                    {c.anexos.length > 0 && <div className="flex gap-1 mt-1">{c.anexos.map((a, i) => <AnexoBadge key={i} a={a} />)}</div>}
                  </Td>
                  <Td><span className="font-semibold">{c.tipo === "percentual" ? `${c.desconto}%` : `R$ ${c.desconto}`}</span></Td>
                  <Td><span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">{c.marca}</span></Td>
                  <Td className="text-xs">{new Date(c.validade).toLocaleDateString("pt-BR")}</Td>
                  <Td className="text-xs">{c.usos}/{c.limiteUso}</Td>
                  <Td className="font-semibold">{c.usos}</Td>
                  <Td className="font-bold text-success">{c.faturamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
                  <Td>
                    <button onClick={() => toggle(c.id)} className={`relative w-9 h-5 rounded-full transition ${c.ativo ? "bg-success" : "bg-border"}`}>
                      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${c.ativo ? "left-4" : "left-0.5"}`} />
                    </button>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => enviarWhats(c)} title="Enviar no WhatsApp" className="p-1.5 rounded-lg hover:bg-success/15 text-success"><MessageCircle className="size-4" /></button>
                      <button onClick={() => setEditing(c)} title="Editar" className="p-1.5 rounded-lg hover:bg-secondary"><Pencil className="size-4" /></button>
                      <button onClick={() => remover(c.id)} title="Remover" className="p-1.5 rounded-lg hover:bg-destructive/15 text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </Td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">Nenhum cupom encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <EnviosLista items={filtrados} />
      )}

      {(editing || creating) && (
        <CupomModal
          cupom={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={salvar}
        />
      )}
    </div>
  );
}

function exists(arr: Cupom[], id: string) { return arr.some((c) => c.id === id); }

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "success" }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone === "success" ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) { return <th className="text-left font-semibold px-3 py-2.5">{children}</th>; }
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) { return <td className={`px-3 py-3 ${className}`}>{children}</td>; }

function AnexoBadge({ a }: { a: Anexo }) {
  const Icon = a.tipo === "foto" ? ImageIcon : a.tipo === "audio" ? Mic : Video;
  return <span title={a.nome} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent"><Icon className="size-2.5" />{a.tipo}</span>;
}

function EnviosLista({ items }: { items: Cupom[] }) {
  // Mock destinatários derivados dos envios
  return (
    <div className="card-soft overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr><Th>Cupom</Th><Th>Marca</Th><Th><span className="inline-flex items-center gap-1"><MessageCircle className="size-3" /> Enviados</span></Th><Th><span className="inline-flex items-center gap-1"><Eye className="size-3" /> Abertos</span></Th><Th><span className="inline-flex items-center gap-1"><MousePointerClick className="size-3" /> Cliques</span></Th><Th><span className="inline-flex items-center gap-1"><ShoppingCart className="size-3" /> Usos</span></Th><Th>Não usaram</Th><Th>Faturamento</Th><Th></Th></tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const naoUsaram = Math.max(0, c.cliques - c.usos);
            const conv = c.enviados > 0 ? (c.usos / c.enviados) * 100 : 0;
            return (
              <tr key={c.id} className="border-t border-border hover:bg-secondary/40">
                <Td><div className="font-bold">{c.codigo}</div><div className="text-[10px] text-muted-foreground">conv. {conv.toFixed(1)}%</div></Td>
                <Td><span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">{c.marca}</span></Td>
                <Td>{c.enviados}</Td>
                <Td>{c.abertos}</Td>
                <Td>{c.cliques}</Td>
                <Td className="font-semibold text-success">{c.usos}</Td>
                <Td className="text-destructive">{naoUsaram}</Td>
                <Td className="font-bold">{c.faturamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
                <Td><Link to="/conversas" className="text-xs font-semibold text-primary hover:underline">Abrir conversa →</Link></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CupomModal({ cupom, onClose, onSave }: { cupom: Cupom | null; onClose: () => void; onSave: (c: Cupom) => void }) {
  const [form, setForm] = useState<Cupom>(cupom ?? {
    id: `c${Date.now()}`, codigo: "", desconto: 10, tipo: "percentual", marca: "Todas",
    validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    limiteUso: 100, ativo: true, anexos: [],
    enviados: 0, abertos: 0, cliques: 0, usos: 0, faturamento: 0,
    criadoEm: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function anexar(tipo: Anexo["tipo"]) {
    const nome = prompt(`Nome do arquivo (${tipo}):`);
    if (nome) setForm((f) => ({ ...f, anexos: [...f.anexos, { tipo, nome }] }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-bold flex items-center gap-2"><Ticket className="size-4" /> {cupom ? "Editar cupom" : "Novo cupom"}</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="size-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Código">
            <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="EX: GOLDEN10" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as CupomTipo })} className="input">
                <option value="percentual">Percentual %</option>
                <option value="fixo">Valor fixo R$</option>
              </select>
            </Field>
            <Field label="Desconto">
              <input type="number" value={form.desconto} onChange={(e) => setForm({ ...form, desconto: Number(e.target.value) || 0 })} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Segmentação por marca">
              <select value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value as CupomMarca })} className="input">
                {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Validade">
              <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Limite de uso">
            <input type="number" value={form.limiteUso} onChange={(e) => setForm({ ...form, limiteUso: Number(e.target.value) || 0 })} className="input" />
          </Field>
          <Field label="Anexos">
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => anexar("foto")} className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-secondary/70"><ImageIcon className="size-3.5" /> Foto</button>
              <button type="button" onClick={() => anexar("audio")} className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-secondary/70"><Mic className="size-3.5" /> Áudio</button>
              <button type="button" onClick={() => anexar("video")} className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-secondary/70"><Video className="size-3.5" /> Vídeo</button>
            </div>
            {form.anexos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.anexos.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/15 text-accent font-semibold">
                    {a.tipo} · {a.nome}
                    <button onClick={() => setForm({ ...form, anexos: form.anexos.filter((_, idx) => idx !== i) })}><X className="size-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
            Cupom ativo
          </label>
        </div>
        <div className="p-4 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="h-9 px-4 rounded-lg bg-secondary text-sm font-semibold hover:bg-secondary/70">Cancelar</button>
          <button onClick={() => { if (!form.codigo) { toast.error("Informe o código"); return; } onSave(form); }} className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90">Salvar cupom</button>
        </div>
      </div>
      <style>{`.input { width:100%; height:36px; padding:0 12px; border-radius:8px; background:hsl(var(--secondary)); outline:none; border:1px solid transparent; font-size:13px; } .input:focus { border-color:hsl(var(--primary)); background:hsl(var(--card)); }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}
