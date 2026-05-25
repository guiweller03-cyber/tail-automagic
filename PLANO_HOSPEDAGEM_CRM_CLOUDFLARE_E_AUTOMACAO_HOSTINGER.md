# Plano de hospedagem do CRM e da automacao

Data do plano: 2026-05-25

## Resumo executivo

O projeto atual e um app full-stack em TanStack Start/Vite, nao apenas um frontend estatico. O CRM tem telas React em `src/pages` e `src/routes`, mas tambem depende de rotas server-side em `src/routes/api` para ler/gravar no Supabase, gerar Pix no Mercado Pago, chamar OpenAI e enviar mensagens pela UAZAPI.

Arquitetura recomendada:

- Cloudflare Pages: hospedar o CRM administrativo, com build do app e rotas server-side necessarias ao painel.
- Hostinger VPS: hospedar a automacao operacional que recebe webhooks do WhatsApp/UAZAPI e Mercado Pago, processa IA, cria pedidos e envia mensagens.
- Supabase: continuar como banco principal, aplicando as migrations em `supabase/migrations`.
- Cloudflare DNS: apontar `crm.seudominio.com` para Cloudflare Pages e `api.seudominio.com` ou `automacao.seudominio.com` para a VPS.

Essa separacao reduz o risco de webhooks pesados e integrações externas ficarem presos ao ciclo de deploy do CRM, mas preserva o CRM rapido em Pages.

## O que existe hoje no projeto

### Stack detectada

- App: TanStack Start + React + Vite.
- Build: `npm run build`.
- Runtime Cloudflare ja previsto: `@cloudflare/vite-plugin` e `wrangler.jsonc`.
- Banco: Supabase via REST API.
- Integracoes: UAZAPI, OpenAI, Mercado Pago.
- UI: shadcn/Radix, Tailwind, React Query e TanStack Router.

### Arquivos principais

- `package.json`: scripts `dev`, `build`, `preview`, `lint`.
- `vite.config.ts`: usa `@lovable.dev/vite-tanstack-config` e define entrada server `src/server.ts`.
- `wrangler.jsonc`: app Cloudflare com `nodejs_compat` e `main: src/server.ts`.
- `src/server.ts`: wrapper SSR/server para TanStack Start.
- `src/routes/api/*`: endpoints server-side do CRM e dos webhooks.
- `src/lib/supabase.ts`, `src/lib/crm-supabase.ts`, `src/lib/indicacoes-supabase.ts`: acesso ao Supabase.
- `src/lib/openai.ts`: IA do atendimento e assistente do admin.
- `src/lib/uazapi.ts`: envio de mensagens WhatsApp.
- `src/lib/mercadopago.ts`: Pix e consulta de pagamento.
- `supabase/migrations/*`: schema de conversas, clientes, produtos, vendas, pedidos, cupons, comissoes e configuracoes.

### Rotas de API atuais

Rotas de CRM:

- `GET/POST/PATCH /api/crm/clientes`
- `GET/POST/PATCH /api/crm/produtos`
- `GET/POST/PATCH /api/crm/pedidos`
- `GET /api/crm/dashboard`
- `GET/PATCH/POST /api/crm/conversas`
- `POST /api/crm/assistente`
- `GET/POST /api/crm/indicacoes`
- `GET /api/crm/produtos-procurados`
- `POST /api/crm/pix`

Rotas de automacao/webhook:

- `GET/POST /api/webhook/whatsapp`
- `GET/POST /api/webhook/pagamento`
- `POST /api/mercadopago/webhook`
- `GET /api/uazapi/test`

## Riscos que precisam ser resolvidos antes do deploy publico

### 1. Segredos reais no `.env`

O arquivo `.env` local contem credenciais reais. Antes de qualquer hospedagem:

- Revogar e gerar novos tokens da UAZAPI.
- Revogar e gerar nova chave da OpenAI.
- Revogar e gerar novo token do Mercado Pago.
- Revisar as chaves do Supabase.
- Garantir que `.env` nunca seja commitado.
- Usar somente variaveis de ambiente nos painéis da Cloudflare e Hostinger.

### 2. CRM sem autenticacao visivel

Nao encontrei fluxo de login, sessao, cookie, JWT ou middleware protegendo as rotas administrativas. Se publicar como esta, qualquer pessoa que descubra as URLs pode consultar ou alterar clientes, produtos, pedidos e conversas.

Antes de producao, implementar pelo menos uma destas opcoes:

- Recomendado: Cloudflare Access protegendo `crm.seudominio.com`.
- Alternativa: autenticação Supabase Auth com usuarios administrativos.
- Medida minima temporaria: Basic Auth ou token administrativo em middleware server-side.

### 3. Webhooks sem validacao de origem

As rotas de webhook aceitam POST e processam eventos sem verificacao forte de assinatura/origem. Antes de expor:

- Adicionar segredo no path ou header para UAZAPI.
- Validar assinatura/notificacao do Mercado Pago, quando disponivel.
- Ignorar payloads fora do formato esperado.
- Aplicar rate limit no Cloudflare ou no Nginx da VPS.

### 4. Uso de chave Supabase ampla no backend

O backend usa `SUPABASE_ANON_KEY`/chave do Supabase para varias operacoes. Isso pode funcionar no servidor, mas as policies atuais precisam ser revisadas, porque algumas migrations permitem acesso `anon`/`authenticated` amplo.

Antes de producao:

- Revisar RLS em todas as tabelas publicas.
- Evitar escrita anonima ampla em tabelas de CRM.
- Separar chave publica do frontend de chave server-side.
- Considerar service role somente na VPS/Pages server-side, nunca no browser.

## Arquitetura alvo

```text
Usuario admin
  -> crm.seudominio.com
  -> Cloudflare Pages
  -> Rotas CRM server-side ou proxy seguro
  -> Supabase / OpenAI / Mercado Pago / UAZAPI

UAZAPI WhatsApp
  -> automacao.seudominio.com/webhooks/whatsapp
  -> Hostinger VPS Node service
  -> Supabase / OpenAI / Mercado Pago / UAZAPI

Mercado Pago
  -> automacao.seudominio.com/webhooks/mercadopago
  -> Hostinger VPS Node service
  -> Supabase / UAZAPI
```

## Decisao tecnica principal

Existem duas formas viaveis de separar o projeto.

### Opcao A, recomendada: CRM full-stack na Cloudflare Pages e automacao na VPS

Manter no Cloudflare Pages as rotas necessarias para o painel administrativo:

- `/api/crm/dashboard`
- `/api/crm/clientes`
- `/api/crm/produtos`
- `/api/crm/pedidos`
- `/api/crm/indicacoes`
- `/api/crm/produtos-procurados`
- `/api/crm/assistente`
- `/api/crm/conversas` para operacoes do operador humano

Mover para a VPS as rotas que sao automacao externa:

- `/api/webhook/whatsapp`
- `/api/webhook/pagamento`
- `/api/mercadopago/webhook`
- rotinas de reprocessamento, filas e jobs futuros

Vantagem: menor refatoracao, CRM continua usando o app atual e os webhooks ficam em runtime Node sob seu controle.

### Opcao B: CRM estatico na Pages e toda API na VPS

Buildar somente frontend na Pages e redirecionar `/api/*` para a VPS.

Vantagem: runtime unico para backend.

Desvantagem: exige mais cuidado com CORS, autenticação, proxy, cookies e disponibilidade da VPS. Se a VPS cair, todo o CRM perde dados dinamicos.

Minha recomendacao para este projeto e a Opcao A.

## Plano de execucao

### Fase 0: preparar seguranca e repositorio

1. Rotacionar todos os segredos que apareceram no `.env`.
2. Confirmar que `.env` esta no `.gitignore`.
3. Atualizar `.env.example` sem valores reais.
4. Criar variaveis separadas:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` ou chave server-side adequada
   - `OPENAI_API_KEY`
   - `UAZAPI_URL`
   - `UAZAPI_TOKEN`
   - `MP_ACCESS_TOKEN`
   - `MP_WEBHOOK_URL`
   - `UAZAPI_WEBHOOK_URL`
   - `WEBHOOK_SHARED_SECRET`
   - `CRM_ADMIN_SECRET` ou configurar Cloudflare Access
5. Adicionar protecao de acesso ao CRM antes do deploy publico.
6. Adicionar validacao de webhook antes de apontar UAZAPI e Mercado Pago para producao.

### Fase 1: preparar Supabase

1. Criar ou escolher o projeto Supabase de producao.
2. Rodar as migrations de `supabase/migrations` em ordem.
3. Verificar tabelas principais:
   - `conversas`
   - `clientes`
   - `produtos`
   - `vendas`
   - `pedidos`
   - `venda_itens`
   - `produtos_procurados`
   - `crm_configuracoes`
   - `aprendizados`
   - `influenciadores`
   - `cupons`
   - `comissoes_influenciadores`
4. Revisar RLS e grants antes de liberar o CRM.
5. Popular catalogo inicial, se necessario, com `003_seed_catalogo_ana.sql`.
6. Testar manualmente:
   - listar produtos;
   - criar cliente;
   - criar pedido;
   - registrar conversa;
   - atualizar status de pagamento.

### Fase 2: publicar CRM na Cloudflare Pages

1. Subir o repositorio para GitHub/GitLab.
2. Criar projeto em Cloudflare Pages conectado ao repositorio.
3. Configurar build:
   - Framework preset: Vite ou configuracao manual.
   - Build command: `npm run build`.
   - Output directory: validar apos build; para Vite puro costuma ser `dist`, mas TanStack Start com plugin Cloudflare pode gerar estrutura propria. Confirmar no primeiro deploy.
4. Configurar variaveis de ambiente de producao na Cloudflare:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`, se o assistente admin continuar na Pages
   - `UAZAPI_URL` e `UAZAPI_TOKEN`, se o CRM continuar enviando mensagem manual pela rota `/api/crm/conversas`
   - `MP_ACCESS_TOKEN`, se `/api/crm/pix` continuar na Pages
   - `MP_WEBHOOK_URL=https://automacao.seudominio.com/webhooks/mercadopago`
5. Configurar dominio:
   - `crm.seudominio.com` apontando para Pages.
6. Ativar Cloudflare Access ou outra autenticação para o dominio do CRM.
7. Fazer smoke test:
   - abrir dashboard;
   - carregar clientes;
   - carregar estoque;
   - criar pedido manual;
   - testar assistente admin;
   - testar envio manual de conversa, se mantido no CRM.

Observacao: a documentacao atual da Cloudflare Pages lista Vite com `npm run build` e diretorio `dist`, e permite variaveis de ambiente por ambiente de producao/preview. Mesmo assim, este projeto usa TanStack Start com plugin Cloudflare, entao o primeiro deploy deve validar o output real gerado pelo build.

## Fase 3: extrair automacao para VPS Hostinger

### Estrutura recomendada

Criar um servico separado dentro do repositorio:

```text
apps/
  automacao/
    package.json
    src/
      server.ts
      routes/
        whatsapp.ts
        mercadopago.ts
      lib/
        supabase.ts
        openai.ts
        uazapi.ts
        mercadopago.ts
```

Reaproveitar codigo atual:

- Mover a logica de `src/routes/api/webhook.whatsapp.ts` para `apps/automacao/src/routes/whatsapp.ts`.
- Mover a logica de `src/routes/api/webhook.pagamento.ts` e `src/routes/api/mercadopago.webhook.ts` para `apps/automacao/src/routes/mercadopago.ts`.
- Compartilhar ou duplicar inicialmente os helpers de:
  - `src/lib/supabase.ts`
  - `src/lib/openai.ts`
  - `src/lib/uazapi.ts`
  - `src/lib/mercadopago.ts`
  - `src/lib/pix-log.ts`
  - `src/lib/ai-security.ts`
  - `src/lib/racoes-tecnicas.ts`

Para velocidade, pode comecar duplicando os helpers na automacao. Depois, se o projeto crescer, extrair um pacote compartilhado.

### Runtime sugerido na VPS

- Ubuntu na VPS Hostinger.
- Node.js LTS.
- PM2 para manter o processo vivo.
- Nginx como reverse proxy.
- Certbot ou SSL gerenciado pelo painel, se aplicavel.
- Deploy via Git pull.

### Endpoints da automacao

Usar paths novos e claros:

- `GET /health`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `GET /webhooks/mercadopago`
- `POST /webhooks/mercadopago`

Manter redirects temporarios se precisar compatibilidade:

- `/api/webhook/whatsapp -> /webhooks/whatsapp`
- `/api/webhook/pagamento -> /webhooks/mercadopago`
- `/api/mercadopago/webhook -> /webhooks/mercadopago`

### Deploy na Hostinger VPS

1. Criar VPS Hostinger com Ubuntu.
2. Acessar via SSH.
3. Instalar pacotes:

```bash
sudo apt update
sudo apt install -y nginx git curl
```

4. Instalar Node.js LTS.
5. Instalar PM2:

```bash
npm install -g pm2
```

6. Clonar repositorio:

```bash
sudo mkdir -p /var/www/mundo-pet
sudo chown -R $USER:$USER /var/www/mundo-pet
git clone <URL_DO_REPOSITORIO> /var/www/mundo-pet
```

7. Instalar e buildar automacao:

```bash
cd /var/www/mundo-pet
npm install
npm run build
```

Depois da extracao, o ideal e ter scripts especificos:

```bash
npm run automacao:build
npm run automacao:start
```

8. Criar arquivo de ambiente somente na VPS:

```bash
/var/www/mundo-pet/apps/automacao/.env
```

9. Subir com PM2:

```bash
pm2 start apps/automacao/dist/server.js --name mundo-pet-automacao
pm2 save
pm2 startup
```

10. Configurar Nginx para `automacao.seudominio.com`:

```nginx
server {
  server_name automacao.seudominio.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

11. Configurar HTTPS.
12. Testar:

```bash
curl https://automacao.seudominio.com/health
curl https://automacao.seudominio.com/webhooks/whatsapp
curl https://automacao.seudominio.com/webhooks/mercadopago
```

### DNS

No Cloudflare DNS:

- `crm` como CNAME do projeto Pages.
- `automacao` como A record para o IP da VPS Hostinger.
- Proxy Cloudflare ativado para `automacao`, salvo se algum webhook reclamar de proxy. Se reclamar, deixar DNS only ou criar regra especifica.

## Fase 4: reconfigurar provedores externos

### UAZAPI

Configurar webhook de WhatsApp para:

```text
https://automacao.seudominio.com/webhooks/whatsapp?secret=<SEGREDO>
```

Ou, melhor, enviar segredo via header se a UAZAPI permitir.

### Mercado Pago

Configurar notification URL para:

```text
https://automacao.seudominio.com/webhooks/mercadopago
```

Atualizar no ambiente:

```text
MP_WEBHOOK_URL=https://automacao.seudominio.com/webhooks/mercadopago
```

### CRM

Se o CRM chamar a automacao diretamente, criar variavel:

```text
AUTOMACAO_API_URL=https://automacao.seudominio.com
```

Usar essa URL para operacoes que devem rodar na VPS.

## Fase 5: observabilidade e manutencao

### Cloudflare Pages

Monitorar:

- Deploys de producao e preview.
- Logs de Functions, se usadas.
- Access logs do dominio do CRM.
- Erros 4xx/5xx.

### Hostinger VPS

Monitorar:

```bash
pm2 status
pm2 logs mundo-pet-automacao
systemctl status nginx
df -h
free -m
```

Adicionar:

- logrotate para logs grandes;
- backup do `.env` em local seguro;
- alertas basicos de uptime;
- rotina de update mensal do sistema;
- deploy script com rollback simples.

## Checklist de go-live

- [ ] Segredos rotacionados.
- [ ] `.env` local nao commitado.
- [ ] Cloudflare Access ou login administrativo ativo.
- [ ] Webhooks protegidos por segredo/assinatura.
- [ ] Supabase RLS revisado.
- [ ] Migrations aplicadas em producao.
- [ ] CRM publicado em `crm.seudominio.com`.
- [ ] Automacao publicada em `automacao.seudominio.com`.
- [ ] UAZAPI apontando para a VPS.
- [ ] Mercado Pago apontando para a VPS.
- [ ] Pedido manual testado no CRM.
- [ ] Mensagem WhatsApp real testada em numero controlado.
- [ ] Pix real ou sandbox testado.
- [ ] PM2 configurado para reiniciar apos reboot.
- [ ] Nginx com HTTPS funcionando.

## Ordem recomendada para implementar no codigo

1. Adicionar autenticação/protecao ao CRM.
2. Adicionar validacao de segredo nos webhooks.
3. Criar `apps/automacao`.
4. Mover webhooks para a automacao.
5. Ajustar `MP_WEBHOOK_URL` e `UAZAPI_WEBHOOK_URL`.
6. Deployar CRM na Pages.
7. Deployar automacao na VPS.
8. Fazer testes reais controlados.

## Referencias consultadas

- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages bindings/environment variables: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Pages routing/functions: https://developers.cloudflare.com/pages/functions/routing/
- Hostinger Node.js deploy guide: https://www.hostinger.com/tutorials/deploy-node-js-application
- Hostinger Node.js support/VPS options: https://support.hostinger.com/en/articles/1583661-is-node-js-supported-at-hostinger
