import { Zap, Play, Pause, Shield, MessageCircle, Plus, Trash2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Aba = "fluxos" | "vermifugo" | "posvenda";

const automacoes: { nome: string; desc: string; ativo: boolean; execHoje: number }[] = [];

type VermifugoCfg = {
  duracaoDias: number;
  avisoPrevio: number;
  lembreteDias: number;
  cupomDias: number;
  cupomCodigo: string;
  msgAviso: string;
  msgLembrete: string;
};
const VERM_KEY = "fluxo_vermifugo_cfg";
const VERM_DEFAULT: VermifugoCfg = {
  duracaoDias: 90, avisoPrevio: 7, lembreteDias: 5, cupomDias: 10,
  cupomCodigo: "VERMI10",
  msgAviso: "Oi {nome}! A proteção do {pet} contra vermes vai vencer em {dias} dias. Quer renovar?",
  msgLembrete: "Olá {nome}, notei que a proteção do {pet} venceu há {dias} dias. Posso te enviar um cupom?",
};

type PetEmProtecao = { id: string; cliente: string; pet: string; produto: string; venceEm: number; status: "ok" | "aviso" | "vencido" };
const petsProtecao: PetEmProtecao[] = [];

const POSVENDA_DEFAULT: PosVendaCfg[] = [];

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const r = window.localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
}

export function Automacoes() {
  const [aba, setAba] = useState<Aba>("fluxos");
  const [items, setItems] = useState(automacoes);
  const toggle = (i: number) => setItems((arr) => arr.map((a, idx) => idx === i ? { ...a, ativo: !a.ativo } : a));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Automações</h1>
        <p className="text-sm text-muted-foreground">Fluxos n8n + WhatsApp + IA executando em segundo plano</p>
      </div>

      <div className="inline-flex rounded-lg bg-muted p-1">
        {([["fluxos", "Fluxos gerais"], ["vermifugo", "Fluxo Vermífugo"], ["posvenda", "Pós-venda ração"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setAba(k)} className={`px-3 h-8 rounded-md text-xs font-semibold ${aba === k ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {aba === "fluxos" && (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((a, i) => (
            <div key={a.nome} className="card-soft p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="size-11 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0"><Zap className="size-5" /></div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{a.nome}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                </div>
                <button onClick={() => toggle(i)} className={`relative w-11 h-6 rounded-full transition shrink-0 ${a.ativo ? "bg-success" : "bg-border"}`}>
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${a.ativo ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-xs">
                <span className="text-muted-foreground">Execuções hoje</span>
                <span className="font-bold">{a.execHoje}</span>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="flex-1 h-9 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70">
                  {a.ativo ? <><Pause className="size-3.5" /> Pausar</> : <><Play className="size-3.5" /> Ativar</>}
                </button>
                <button className="flex-1 h-9 rounded-lg bg-secondary text-xs font-semibold hover:bg-secondary/70">Editar fluxo</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === "vermifugo" && <FluxoVermifugo />}
      {aba === "posvenda" && <PosVendaConfig />}
    </div>
  );
}

function FluxoVermifugo() {
  const [cfg, setCfg] = useState<VermifugoCfg>(() => loadJSON(VERM_KEY, VERM_DEFAULT));
  const [ativo, setAtivo] = useState(true);
  useEffect(() => { try { window.localStorage.setItem(VERM_KEY, JSON.stringify(cfg)); } catch { /* noop */ } }, [cfg]);

  function enviarAgora(p: PetEmProtecao) {
    const msg = (p.status === "vencido" ? cfg.msgLembrete : cfg.msgAviso)
      .replace("{nome}", p.cliente).replace("{pet}", p.pet).replace("{dias}", String(Math.abs(p.venceEm)));
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    toast.success(`Aviso enviado para ${p.cliente}`);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-5">
      <div className="card-soft p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <div>
              <h3 className="font-bold">Fluxo Vermífugo</h3>
              <p className="text-xs text-muted-foreground">Lembrete automático antes/depois da proteção vencer</p>
            </div>
          </div>
          <button onClick={() => setAtivo((v) => !v)} className={`relative w-12 h-6 rounded-full ${ativo ? "bg-success" : "bg-border"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${ativo ? "left-6" : "left-0.5"}`} />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumField label="Duração proteção (d)" value={cfg.duracaoDias} onChange={(v) => setCfg({ ...cfg, duracaoDias: v })} />
            <NumField label="Aviso prévio (D-)" value={cfg.avisoPrevio} onChange={(v) => setCfg({ ...cfg, avisoPrevio: v })} />
            <NumField label="Lembrete após (D+)" value={cfg.lembreteDias} onChange={(v) => setCfg({ ...cfg, lembreteDias: v })} />
            <NumField label="Cupom após (D+)" value={cfg.cupomDias} onChange={(v) => setCfg({ ...cfg, cupomDias: v })} />
          </div>
          <Field label="Cupom automático">
            <input value={cfg.cupomCodigo} onChange={(e) => setCfg({ ...cfg, cupomCodigo: e.target.value.toUpperCase() })} className="cfg-input" />
          </Field>
          <Field label="Mensagem aviso prévio (use {nome} {pet} {dias})">
            <textarea rows={2} value={cfg.msgAviso} onChange={(e) => setCfg({ ...cfg, msgAviso: e.target.value })} className="cfg-input" />
          </Field>
          <Field label="Mensagem lembrete pós-vencimento">
            <textarea rows={2} value={cfg.msgLembrete} onChange={(e) => setCfg({ ...cfg, msgLembrete: e.target.value })} className="cfg-input" />
          </Field>
          <button onClick={() => toast.success("Configuração salva")} className="h-9 px-4 rounded-lg bg-foreground text-background text-sm font-semibold">Salvar fluxo</button>
        </div>
        <style>{`.cfg-input { width:100%; padding:8px 12px; border-radius:8px; background:hsl(var(--secondary)); outline:none; border:1px solid transparent; font-size:13px; } .cfg-input:focus { border-color:hsl(var(--primary)); background:hsl(var(--card)); }`}</style>
      </div>

      <div className="card-soft p-5">
        <h3 className="font-bold flex items-center gap-2"><Shield className="size-4 text-primary" /> Pets em proteção</h3>
        <div className="mt-3 space-y-2">
          {petsProtecao.map((p) => {
            const tone = p.status === "vencido" ? "border-destructive/30 bg-destructive/5" : p.status === "aviso" ? "border-accent/30 bg-accent/5" : "border-success/20 bg-success/5";
            return (
              <div key={p.id} className={`p-3 rounded-lg border ${tone}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.pet} · {p.cliente}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{p.produto} · {p.venceEm > 0 ? `vence em ${p.venceEm}d` : `venceu há ${Math.abs(p.venceEm)}d`}</div>
                  </div>
                  <button onClick={() => enviarAgora(p)} className="h-8 px-2.5 rounded-lg bg-success text-success-foreground text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-90">
                    <Send className="size-3" /> Enviar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PosVendaConfig() {
  const [cfgs, setCfgs] = useState<PosVendaCfg[]>(() => loadJSON(POSVENDA_KEY, POSVENDA_DEFAULT));
  useEffect(() => { try { window.localStorage.setItem(POSVENDA_KEY, JSON.stringify(cfgs)); } catch { /* noop */ } }, [cfgs]);

  function addPergunta(i: number) {
    setCfgs((arr) => arr.map((c, idx) => idx === i ? { ...c, perguntas: [...c.perguntas, { id: `q${Date.now()}`, texto: "Nova pergunta", aposDias: 5 }] } : c));
  }
  function removerPergunta(i: number, qid: string) {
    setCfgs((arr) => arr.map((c, idx) => idx === i ? { ...c, perguntas: c.perguntas.filter((q) => q.id !== qid) } : c));
  }
  function updatePergunta(i: number, qid: string, patch: Partial<Pergunta>) {
    setCfgs((arr) => arr.map((c, idx) => idx === i ? { ...c, perguntas: c.perguntas.map((q) => q.id === qid ? { ...q, ...patch } : q) } : c));
  }
  function addCfg() {
    setCfgs((arr) => [...arr, { marca: "Nova marca", categoria: "Ração", perguntas: [] }]);
  }

  return (
    <div className="space-y-4">
      <div className="card-soft p-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold">Follow-up pós-compra</h3>
          <p className="text-xs text-muted-foreground">Perguntas automáticas configuráveis por marca/categoria</p>
        </div>
        <button onClick={addCfg} className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5"><Plus className="size-3.5" /> Nova regra</button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {cfgs.map((c, i) => (
          <div key={i} className="card-soft p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={c.marca} onChange={(e) => setCfgs((arr) => arr.map((x, idx) => idx === i ? { ...x, marca: e.target.value } : x))} className="cfg-input2" placeholder="Marca" />
              <input value={c.categoria} onChange={(e) => setCfgs((arr) => arr.map((x, idx) => idx === i ? { ...x, categoria: e.target.value } : x))} className="cfg-input2" placeholder="Categoria" />
            </div>
            <div className="space-y-2">
              {c.perguntas.map((q) => (
                <div key={q.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground w-12 text-center">+{q.aposDias}d</span>
                  <input value={q.texto} onChange={(e) => updatePergunta(i, q.id, { texto: e.target.value })} className="cfg-input2 flex-1" />
                  <input type="number" value={q.aposDias} onChange={(e) => updatePergunta(i, q.id, { aposDias: Number(e.target.value) || 0 })} className="cfg-input2 w-16" />
                  <button onClick={() => removerPergunta(i, q.id)} className="p-1.5 rounded hover:bg-destructive/15 text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              <button onClick={() => addPergunta(i)} className="text-xs font-semibold text-primary inline-flex items-center gap-1"><Plus className="size-3" /> Adicionar pergunta</button>
            </div>
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground"><MessageCircle className="size-3 inline" /> {c.perguntas.length} mensagens por compra</span>
              <button onClick={() => toast.success("Regra salva")} className="font-semibold text-primary">Salvar</button>
            </div>
          </div>
        ))}
      </div>
      <style>{`.cfg-input2 { padding:6px 10px; border-radius:6px; background:hsl(var(--secondary)); outline:none; border:1px solid transparent; font-size:12px; } .cfg-input2:focus { border-color:hsl(var(--primary)); background:hsl(var(--card)); }`}</style>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground mb-1">{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="cfg-input" />
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
