import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listarClientes } from "@/lib/crm-supabase";
import type { Cliente } from "@/lib/crm-types";
import { enviarMensagemLonga, enviarMidia, enviarMidiaBase64 } from "@/lib/uazapi";

type DisparoModo = "automatico" | "semi";

type DisparoInput = {
  modo?: DisparoModo;
  mensagem?: string;
  clienteIds?: string[];
  limite?: number;
  midiaUrl?: string;
  midiaBase64?: string;
  midiaTipo?: "image" | "audio" | "video" | "document";
  midiaNome?: string;
  midiaMimeType?: string;
};

type DisparoResultadoItem = {
  id: string;
  nome: string;
  telefone: string;
  ok: boolean;
  erro?: string;
};

const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 50;
const SEND_GAP_MS = 650;
const NOME_UTIL_RE = /[\p{L}\p{N}]/u;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function telefoneValido(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

function limiteSeguro(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return LIMITE_PADRAO;
  return Math.min(LIMITE_MAXIMO, Math.max(1, Math.trunc(parsed)));
}

function diasDesdeData(value?: string): number | null {
  if (!value || value === "atrasada") return value === "atrasada" ? 999 : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function scoreAutomatico(cliente: Cliente): number {
  if (!NOME_UTIL_RE.test(cliente.nome)) return 0;

  let score = 0;
  const diasRecompra = diasDesdeData(cliente.proxRecompra);

  if (cliente.perfil === "Risco") score += 45;
  if (cliente.perfil === "VIP" || cliente.perfil === "Premium") score += 15;
  if (cliente.pedidos <= 0) score += 25;
  if (cliente.pedidos > 0 && cliente.totalGasto > 0) score += 10;
  if (diasRecompra !== null && diasRecompra >= 0) score += Math.min(35, 12 + diasRecompra);
  if (cliente.followUpManual?.status === "pendente") score += 20;
  if (cliente.telefone) score += 5;

  return score;
}

function ordenarAutomaticos(clientes: Cliente[]): Cliente[] {
  return [...clientes]
    .filter((cliente) => telefoneValido(cliente.telefone))
    .map((cliente) => ({ cliente, score: scoreAutomatico(cliente) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.cliente.nome.localeCompare(b.cliente.nome))
    .map((item) => item.cliente);
}

function mensagemPersonalizada(template: string, cliente: Cliente): string {
  const pets = cliente.pets?.filter(Boolean).join(", ") || "seu pet";
  const primeiroPet = cliente.pets?.find(Boolean) ?? "seu pet";

  return template
    .replaceAll("{nome}", cliente.nome || "tudo bem")
    .replaceAll("{pet}", primeiroPet)
    .replaceAll("{pets}", pets)
    .trim();
}

function mimetypeDisparo(tipo?: DisparoInput["midiaTipo"]): string | undefined {
  if (tipo === "image") return "image/jpeg";
  if (tipo === "audio") return "audio/mpeg";
  if (tipo === "video") return "video/mp4";
  if (tipo === "document") return "application/octet-stream";
  return undefined;
}

function mediaUrlValida(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}

function mediaBase64Valida(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  return /^[a-zA-Z0-9+/]+={0,2}$/.test(trimmed) ? trimmed : "";
}

function selecionarClientes(clientes: Cliente[], input: DisparoInput): Cliente[] {
  const modo: DisparoModo = input.modo === "semi" ? "semi" : "automatico";
  const limite = limiteSeguro(input.limite);

  if (modo === "semi") {
    const ids = new Set((input.clienteIds ?? []).filter((id) => typeof id === "string"));
    return clientes
      .filter((cliente) => ids.has(cliente.id) && telefoneValido(cliente.telefone))
      .slice(0, LIMITE_MAXIMO);
  }

  return ordenarAutomaticos(clientes).slice(0, limite);
}

export const Route = createFileRoute("/api/crm/disparos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as DisparoInput;
          const mensagem = typeof body.mensagem === "string" ? body.mensagem.trim() : "";
          const midiaUrl = mediaUrlValida(body.midiaUrl);
          const midiaBase64 = mediaBase64Valida(body.midiaBase64);
          if (!mensagem && !midiaUrl && !midiaBase64) {
            return json({ ok: false, erro: "Mensagem ou midia obrigatoria" }, { status: 400 });
          }

          const clientes = await listarClientes();
          const selecionados = selecionarClientes(clientes, body);
          if (selecionados.length === 0) {
            return json({ ok: false, erro: "Nenhum lead valido selecionado" }, { status: 400 });
          }

          const resultados: DisparoResultadoItem[] = [];

          for (const [index, cliente] of selecionados.entries()) {
            const telefone = telefoneValido(cliente.telefone);
            try {
              if (index > 0) await sleep(SEND_GAP_MS);
              const chatid = `${telefone}@s.whatsapp.net`;
              const texto = mensagem ? mensagemPersonalizada(mensagem, cliente) : "";
              const midiaTipo = body.midiaTipo;

              if (midiaBase64) {
                await enviarMidiaBase64(
                  chatid,
                  midiaBase64,
                  midiaTipo === "audio" ? undefined : texto,
                  {
                    fileName: body.midiaNome,
                    mimetype: body.midiaMimeType ?? mimetypeDisparo(midiaTipo),
                    ptt: midiaTipo === "audio",
                  },
                );
                if (midiaTipo === "audio" && texto) await enviarMensagemLonga(chatid, texto);
              } else if (midiaUrl) {
                await enviarMidia(
                  chatid,
                  midiaUrl,
                  midiaTipo === "audio" ? undefined : texto,
                  {
                    mimetype: mimetypeDisparo(midiaTipo),
                    fileName: body.midiaNome,
                  },
                );
                if (midiaTipo === "audio" && texto) await enviarMensagemLonga(chatid, texto);
              } else if (texto) {
                await enviarMensagemLonga(chatid, texto);
              }
              resultados.push({
                id: cliente.id,
                nome: cliente.nome,
                telefone,
                ok: true,
              });
            } catch (error) {
              resultados.push({
                id: cliente.id,
                nome: cliente.nome,
                telefone,
                ok: false,
                erro: error instanceof Error ? error.message : "Falha ao enviar",
              });
            }
          }

          return json({
            ok: true,
            total: resultados.length,
            enviados: resultados.filter((item) => item.ok).length,
            erros: resultados.filter((item) => !item.ok).length,
            resultados,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
