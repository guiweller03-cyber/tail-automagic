# Recompra — motor unificado v2

Regra: primeira compra prevê a segunda pelos pets e pela ração. Do segundo abastecimento
em diante, a média de dias entre as compras do histórico prevê a próxima compra.

## Arquitetura

- `recompra-calculo.ts`: peso, consumo, agrupamento de compras e previsão.
- `recompra-supabase.ts`: reconstrói TODA a projeção do cliente em ordem cronológica.
- Vendas de PDV/WhatsApp, edição/cancelamento, edição de cliente, cadastro manual e recálculo
  usam o mesmo processamento.
- `recompra_compras_manuais`: compras informadas no painel; não cria receitas nem baixa estoque.
- `recompra_previsoes.calculo`: memória da conta, grupo, compra de referência, consumos,
  quantidade do abastecimento, dias passados, intervalos excluídos e pendências.
- `salvar_previsoes_recompra`: gravação atômica, somente servidor, com controle de versão e
  nova leitura se outra operação alterar a projeção durante o cálculo.

## Identidade e histórico

Uma previsão por espécie + conjunto de pets. Normaliza acentos, caixa, espaços e ordem dos nomes.
O cadastro não tem IDs individuais de pets: renomear exige manter o vínculo nos registros anteriores.
Não inferir identidades por aproximação textual.

Sem pet explícito, considera apenas os pets compatíveis com a espécie. Quando o conjunto é conhecido,
compras sem nome e compras desses mesmos pets compartilham histórico.
Grupos diferentes não apagam previsões uns dos outros, mesmo comprando o mesmo SKU.
Trocar SKU não zera histórico. Compras antigas cadastradas depois não substituem a referência recente.

O histórico é paginado e inclui vendas não canceladas e compras manuais. A data-base usa
`criado_em`, com `faturado_em` apenas como fallback, no fuso de São Paulo.
O peso usa nome do item gravado na venda × quantidade, depois catálogo e marcador compatível.
Compras manuais guardam peso total. SKU avulso fica na memória de cálculo; a FK do catálogo fica nula.

## Abastecimentos próximos

Compras até três dias desde o INÍCIO do abastecimento são somadas; a janela não é encadeada.
Desconta os dias já passados até a última compra, inclusive se ainda não há histórico.
Exemplo: 15 kg no dia 1 + 15 kg no dia 3, consumo de 420 g/dia:
arredondar(30.000 ÷ 420) − 2 = 69 dias restantes desde a compra do dia 3.

## Primeira previsão

Estima consumo na data da compra usando peso informado ou médias de raça/porte e crescimento.
Peso informado sem data de pesagem não é descartado. Pesagem posterior não é usada retroativamente.
Integra consumo dia a dia; o crescimento estimado de filhotes é considerado durante o pacote.
Porte padrão vem do produto + observações do cliente ("pequeno", "mini", "small", "toy" → pequeno;
"grande", "maxi", "large" → grande; senão médio). No cadastro do pet, porte abreviado vale: PP, P, M, G, GG.

Consumo usa peso metabólico: g/dia = kg^0,75 × constante de `CONSUMO_G_POR_KG075_DIA`
(linha/fase, cão ou gato). Consumo linear por kg subestimava cães pequenos (lulu 2,3 kg saía
com 37 g/dia; o real é ~56 g) e superestimava os grandes. Referências: 2,5 kg ≈ 55 g, 10 kg ≈ 170 g,
30 kg ≈ 385 g (adulto Life). São aproximações, não tabelas verificadas por SKU.
A fase continua vindo da classificação da ração.
Sem peso do pacote ou consumo utilizável, fica PENDENTE: não inventa 30 dias.

## Teto e conferências de sanidade (16/10/2026)

- Ciclo automático (estimativa ou histórico) limitado a `CICLO_MAX_AUTOMATICO_DIAS` = 120 dias.
  Pacote que "duraria" mais (venda duplicada, peso errado, pacote grande para pet pequeno)
  volta a ser contatado no teto. Ciclo manual continua aceitando até 365.
- Vendas duplicadas: item idêntico (nome, pet, quantidade, preço) em outra venda referente ao
  mesmo dia — inclusive "Venda retroativa (dd/mm)" apontando para a data da original — conta uma vez.

Marcadores automáticos antigos do PDV não congelam dias/consumo. Apenas `confirmado=true`
permite usar valores explicitamente informados. O leitor combina SKU + pet e rejeita ambiguidade.
Modelos por SKU são presets do formulário, não consumo comprovado de todos os animais.

## Segundo abastecimento em diante (regra simples desde 16/10/2026)

    ciclo = média simples dos dias entre uma compra e a seguinte

Compras com até 3 dias de diferença contam como uma só. Intervalos fora de 3–180 dias não entram
(ficam na memória como descartados). Retorno após mais de 180 dias reinicia pela estimativa dos pets.
Não escala por kg nem desconta dias do abastecimento: peso lançado errado não distorce o ciclo.
O consumo inferido (kg ÷ dias) é só informativo. Limite de 1–120 dias.
Exemplo: compras em 01/03, 31/03, 29/06, 29/07 e 28/08 → (30+90+30+30)/4 = 45 dias.

Comprar novamente não comprova que acabou. Estoque doméstico e compras em outras lojas não são
conhecidos pelo histórico de vendas.

## Ajustes e persistência

Ciclo manual vale somente para aquela compra; sobrevive ao recálculo e é limpo na compra seguinte.
Remover o ajuste recalcula o automático, inclusive pendências.
O formulário distingue sugestão automática de ciclo digitado (`cicloConfirmado`).
Chave de idempotência evita duplicar compras manuais ao tentar novamente.

Preserva ID e flags da previsão quando a referência é a mesma; compra nova reinicia contato.
Cancelamento retira o fato e reconstrói a projeção. Corrigir data manual atualiza o histórico manual.
A atualização SQL é atômica; não apaga previsões antes de garantir a gravação das novas.

## Painel e contatos

Separa consumo estimado pelos pets, intervalo médio e ciclo utilizado.
Mostra a memória textual da conta. Não usa 65%/85% como suposta precisão de IA.
Pendências aparecem sem data válida e ficam fora das projeções de demanda e das aprovações.
Próxima compra = data-base + ciclo. Alerta: 3 dias antes para pequeno/gato; 5 para médio/grande.
A fila de aprovação tem janela separada de 10 dias por padrão.

## Verificação e aplicação

- `npm test`, `npm run typecheck`, `npm run build`.
- `node --env-file=.env scripts/recompra-schema.mjs`: verifica migration/RPC com rollback.
- O mesmo comando com `--aplicar`: aplica estrutura e preserva compras manuais antigas.
- `npx tsx --env-file=.env scripts/auditar-recompra.ts`: simula e compara todos os clientes.
- O mesmo comando com `--aplicar`: salva backup/comparação e aplica as projeções.
- Nenhum desses scripts envia mensagens. Relatórios ficam em `output/`, ignorado pelo Git.

Toda alteração de regra deve atualizar este documento e testes de resultados de negócio.

### Aplicação verificada em 12/10/2026

- 101 testes aprovados, typecheck e build de produção concluídos.
- Estrutura aplicada, com RLS e execução da RPC restrita ao servidor verificadas.
- 68 clientes reprocessados: 72 registros anteriores consolidados em 71 previsões;
  17 com histórico e quatro pendentes. Nenhuma venda excluída e nenhuma mensagem enviada.
- Backup e comparação: `output/recompra-2026-10-12T14-50-54-729Z/` (dados privados, fora do Git).
- API autenticada em produção confirmou os totais e ausência de data nas pendências.
- Telas verificadas no navegador, inclusive detalhe de pendência e largura móvel, sem erro de console.
- Durante a troca de publicação, a aba antiga tentou buscar chunks removidos (404).
  Uma sessão nova carregou a publicação atual; abas abertas antes do deploy precisam recarregar sem cache.
- Publicação Cloudflare: `43d6b170-d4be-43ca-9f81-5e0642e76fcf`.

## IA auditora (18/11/2026)

A IA não altera ciclo sozinha. No Painel de Recompra, "Auditar com IA" envia em lotes de 5
(até 40 por clique) as previsões não contatadas que estão a até 21 dias, atrasadas, pendentes
ou com ciclo ≥ 90 dias; quem está mais perto de recomprar vai primeiro e pendências por último.
Previsões auditadas nas últimas 24 h ficam de fora.

Para cada previsão o modelo principal (`OPENAI_MODEL`, padrão gpt-5.5) recebe: dados da previsão,
pets do cálculo, histórico de vendas (`historicoVendasRecompra`), comparação com o histórico e os
fatos que o cliente contou nas conversas (`cliente_dados_observados`). Devolve veredito
(`ok`/`ajustar`/`verificar`), ciclo sugerido (7–180), confiança, justificativa e alertas.
`interpretarRespostaAuditoria` valida tudo: ciclo fora da faixa ou veredito inventado viram
`verificar`.

As auditorias ficam em `crm_configuracoes.chave = 'recompra_auditoria_ia'` (sem migration),
no máximo 400. Cada uma guarda `ultimaCompraIso`: compra nova invalida a sugestão.
"Aplicar N dias" usa o mesmo ajuste manual (`PATCH tipo: "ciclo_manual"`).
Código: `src/lib/recompra-auditoria-ia.ts`.
