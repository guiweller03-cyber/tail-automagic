# Plano — Melhorias CRM (WhatsApp · IA · Cupons · Fluxos)

Refatoração focada em 7 frentes, sem novas dependências, mantendo design system e `sonner`/`lucide-react`. Tudo em estado local + `localStorage` (sem backend).

## 1. WhatsApp — CAC individual por lead
**Arquivo:** `src/features/whatsapp-crm/components/KanbanCard.tsx` + `LeadDetailPanel.tsx` + `services.ts` + `data.ts`
- `calculateLeadCost` já existe e retorna custo individual — corrigir cópia para mostrar somente CAC unitário (`investimento / leadsGerados`), nunca o total da campanha.
- Card: badge "CAC R$20" + origem (`Meta Ads · Campanha Golden Maio`).
- Painel detalhe: bloco "Aquisição" com **CAC individual · Origem · Campanha/Influencer · ROI individual (ticket × compras − CAC) · Ticket médio · Nº de compras · LTV** (ticket × compras + projeção).
- Garantir `data.ts` com `custoLead`, `campanhaOrigem`, `influenciador`, `ticketMedio`, `comprasRealizadas`.

## 2. Assistente IA — consultor operacional
**Arquivo:** `src/pages/AssistenteIA.tsx` + novo `src/features/ia-consultor/insights.ts`
- Gerar `InsightIA[]` a partir dos mocks: clientes inativos, cupons fracos, ticket caindo, marca sem recompra, churn risk.
- Painel lateral "Insights do CRM" com cards (severidade, ação sugerida, botão "Aplicar" / "Abrir conversa").
- Chat aceita perguntas livres + chips: "Quem está em risco?", "Sugira campanha Golden", "Cupons abaixo da média".
- Respostas dinâmicas computadas dos dados (não fixas).

## 3. Avisos / Alertas persistentes
**Arquivo:** novo `src/features/alertas/store.ts` (hook + `localStorage`) + integração em `Dashboard.tsx` e `AssistenteIA.tsx`
- Tipos: `risco · recompra · pos_venda · pagamento · inativo · abandono · logistica · estoque`.
- Cada alerta: `id, tipo, clienteId?, rota, mensagem, criadoEm, status: 'ativo'|'resolvido'|'descartado'`.
- Clique → navega para rota correta (ex.: `/conversas?cliente=xxx`).
- Botões individuais: "Resolver" e "Descartar". Ativos reaparecem até ação.

## 4. Nova aba Cupons
**Arquivos:** `src/pages/Cupons.tsx` + `src/routes/cupons.tsx` + entrada no `AppShell`
- CRUD local: criar/editar/ativar/desativar, validade, limite uso, %/fixo.
- Segmentação por marca comprada (Golden/Premier/Fórmula Natural) usando histórico de pedidos.
- Anexos: foto/áudio/vídeo (input file → preview local).
- Botão "Enviar no WhatsApp" → `window.open(wa.me/...)` com mensagem formatada.
- Lista de envios em tempo real: recebeu · abriu · clicou · usou · não usou · faturamento gerado (mock determinístico por cupom).
- Filtros: campanha / marca / período. Linha "Abrir conversa" → `/conversas`.

## 5. Fluxo Vermífugo (automação)
**Arquivos:** novo `src/features/fluxos/vermifugo.ts` + aba dentro de `Automacoes.tsx`
- Detecta compra de vermífugo nos pedidos, calcula `proximaProtecao = dataCompra + duracaoDias`.
- Gera tarefas: aviso prévio (D-7), mensagem no vencimento, lembrete D+X, cupom automático D+Y.
- Painel configurável: dias, mensagens (textarea), gatilhos (toggles), cupom vinculado.
- Lista de "Pets em proteção" com status e botão "Enviar agora".

## 6. Follow-up pós-compra
**Arquivo:** mesma aba `Automacoes.tsx`, seção "Pós-venda ração"
- Configuração por marca/categoria: lista de perguntas + dias após compra.
- Gera fila de follow-ups (pedidos recentes × regra) com botão "Enviar pergunta no WhatsApp".
- Registra resposta manual (toggle "respondeu OK" / "reportou problema") → alimenta alertas.

## 7. Integração cruzada
- Alertas do fluxo vermífugo + follow-up alimentam o store de alertas (item 3).
- Insights da IA leem alertas ativos + dados de cupons + LTV.
- Botão global "IA Assistente" continua existindo no WhatsApp.

## Regras transversais
- Zero novas dependências. UI tokens existentes (`card-soft`, `bg-secondary`, `text-success`, etc.).
- Toda divisão guardada (`> 0`), fallback `—` ou `∞`.
- WhatsApp via `window.open(url, '_blank')`.
- Modais fecham com Esc; drawers com overlay clicável.
- Persistência local: `alertas_v1`, `cupons_v1`, `fluxo_vermifugo_cfg`, `posvenda_cfg`.

## Ordem
1. `mock.ts` extras (campanhaOrigem, anexos cupom, fluxos).
2. WhatsApp CAC + painel detalhe.
3. Store de alertas + integração Dashboard/IA.
4. Aba Cupons (página + rota + nav).
5. Assistente IA consultor.
6. Fluxos vermífugo + pós-venda em Automações.
