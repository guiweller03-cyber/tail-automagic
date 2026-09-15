import { cloudflareBindings } from "./cloudflare-env";
import { enviarMensagem } from "./uazapi";

/*
 * Protecao contra loop de requisicoes no CRM. Entre 07 e 09/09/2026 uma aba do
 * painel ficou chamando a API em loop (~13 req/s, 145 mil requisicoes num dia) e
 * gastou 7,77 GB de egress do Supabase. O binding CRM_API_RATE_LIMIT (wrangler.jsonc)
 * permite 120 req/min por login + rota; uso normal fica bem abaixo disso mesmo com
 * varias abas abertas. Acima do limite a rota responde 429 sem tocar no Supabase e
 * um alerta vai para o WhatsApp em ALERTA_WHATSAPP (no maximo 1 por hora por rota).
 */

const ALERTA_INTERVALO_MS = 60 * 60 * 1000;
const alertasEnviados = new Map<string, number>();

export async function bloquearLoopApi(login: string, pathname: string): Promise<Response | null> {
  const { CRM_API_RATE_LIMIT } = await cloudflareBindings();
  if (!CRM_API_RATE_LIMIT) return null;

  const chave = `${login}:${pathname}`;
  try {
    const { success } = await CRM_API_RATE_LIMIT.limit({ key: chave });
    if (success) return null;
  } catch (error) {
    console.error("[protecao-loop] erro_rate_limit", error);
    return null;
  }

  console.warn("[protecao-loop] limite_excedido", chave);
  await alertarLoop({ chave, login, pathname });

  return Response.json(
    { ok: false, erro: "Muitas requisicoes seguidas. Aguarde um minuto e recarregue a pagina." },
    { status: 429, headers: { "retry-after": "60" } },
  );
}

async function alertarLoop({
  chave,
  login,
  pathname,
}: {
  chave: string;
  login: string;
  pathname: string;
}): Promise<void> {
  // O Map vale por isolate e evita ler o KV a cada requisicao bloqueada.
  const agora = Date.now();
  if (agora - (alertasEnviados.get(chave) ?? 0) < ALERTA_INTERVALO_MS) return;
  alertasEnviados.set(chave, agora);

  const telefone = process.env.ALERTA_WHATSAPP?.replace(/\D/g, "");
  if (!telefone) return;

  try {
    // O KV evita repetir o alerta entre isolates e datacenters diferentes.
    const { CRM_CACHE } = await cloudflareBindings();
    const chaveKv = `alerta-loop:${chave}`;
    if (CRM_CACHE) {
      if (await CRM_CACHE.get(chaveKv)) return;
      await CRM_CACHE.put(chaveKv, new Date(agora).toISOString(), { expirationTtl: 3600 });
    }

    const horario = new Date(agora).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await enviarMensagem(
      telefone,
      [
        "⚠️ *Alerta CRM Petzap: possível loop de requisições*",
        `Rota: ${pathname}`,
        `Login: ${login}`,
        `Horário: ${horario}`,
        "A rota foi limitada automaticamente (mais de 120 chamadas por minuto).",
        "Feche e reabra as abas do painel. Se continuar, verifique o que está chamando essa rota.",
      ].join("\n"),
    );
  } catch (error) {
    console.error("[protecao-loop] erro_alerta", error);
  }
}
