import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Clock,
  Copy,
  Gift,
  Loader2,
  Plus,
  RefreshCw,
  Tag,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

type Influenciador = {
  id: string;
  nome: string;
  telefone: string | null;
  documento: string | null;
  chave_pix: string | null;
  canal: string | null;
  status: "ativo" | "pausado" | "encerrado";
  observacao: string | null;
  criado_em: string;
};

type Cupom = {
  id: string;
  influenciador_id: string;
  codigo: string;
  tipo_desconto: "percentual" | "valor_fixo";
  valor_desconto: number;
  comissao_tipo: "percentual_faturamento" | "percentual_lucro" | "valor_fixo";
  comissao_valor: number;
  limite_usos: number | null;
  usos: number;
  validade: string | null;
  status: "ativo" | "pausado" | "expirado";
  influenciadores?: Pick<Influenciador, "id" | "nome" | "telefone" | "status"> | null;
};

type Comissao = {
  id: string;
  venda_id: string;
  influenciador_id: string;
  cupom_id: string;
  base_calculo: number;
  percentual: number | null;
  valor: number;
  status: "pendente" | "aprovada" | "paga" | "cancelada";
  pago_em: string | null;
  criado_em: string;
  influenciadores?: Pick<Influenciador, "id" | "nome" | "telefone"> | null;
  cupons?: Pick<Cupom, "id" | "codigo"> | null;
  vendas?: {
    id: string;
    cliente_nome: string | null;
    telefone: string | null;
    total: number | null;
    lucro: number | null;
    status_pagamento: string | null;
    status: string | null;
    criado_em: string;
  } | null;
};

type IndicacoesResumo = {
  influenciadores: Influenciador[];
  cupons: Cupom[];
  comissoes: Comissao[];
  kpis: {
    influenciadoresAtivos: number;
    cuponsAtivos: number;
    vendasComCupom: number;
    faturamento: number;
    comissaoPendente: number;
    comissaoPaga: number;
  };
};

const vazio: IndicacoesResumo = {
  influenciadores: [],
  cupons: [],
  comissoes: [],
  kpis: {
    influenciadoresAtivos: 0,
    cuponsAtivos: 0,
    vendasComCupom: 0,
    faturamento: 0,
    comissaoPendente: 0,
    comissaoPaga: 0,
  },
};

function brl(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataCurta(valor: string | null | undefined): string {
  if (!valor) return "-";
  return new Date(valor).toLocaleDateString("pt-BR");
}

async function postIndicacoes<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/crm/indicacoes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || json?.ok === false) {
    throw new Error(json?.erro || "Falha ao salvar indicacao");
  }
  return json as T;
}

export function Indicacoes() {
  const [dados, setDados] = useState<IndicacoesResumo>(vazio);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [influenciadorForm, setInfluenciadorForm] = useState({
    nome: "",
    telefone: "",
    documento: "",
    chave_pix: "",
    canal: "",
    observacao: "",
  });
  const [cupomForm, setCupomForm] = useState({
    influenciador_id: "",
    codigo: "",
    tipo_desconto: "percentual" as Cupom["tipo_desconto"],
    valor_desconto: "5",
    comissao_tipo: "percentual_faturamento" as Cupom["comissao_tipo"],
    comissao_valor: "5",
    limite_usos: "",
    validade: "",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const response = await fetch("/api/crm/indicacoes");
      const json = await response.json();
      if (!response.ok || json?.ok === false) {
        throw new Error(json?.erro || "Falha ao carregar indicacoes");
      }
      setDados(json as IndicacoesResumo);
      setCupomForm((prev) => ({
        ...prev,
        influenciador_id: prev.influenciador_id || (json.influenciadores?.[0]?.id ?? ""),
      }));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro desconhecido");
      setDados(vazio);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ranking = useMemo(() => {
    const map = new Map<string, { nome: string; vendas: number; comissao: number }>();
    for (const comissao of dados.comissoes) {
      if (comissao.status === "cancelada") continue;
      const id = comissao.influenciador_id;
      const atual = map.get(id) ?? {
        nome: comissao.influenciadores?.nome ?? "Influenciador",
        vendas: 0,
        comissao: 0,
      };
      atual.vendas += 1;
      atual.comissao += comissao.valor;
      map.set(id, atual);
    }
    return Array.from(map.values()).sort((a, b) => b.comissao - a.comissao).slice(0, 5);
  }, [dados.comissoes]);

  const criarInfluenciador = async () => {
    if (!influenciadorForm.nome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await postIndicacoes<Influenciador>({
        acao: "criar_influenciador",
        ...influenciadorForm,
      });
      setInfluenciadorForm({
        nome: "",
        telefone: "",
        documento: "",
        chave_pix: "",
        canal: "",
        observacao: "",
      });
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar influenciador");
    } finally {
      setSalvando(false);
    }
  };

  const criarCupom = async () => {
    if (!cupomForm.influenciador_id || !cupomForm.codigo.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      await postIndicacoes<Cupom>({
        acao: "criar_cupom",
        influenciador_id: cupomForm.influenciador_id,
        codigo: cupomForm.codigo,
        tipo_desconto: cupomForm.tipo_desconto,
        valor_desconto: Number(cupomForm.valor_desconto) || 0,
        comissao_tipo: cupomForm.comissao_tipo,
        comissao_valor: Number(cupomForm.comissao_valor) || 0,
        limite_usos: cupomForm.limite_usos ? Number(cupomForm.limite_usos) : null,
        validade: cupomForm.validade || null,
      });
      setCupomForm((prev) => ({ ...prev, codigo: "", limite_usos: "", validade: "" }));
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar cupom");
    } finally {
      setSalvando(false);
    }
  };

  const marcarPaga = async (id: string) => {
    setSalvando(true);
    setErro(null);
    try {
      await postIndicacoes<Comissao>({ acao: "marcar_comissao_paga", id });
      await carregar();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao marcar pagamento");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <Gift className="size-6 text-primary" /> Indicações & Cupons
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cupons de influenciadores, descontos aplicados e comissões a pagar.
          </p>
        </div>
        <button
          onClick={() => void carregar()}
          className="h-10 px-4 rounded-xl bg-secondary text-sm font-semibold inline-flex items-center gap-2 hover:bg-secondary/70 transition"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {erro && (
        <div className="card-soft p-4 border-destructive/30 bg-destructive/5 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Kpi icon={<Users className="size-4" />} label="Influenciadores" value={String(dados.kpis.influenciadoresAtivos)} sub="ativos" tone="primary" />
        <Kpi icon={<Tag className="size-4" />} label="Cupons" value={String(dados.kpis.cuponsAtivos)} sub="ativos" tone="accent" />
        <Kpi icon={<Check className="size-4" />} label="Vendas" value={String(dados.kpis.vendasComCupom)} sub="com cupom" tone="success" />
        <Kpi icon={<Wallet className="size-4" />} label="Pendente" value={brl(dados.kpis.comissaoPendente)} sub="comissão em aberto" tone="warn" />
        <Kpi icon={<Trophy className="size-4" />} label="Pago" value={brl(dados.kpis.comissaoPaga)} sub="já quitado" tone="success" />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <section className="card-soft p-5 space-y-4">
          <SectionTitle icon={<Users className="size-4" />} title="Novo influenciador" sub="Cadastre quem vai divulgar os cupons." />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nome" value={influenciadorForm.nome} onChange={(nome) => setInfluenciadorForm((prev) => ({ ...prev, nome }))} />
            <Field label="Telefone" value={influenciadorForm.telefone} onChange={(telefone) => setInfluenciadorForm((prev) => ({ ...prev, telefone }))} />
            <Field label="Canal" value={influenciadorForm.canal} onChange={(canal) => setInfluenciadorForm((prev) => ({ ...prev, canal }))} placeholder="Instagram, TikTok..." />
            <Field label="Documento" value={influenciadorForm.documento} onChange={(documento) => setInfluenciadorForm((prev) => ({ ...prev, documento }))} />
            <Field label="Chave Pix" value={influenciadorForm.chave_pix} onChange={(chave_pix) => setInfluenciadorForm((prev) => ({ ...prev, chave_pix }))} />
            <Field label="Observação" value={influenciadorForm.observacao} onChange={(observacao) => setInfluenciadorForm((prev) => ({ ...prev, observacao }))} />
          </div>
          <button
            onClick={() => void criarInfluenciador()}
            disabled={salvando || !influenciadorForm.nome.trim()}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40 hover:opacity-90"
          >
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar influenciador
          </button>
        </section>

        <section className="card-soft p-5 space-y-4">
          <SectionTitle icon={<Tag className="size-4" />} title="Novo cupom" sub="Defina o desconto do cliente e a comissão do influenciador." />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Influenciador</Label>
              <select
                value={cupomForm.influenciador_id}
                onChange={(e) => setCupomForm((prev) => ({ ...prev, influenciador_id: e.target.value }))}
                className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="">Selecione</option>
                {dados.influenciadores.map((item) => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </select>
            </div>
            <Field label="Código" value={cupomForm.codigo} onChange={(codigo) => setCupomForm((prev) => ({ ...prev, codigo: codigo.toUpperCase() }))} placeholder="EX: GUI10" />
            <div>
              <Label>Tipo de desconto</Label>
              <select
                value={cupomForm.tipo_desconto}
                onChange={(e) => setCupomForm((prev) => ({ ...prev, tipo_desconto: e.target.value as Cupom["tipo_desconto"] }))}
                className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="percentual">Percentual</option>
                <option value="valor_fixo">Valor fixo</option>
              </select>
            </div>
            <Field label="Valor do desconto" type="number" value={cupomForm.valor_desconto} onChange={(valor_desconto) => setCupomForm((prev) => ({ ...prev, valor_desconto }))} />
            <div>
              <Label>Tipo de comissão</Label>
              <select
                value={cupomForm.comissao_tipo}
                onChange={(e) => setCupomForm((prev) => ({ ...prev, comissao_tipo: e.target.value as Cupom["comissao_tipo"] }))}
                className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
              >
                <option value="percentual_faturamento">% do faturamento</option>
                <option value="percentual_lucro">% do lucro</option>
                <option value="valor_fixo">Valor fixo</option>
              </select>
            </div>
            <Field label="Valor da comissão" type="number" value={cupomForm.comissao_valor} onChange={(comissao_valor) => setCupomForm((prev) => ({ ...prev, comissao_valor }))} />
            <Field label="Limite de usos" type="number" value={cupomForm.limite_usos} onChange={(limite_usos) => setCupomForm((prev) => ({ ...prev, limite_usos }))} placeholder="Sem limite" />
            <Field label="Validade" type="date" value={cupomForm.validade} onChange={(validade) => setCupomForm((prev) => ({ ...prev, validade }))} />
          </div>
          <button
            onClick={() => void criarCupom()}
            disabled={salvando || !cupomForm.influenciador_id || !cupomForm.codigo.trim()}
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-40 hover:opacity-90"
          >
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar cupom
          </button>
        </section>
      </div>

      <div className="grid xl:grid-cols-[1fr_1.4fr] gap-4">
        <section className="card-soft overflow-hidden">
          <Header title="Influenciadores" sub={`${dados.influenciadores.length} cadastrados`} />
          <div className="divide-y divide-border">
            {loading ? <LoadingLine /> : dados.influenciadores.map((item) => (
              <div key={item.id} className="px-5 py-4 flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center font-bold">
                  {item.nome.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{item.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.canal || item.telefone || "Sem canal informado"}</div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
            {!loading && dados.influenciadores.length === 0 && <EmptyLine text="Nenhum influenciador cadastrado." />}
          </div>
        </section>

        <section className="card-soft overflow-hidden">
          <Header title="Cupons" sub={`${dados.cupons.length} códigos cadastrados`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">Código</th>
                  <th className="px-5 py-3 font-medium">Influenciador</th>
                  <th className="px-5 py-3 font-medium">Desconto</th>
                  <th className="px-5 py-3 font-medium">Comissão</th>
                  <th className="px-5 py-3 font-medium text-right">Usos</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.cupons.map((cupom) => (
                  <tr key={cupom.id} className="border-t border-border">
                    <td className="px-5 py-3 font-bold">
                      <button
                        onClick={() => void navigator.clipboard?.writeText(cupom.codigo)}
                        className="inline-flex items-center gap-2 hover:text-primary"
                      >
                        {cupom.codigo} <Copy className="size-3" />
                      </button>
                    </td>
                    <td className="px-5 py-3">{cupom.influenciadores?.nome || "-"}</td>
                    <td className="px-5 py-3">{cupom.tipo_desconto === "percentual" ? `${cupom.valor_desconto}%` : brl(cupom.valor_desconto)}</td>
                    <td className="px-5 py-3">{descricaoComissao(cupom)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{cupom.usos}{cupom.limite_usos ? `/${cupom.limite_usos}` : ""}</td>
                    <td className="px-5 py-3"><StatusBadge status={cupom.status} /></td>
                  </tr>
                ))}
                {!loading && dados.cupons.length === 0 && (
                  <tr><td colSpan={6}><EmptyLine text="Nenhum cupom cadastrado." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid xl:grid-cols-[0.8fr_1.6fr] gap-4">
        <section className="card-soft p-5">
          <SectionTitle icon={<Trophy className="size-4" />} title="Ranking" sub="Top influenciadores por comissão." />
          <div className="mt-4 space-y-2">
            {ranking.map((item, index) => (
              <div key={item.nome} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-3 py-3">
                <div className="size-8 rounded-lg bg-card border border-border grid place-items-center text-xs font-bold">{index + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{item.nome}</div>
                  <div className="text-xs text-muted-foreground">{item.vendas} venda(s)</div>
                </div>
                <div className="text-sm font-bold tabular-nums">{brl(item.comissao)}</div>
              </div>
            ))}
            {ranking.length === 0 && <div className="text-sm text-muted-foreground">Sem comissões registradas ainda.</div>}
          </div>
        </section>

        <section className="card-soft overflow-hidden">
          <Header title="Comissões" sub="Pague o influenciador depois que o pedido estiver confirmado." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">Influenciador</th>
                  <th className="px-5 py-3 font-medium">Cupom</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium text-right">Venda</th>
                  <th className="px-5 py-3 font-medium text-right">Comissão</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {dados.comissoes.map((comissao) => (
                  <tr key={comissao.id} className="border-t border-border">
                    <td className="px-5 py-3 font-semibold">{comissao.influenciadores?.nome || "-"}</td>
                    <td className="px-5 py-3">{comissao.cupons?.codigo || "-"}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium">{comissao.vendas?.cliente_nome || "Cliente"}</div>
                      <div className="text-xs text-muted-foreground">{dataCurta(comissao.vendas?.criado_em)}</div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{brl(comissao.vendas?.total ?? comissao.base_calculo)}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums">{brl(comissao.valor)}</td>
                    <td className="px-5 py-3"><StatusBadge status={comissao.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {(comissao.status === "pendente" || comissao.status === "aprovada") && (
                        <button
                          onClick={() => void marcarPaga(comissao.id)}
                          disabled={salvando}
                          className="h-8 px-3 rounded-lg bg-success/15 text-success text-xs font-bold hover:bg-success/25 disabled:opacity-40"
                        >
                          Marcar paga
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && dados.comissoes.length === 0 && (
                  <tr><td colSpan={7}><EmptyLine text="Nenhuma comissão gerada ainda." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function descricaoComissao(cupom: Cupom): string {
  if (cupom.comissao_tipo === "valor_fixo") return brl(cupom.comissao_valor);
  const base = cupom.comissao_tipo === "percentual_lucro" ? "lucro" : "venda";
  return `${cupom.comissao_valor}% da ${base}`;
}

function Kpi({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone: "primary" | "success" | "accent" | "warn" }) {
  const cls = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    accent: "bg-accent/15 text-accent",
    warn: "bg-warning/15 text-warning",
  }[tone];
  return (
    <div className="card-soft p-4 flex items-center gap-3">
      <div className={`size-11 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{label}</div>
        <div className="text-lg font-bold leading-tight truncate">{value}</div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div>
      <h2 className="font-semibold inline-flex items-center gap-2">{icon} {title}</h2>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">{children}</label>;
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full h-10 px-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ativo" || status === "paga"
      ? "bg-success/15 text-success"
      : status === "pendente" || status === "aprovada"
        ? "bg-warning/15 text-warning"
        : "bg-muted text-muted-foreground";
  const icon = status === "paga" || status === "ativo" ? <Check className="size-3" /> : <Clock className="size-3" />;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md ${cls}`}>
      {icon}
      {status}
    </span>
  );
}

function LoadingLine() {
  return (
    <div className="px-5 py-8 text-sm text-muted-foreground inline-flex items-center gap-2">
      <Loader2 className="size-4 animate-spin" /> Carregando...
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="px-5 py-8 text-sm text-muted-foreground">{text}</div>;
}
