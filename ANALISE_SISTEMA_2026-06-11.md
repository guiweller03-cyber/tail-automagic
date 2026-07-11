# Análise Completa do Sistema — 11/06/2026

Análise feita em todo o código do CRM (frontend, rotas de API, servidor de automação, autenticação, migrações e configuração de build). Abaixo está o que foi encontrado, o que foi corrigido e o que ficou apontado como pendência.

## Resumo executivo

| Verificação | Antes | Depois |
| --- | --- | --- |
| TypeScript (`tsc --noEmit`) | **~40 erros** em 12 arquivos | ✅ 0 erros |
| ESLint + Prettier | 3 erros de formatação | ✅ 0 erros |
| Build de produção (`vite build`) | OK | ✅ OK |
| Testes de segurança da IA (`ai-security.test.ts`) | Existiam mas sem script para rodar | ✅ 7/7 passando, script `npm test` criado |

---

## 1. Falhas corrigidas

### 1.1 Encoding corrompido (mojibake) — `src/contexts/`
O arquivo `vendas-store.ts` tinha sido salvo com encoding errado e os tipos centrais de venda estavam corrompidos:
- `"CartÃ£o"` → corrigido para `"Cartão"`
- `"ConcluÃ­da"` → corrigido para `"Concluída"`
- Em `VendasContext.tsx`: `"Operador (vocÃª)"` → `"Operador (você)"`

**Impacto real:** isso quebrava o PDV — o código do PDV usava `"Concluída"`/`"Cartão"` corretos, mas o tipo aceitava apenas as versões corrompidas, gerando 8 erros de compilação e comparações que nunca seriam verdadeiras em runtime (ex.: o filtro de vendas concluídas e o seletor de pagamento em cartão).

### 1.2 Página Automações com código apagado pela metade — `src/pages/Automacoes.tsx`
Os tipos `PosVendaCfg` e `Pergunta` e a constante `POSVENDA_KEY` tinham sido removidos do arquivo, mas continuavam sendo usados pela aba "Pós-venda ração" (7 erros de compilação). Reconstruí os três:
```ts
type Pergunta = { id: string; texto: string; aposDias: number };
type PosVendaCfg = { marca: string; categoria: string; perguntas: Pergunta[] };
const POSVENDA_KEY = "fluxo_posvenda_cfg";
```
A aba volta a compilar e a salvar as regras no `localStorage` como antes.

### 1.3 Dashboard — `src/lib/crm-supabase.ts`
- `cliente.proxRecompra` não existia (o campo do banco é `prox_recompra`, em snake_case). **O KPI "clientes com recompra prevista" estava sempre zerado** por ler um campo inexistente. Corrigido.
- `cliente.ultima` e `produto.estoque`/`produto.minimo` podem ser `null` no banco; o cálculo de leads da semana e de estoque crítico podia lançar erro. Adicionadas proteções (`?? ""` e `numeroSeguro`).

### 1.4 Webhook do WhatsApp — `src/routes/api/webhook.whatsapp.ts`
A função `extrairMensagensPayload` acessava propriedades (`messages`, `Message`, `data`…) sobre uma união de tipos que incluía `UazapiMessage`, o que o TypeScript rejeita (8 erros). Extraí o formato de container para um tipo nomeado (`UazapiPayloadContainer`) e ajustei os casts. O comportamento em runtime é o mesmo; agora é type-safe. Também exportei o tipo `UazapiWebhook` para uso externo.

### 1.5 Servidor de automação — `src/automation-server.ts`
O corpo do POST lido de `readJson()` (tipo `unknown`) era passado direto para `processarWebhookWhatsapp`. Agora é tipado como `UazapiWebhook` (mesmo tratamento que a rota `/api/webhook/whatsapp` já fazia).

### 1.6 Conversas — `src/pages/Conversas.tsx`
- `KanbanView` exigia `Conversa[]` mas recebia `ConversaView[]` (tipo mais rico usado na tela). Tornei o componente genérico (`<T extends Conversa>`) — o Kanban preserva os campos extras ao mover cards.
- `MediaPreview` exigia `message` obrigatório mas recebia `ConversaMensagem | undefined`. Agora aceita opcional e retorna `null` sem mídia.

### 1.7 Cupons — `src/pages/Cupons.tsx`
- A função `dateLabel` era chamada na coluna "Validade" mas **não existia no arquivo** (a tela de cupons quebraria ao renderizar). Adicionada (mesma implementação da página Indicações).
- `<Th />` vazio (coluna de ações) exigia `children`. Tornei `children` opcional em `Th` aqui e em `Indicacoes.tsx` (3 ocorrências lá).

### 1.8 Pedidos — `src/pages/Pedidos.tsx`
Ao arrastar um pedido para "pago" no Kanban, `setForma(p.pagamento)` passava uma `string` genérica onde se espera `FormaPagamento`. Agora valida contra a lista `FORMAS` e cai em `"Pix"` como padrão (mesmo padrão já usado em outro ponto do arquivo).

### 1.9 Recompra Prevista — `src/pages/RecompraPrevista.tsx`
Após o tratamento de erro da API, o TypeScript não conseguia restringir o tipo da resposta, gerando 4 erros. Reestruturado o fluxo de narrowing (`payload = data as RecompraApiData`) — sem mudança de comportamento.

### 1.10 Upload de foto de produto — `src/routes/api/crm.assistente.ts` e `crm.produtos.foto.ts`
O type guard `isProdutoFotoArquivo` declarava um predicado incompatível com `FormDataEntryValue` (3 erros). Parâmetro alterado para `unknown` e o filtro de fotos do assistente agora usa `foto is File`. Mesma validação em runtime.

### 1.11 Configuração de build — `vite.config.ts`
Os filtros de warnings do Rollup usavam tipos artesanais incompatíveis com os tipos reais do Vite 7 (4 erros). Reescrito usando `Rollup.RollupOptions["onwarn"]`/`["onLog"]` oficiais do Vite, e o bloco `nitro.hooks` (não declarado no tipo do preset da Lovable, mas aceito em runtime) recebeu um cast documentado.

### 1.12 Lint e formatação
- 3 erros do Prettier em `crm.assistente.ts` corrigidos via `eslint --fix`.
- Fins de linha normalizados (LF) nos arquivos tocados.

### 1.13 Scripts ausentes no `package.json`
Não existia forma padronizada de rodar typecheck e testes. Adicionados:
- `npm run typecheck` → `tsc --noEmit`
- `npm test` → `tsx --test src/**/*.test.ts` (roda os 7 testes de segurança da IA — todos passando)

---

## 2. Pontos verificados e que estão saudáveis

- **Autenticação**: middleware em `src/start.ts` protege todas as rotas; `/api/crm/*` retorna 401 sem sessão; cookie de sessão é HMAC-SHA256 assinado, HttpOnly, SameSite=Lax, com `Secure` em HTTPS. `CRM_AUTH_SECRET` está configurado no `.env`.
- **Rotas ↔ páginas**: todas as 17 páginas têm rota correspondente; nenhuma rota órfã.
- **Páginas conectadas ao banco**: Dashboard, Clientes, Conversas, Pedidos, PDV, Estoque, Entregas, Financeiro, Campanhas, Cupons, Indicações, Notas, Recompra Prevista, Produtos Procurados, Leads Totais e Assistente IA — todas buscam dados reais via `/api/crm/*` ou loaders.
- **Migrações Supabase**: 25 migrações presentes e em ordem cronológica.
- **`.env`**: todas as variáveis exigidas pelo `automation-server` estão definidas.
- **Webhooks**: `/api/webhook/whatsapp`, `/api/webhook/pagamento` e `/api/mercadopago/webhook` públicos (necessário para UazAPI/Mercado Pago) e funcionais.
- Sem `console.log` de debug espalhado (1 ocorrência legítima de log de servidor), sem `debugger`, sem TODO/FIXME pendentes no código-fonte.

---

## 3. Pendências e pontos de atenção (não alterados — exigem decisão sua)

1. **Página Automações está visualmente pronta, porém inativa de verdade.**
   - A aba "Fluxos gerais" renderiza a partir de uma lista vazia (`const automacoes = []`) — não há fluxos cadastrados nem backend para eles.
   - A aba "Fluxo Vermífugo" lista `petsProtecao = []` (vazio) e as configurações são salvas **apenas no `localStorage` do navegador** — nada vai para o Supabase e nenhuma automação real dispara a partir dali. A automação real existente é o webhook `/api/webhook/whatsapp`.
   - Para ativar de verdade seria preciso: tabela(s) no Supabase + rota `/api/crm/automacoes` + um job/cron que dispare as mensagens.

2. **`/api/uazapi/test` é uma rota pública** (sem login) que revela nome e status da instância do WhatsApp. O dado exposto é pequeno, mas se ninguém usa esse endpoint externamente, vale removê-lo da lista `isPublicRoute` em `src/start.ts` (1 linha).

3. **`UAZAPI_WEBHOOK_URL` consta no `.env.example` mas não é usada em lugar nenhum do código** — pode remover do example ou implementar o auto-registro do webhook.

4. **~40 arquivos `*.log` de desenvolvimento acumulados na raiz do projeto** (`codex-*.log`, `auth-dev*.log`, etc.). Estão no `.gitignore` (não vão para o git), mas podem ser apagados para limpar a pasta.

5. **Pasta `scripts/` está vazia** — pode ser removida.

---

## 4. Como validar

```bash
npm run typecheck   # 0 erros
npm run lint        # 0 erros
npm test            # 7/7 testes passando
npm run build       # build de produção OK
```

## 5. Arquivos modificados nesta análise

| Arquivo | Mudança |
| --- | --- |
| `src/contexts/vendas-store.ts` | Encoding dos tipos `Pay` e `StatusVenda` |
| `src/contexts/VendasContext.tsx` | Encoding de string |
| `src/pages/Automacoes.tsx` | Tipos `Pergunta`/`PosVendaCfg` e `POSVENDA_KEY` reconstruídos |
| `src/lib/crm-supabase.ts` | KPI de recompra (campo certo) + null-safety |
| `src/routes/api/webhook.whatsapp.ts` | Tipos do payload UazAPI |
| `src/automation-server.ts` | Tipagem do webhook |
| `src/pages/Conversas.tsx` | `KanbanView` genérico, `MediaPreview` opcional |
| `src/pages/Cupons.tsx` | `dateLabel` adicionada, `Th` opcional |
| `src/pages/Indicacoes.tsx` | `Th` opcional |
| `src/pages/Pedidos.tsx` | Validação de forma de pagamento no Kanban |
| `src/pages/RecompraPrevista.tsx` | Narrowing da resposta da API |
| `src/routes/api/crm.assistente.ts` | Type guard de foto |
| `src/routes/api/crm.produtos.foto.ts` | Type guard de foto |
| `vite.config.ts` | Tipos oficiais do Rollup/Vite |
| `package.json` | Scripts `typecheck` e `test` |
