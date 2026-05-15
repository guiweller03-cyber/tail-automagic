# Plano — Sistema Completo v3

Refatoração ampla em 9 frentes. Cobre ~3.400 linhas em 8 páginas + mock central. Vou implementar tudo em um único ciclo, mas o plano abaixo deixa claro o que muda em cada arquivo para você revisar antes.

## Regras transversais (aplicadas em todas as frentes)
- Sem novas dependências, sem mexer em `src/components/ui/`.
- Toasts via `sonner`. Ícones só `lucide-react`.
- Toda divisão validada (`> 0`); fallback `"—"` ou `"∞"` conforme regra.
- Estado local com `useState` inicializado a partir do `mock.ts`. Persistência apenas onde pedido (`localStorage`: `meta_mes`, `avisos_auto`).
- Modais fecham com `Esc`; overlays escuros clicáveis fecham drawers.
- WhatsApp sempre via `window.open(wa.me/..., '_blank')`.

## 1. `src/lib/mock.ts` — base de dados
- Novo type `FormaPagamento`.
- Expandir `Pedido` com `pagamento`, `pago`, `comprovante`, `taxaMaquina`, `notaFiscal` e atualizar os 6 pedidos existentes.
- Novos types + arrays: `ClienteInativo` (4 itens), `ClientePorBairro` (6 itens).

## 2. `src/pages/Estoque.tsx` — edição inline + margem correta
- Estado local `[...produtos]`.
- Células Custo / Venda viram `<input>` ao clicar; salvam em `onBlur`/Enter.
- Margem: bruta para próprio; consignado usa `comissaoFornecedor = precoCompra * 0.7`. Coluna "Tipo margem".
- Nova coluna "Comportamento de compra" cruzando categoria com `recomprasPrevistas` (Alta/Média/Baixa + tooltip).
- Modal "Novo produto" com preview de margem em tempo real.

## 3. `src/pages/Clientes.tsx` — cadastro + aba Inativos
- Modal "Novo cliente" com máscara de telefone `(XX) X XXXX-XXXX`, seção dinâmica de pets.
- Nova aba "Inativos" usando `clientesInativos`. KPIs (total, valor potencial, responderam, sem resposta).
- Botão WhatsApp com mensagem por `motivoPerdaProvavel`. Botão "Marcar tentativa" incrementa contador.

## 4. `src/pages/Pedidos.tsx` — pagamento visível
- Badges no card: ✅ Pago / ⏳ Pendente / 💵 Dinheiro / 💳 Crédito|Débito / ⚠️ Sem comprovante.
- Drag para coluna "Pago" abre modal de confirmação (forma + comprovante) e atualiza estado.

## 5. `src/pages/Financeiro.tsx` — 5 abas
- **Vendas**: KPIs por forma de pagamento + barra proporcional + total de taxas + NF count. Mantém DRE/meta/projeção atuais.
- **Combustível**: já existente — auditar fórmulas para guard `kmPercorrido > 0`.
- **Despesas**: já existente — manter; garantir consistência.
- **Marketing**: refazer com novo type `GastoMkt`, regras estritas de ROI (`∞`, `-100%`, `—`), badges Excelente/Bom/Regular/Prejuízo/Aguardando, ranking lateral.
- **Entregador** (nova): seletor de modelo (cards), config editável, KPIs em tempo real, despesas do veículo (modal), depreciação calculada com guards.

## 6. `src/pages/Entregas.tsx` — avisos automáticos
- Estado `EntregaAtiva` com histórico, `avisadoSaida`, `avisadoProximo`.
- Toggle "Avisos automáticos" persistido (`avisos_auto`).
- Fluxo Otimizar → Iniciar rota: ao iniciar dispara mensagem para cada parada com `setTimeout(18s × (ordem-1))`, abre WhatsApp, registra histórico, toast por aviso.
- Botões Entregue / Navegar / Avisar cliente (modal 3 opções).
- Drawer 400px com chat estilo WhatsApp + chips + ligar/WhatsApp.
- Painel lateral: distância, tempo, custo combustível (`dist * 0.79`), receita prevista, progresso, toggle.

## 7. `src/pages/Conversas.tsx` — catálogo + Assistente IA
- Painel lateral "Catálogo rápido" quando há conversa aberta: grid de produtos com filtro por categoria, busca, badge de estoque crítico, botão "Enviar produto" (mensagem formatada → wa.me).
- Painel "Assistente IA" com `SugestaoIA[]` derivado das conversas (`sem_resposta`, `recompra`, `upsell`, `pagamento_pendente`, `risco_churn`), ordenado por urgência, ações Ver mensagem / Abrir conversa / Enviar WhatsApp.

## 8. `src/pages/Dashboard.tsx` — mapa de bairros
- Nova seção abaixo dos alertas IA.
- Container "mapa" com gradiente; marcadores posicionados por lat/lng normalizados em %, tamanho/cor por volume, tooltip + card flutuante ao clicar.
- Lista lateral ranqueada com barra proporcional.
- 4 KPIs (mais clientes / maior ticket / maior receita / total bairros).

## 9. `src/pages/Campanhas.tsx` — ROI correto
- Atualizar mock de campanhas (4 itens com `leads`, `conversoes`, `receitaGerada`).
- Tabela: Leads · Conversões · Taxa conv. · CAC · Receita · ROI (badge colorido, formato `Xx` positivo / `%` negativo / `∞` / `-100%`).
- Seção topo "ROI por canal" agregando por `origem`.

## Detalhes técnicos
- Listener global `Esc` por modal: `useEffect` com `keydown` removendo no cleanup.
- Validação numérica: `Number(input) || 0` antes de qualquer cálculo; nunca renderizar `NaN`.
- Para mapas/marcadores: normalizar lat/lng com min/max do array (`(v - min) / (max - min) * 100`) — invertendo lat para que norte fique em cima.
- `setTimeout` dos avisos guardados em `useRef<number[]>` e limpos no unmount para evitar leak.
- Edição inline no estoque: estado `editing: { sku: string; field: 'preco'|'precoCompra' } | null`.

## Ordem de execução
1. `mock.ts` (todas as outras páginas dependem dele).
2. Páginas em paralelo: Estoque, Clientes, Pedidos, Campanhas, Dashboard.
3. Páginas grandes em paralelo: Financeiro, Entregas, Conversas.
