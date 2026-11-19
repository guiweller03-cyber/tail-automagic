# Loja 2 — preparação e ativação

Projeto Supabase: `afmaedbatcedarszqczr` (`https://afmaedbatcedarszqczr.supabase.co`). O seletor já permite escolher a Loja 2; as APIs retornam 503 até que Supabase, Uazapi, segredo de webhook e `LOJA2_ATIVA=1` estejam configurados. O Pix da Loja 2 fica bloqueado no servidor.

## Esquema vazio

Execute `node scripts/gerar-schema-loja2.mjs` para gerar `output/loja2-schema.sql`. O arquivo contém as migrações de estrutura, políticas, buckets e configurações padrão, excluindo `003_seed_catalogo_ana.sql`, que carregaria produtos da Loja 1. Inspecione o SQL gerado e execute no SQL Editor **somente** do projeto `afmaedbatcedarszqczr`. Não rode `supabase db push` diretamente a partir da pasta principal, pois ela contém a carga de catálogo. O SQL deve ser executado apenas em projeto vazio; confirme antes que não haja tabelas ou dados de negócio no destino.

Depois, confirme no projeto novo: tabelas de negócio vazias, buckets `produto-fotos` (leitura pública) e `comprovantes` (privado), políticas RLS habilitadas e permissões adequadas. A aplicação usa chave privilegiada exclusivamente no servidor; não coloque `LOJA2_SUPABASE_SERVICE_ROLE_KEY` em variável `VITE_` ou `NEXT_PUBLIC_`.

## Credenciais

Configure no ambiente do CRM e do processo de automação: `LOJA2_SUPABASE_URL`, `LOJA2_SUPABASE_SERVICE_ROLE_KEY`, `LOJA2_UAZAPI_URL`, `LOJA2_UAZAPI_TOKEN` e `LOJA2_UAZAPI_WEBHOOK_SECRET`. O worker de follow-ups lê as mesmas variáveis do arquivo `.env` da VPS. A Loja 1 mantém as variáveis sem prefixo; configure também `UAZAPI_WEBHOOK_SECRET` para ela. Mantenha `LOJA2_ATIVA=0` até concluir o esquema e a conferência, então altere para `1` e reinicie CRM, automação e worker.

Configure a Uazapi de cada número para enviar POST a `https://<domínio>/api/webhook/whatsapp?loja=loja1&secret=<segredo-1>` ou `...?loja=loja2&secret=<segredo-2>`, respectivamente. Use segredos aleatórios distintos e HTTPS; não registre a URL completa com o segredo em logs. O endpoint rejeita loja ou segredo incorretos antes de processar a mensagem.

## Conferência antes de operar

1. Entre com um dos logins existentes, alterne a loja e confirme que clientes, conversas, produtos, pedidos e fotos estão vazios na Loja 2.
2. Cadastre um cliente e produto de teste com o mesmo telefone e SKU da Loja 1; confira que busca, dashboard e fotos permanecem separados.
3. Teste webhook inválido (401), webhook válido para cada número, envio, campanhas e follow-ups em ambas as lojas.
4. Confirme que `POST /api/crm/pix` responde 403 na Loja 2 e que o Mercado Pago permanece restrito à Loja 1.
5. Remova os dados de teste da Loja 2 e só então libere o número para operação.

As credenciais e o acesso autenticado ao novo projeto ainda são necessários para executar o SQL e concluir essa conferência no ambiente real.
