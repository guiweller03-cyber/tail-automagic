# Deploy da automacao na VPS

Dominio gratuito sem cadastro:

```text
https://IP_DA_VPS.sslip.io
```

URLs finais:

```text
WhatsApp/UAZAPI: https://IP_DA_VPS.sslip.io/webhooks/whatsapp
Mercado Pago:   https://IP_DA_VPS.sslip.io/webhooks/mercadopago
Healthcheck:    https://IP_DA_VPS.sslip.io/health
```

Para HTTPS em producao com dominio gratis, use Caddy com `deploy/Caddyfile`.
O Mercado Pago aceita HTTPS URL no painel de Webhooks em modo producao.
