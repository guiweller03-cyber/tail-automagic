# Correção: IA não registrava venda do comprovante Pix

> Anotação de continuação — feito em 07/06/2026. Retomar quando puder.

## O problema (sintoma)

- Clicar em **"Atualizar IA"** mostrava toast verde ("Contexto do cliente atualizado pela IA"), mas **nenhuma venda era registrada** no sistema.
- Dúvida: não sabíamos se a IA entendia contexto / lia comprovantes.

## Causa-raiz (comprovada testando)

A IA **nunca conseguia ler os comprovantes Pix em imagem**, por isso nunca registrava a venda.

- As imagens do WhatsApp ficam salvas com URL `mmg.whatsapp.net/...`, que vêm **criptografadas**.
- Teste: a URL retorna `content-type: application/octet-stream` com bytes `57 f2 d5 75` (NÃO é JPEG, que começa com `ff d8 ff`).
- O código baixava essa URL, via que não era imagem e **descartava** (`imageInputUrl` em `openai.ts` rejeita o que não for `image/`).
- Resultado: a OpenAI só recebia o texto "[Imagem recebida]" → concluía "não é comprovante" → **nenhuma venda**.

NÃO era a chave da OpenAI (testada, 200 OK), nem o Supabase (20 conversas com histórico), nem o botão (backend retorna 200 e atualiza o cliente).

## O que JÁ funcionava (não mexer)

- IA entende contexto da conversa (`gerarRespostaWhatsapp`).
- Registrar venda no CRM (`registrarPedidoDoWhatsapp`).
- Baixar estoque + lançar faturamento (`registrarFaturamentoPedidoPago` → `baixarEstoqueDaVenda`).
- Ler comprovante por **link de imagem público** e por **texto**.

## A correção aplicada (3 arquivos)

Faltava 1 passo: baixar a mídia **descriptografada** pela UAZAPI antes de mandar pra OpenAI.
Endpoint: `POST {UAZAPI_URL}/message/download` body `{ id: messageid }` header `token` →
retorna `{ fileURL: "https://<host>/files/....jpg", mimetype }` (imagem real, fetchável).

1. **`src/lib/uazapi.ts`** — novas funções `baixarMidiaUazapi` e `urlMidiaDescriptografada`.
2. **`src/routes/api/webhook.whatsapp.ts`** — usa `urlMidiaDescriptografada` em `tentarConfirmarPixPorComprovante` (fluxo automático quando chega mensagem nova). **← o que importa pro objetivo.**
3. **`src/routes/api/crm.conversas.ts`** — usa `urlMidiaDescriptografada` em `confirmarComprovantesPixDoHistorico` (botão "Atualizar IA").

### Prova de que funciona

Rodei o código novo num comprovante real:
```
urlMidiaDescriptografada → baixou: petzap.uazapi.com/files/...jpg
extrairComprovantePix → {
  ehComprovantePix: true,
  valor: 94.8,
  pagador: "LEONARDO DOS SANTOS",
  recebedor: "Guilherme Henrique Weller",
  idTransacao: "E10573521...",
  confianca: 1
}
```
Isso dispara o registro automático da venda (→ estoque → faturamento).

## Importante entender

- **Botão "Atualizar IA"** funciona, mas só reprocessa **UMA** conversa aberta, manualmente. NÃO é o que liga a automação.
- **Quem responde sozinho + registra a venda é o webhook** `/api/webhook/whatsapp`, quando chega mensagem nova. Para isso a UAZAPI precisa estar enviando para a URL pública do site (`UAZAPI_WEBHOOK_URL`).
- **Produção roda no Cloudflare** e usa os secrets do Cloudflare, NÃO o `.env` local. Para a correção valer no ar, precisa **publicar/deployar**.

## Próximos passos (amanhã)

- [ ] Publicar/deployar no Cloudflare para a correção entrar no ar.
- [ ] Testar de verdade: mandar um comprovante Pix real de um pedido pendente pelo WhatsApp e ver se a venda aparece (CRM + estoque + faturamento).
- [ ] (Opcional) Confirmar que a UAZAPI está com o webhook apontando para a URL publicada.

## Limitações conhecidas (decidir se vale corrigir)

1. **PDF ainda não é lido** — a OpenAI (visão / `image_url`) só aceita imagem. Cliente que manda foto/print funciona; comprovante em PDF puro precisaria de conversão PDF→imagem. (Na prática os comprovantes vistos eram imagens.)
2. **"Atualizar IA" em conversas antigas** pode não baixar imagens muito velhas — a UAZAPI só guarda mídia recente em cache (erro 400 "Message does not contain downloadable media"). No fluxo em tempo real (mensagem nova) isso não acontece.

## Observação solta

- `CRM_AUTH_SECRET` está vazio no `.env`, mas há fallback derivado de login+senha admin (`auth.ts` → `getSessionSecret`), então não quebra login.
