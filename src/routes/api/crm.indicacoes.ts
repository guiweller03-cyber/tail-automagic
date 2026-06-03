import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  criarCupom,
  criarInfluenciador,
  definirCupomAtivo,
  listarIndicacoesResumo,
  marcarComissaoPaga,
  removerCupom,
  removerInfluenciador,
  atualizarInfluenciador,
  validarCupom,
} from "@/lib/indicacoes-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function numberField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  if (message.includes("PGRST205") || message.includes("Could not find the table")) {
    return "Tabelas de indicacoes ainda nao existem no Supabase. Aplique as migrations 20260528020000_referral_system.sql e 20260530012116_influencer_persistence.sql.";
  }
  return message;
}

export const Route = createFileRoute("/api/crm/indicacoes")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarIndicacoesResumo());
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const acao = body.acao;

          if (acao === "criar_influenciador") {
            const nome = typeof body.nome === "string" ? body.nome.trim() : "";
            if (!nome) return json({ ok: false, erro: "Nome obrigatorio" }, { status: 400 });

            return json(
              await criarInfluenciador({
                nome,
                telefone: typeof body.telefone === "string" ? body.telefone : null,
                documento: typeof body.documento === "string" ? body.documento : null,
                chave_pix: typeof body.chave_pix === "string" ? body.chave_pix : null,
                canal: typeof body.canal === "string" ? body.canal : null,
                observacao: typeof body.observacao === "string" ? body.observacao : null,
              }),
              { status: 201 },
            );
          }

          if (acao === "criar_cupom") {
            if (typeof body.codigo !== "string") {
              return json({ ok: false, erro: "Codigo obrigatorio" }, { status: 400 });
            }
            let influenciadorId =
              typeof body.influenciador_id === "string" ? body.influenciador_id : "";
            if (!influenciadorId) {
              const nome =
                typeof body.influencer_name === "string" ? body.influencer_name.trim() : "";
              if (!nome)
                return json({ ok: false, erro: "Influenciador obrigatorio" }, { status: 400 });
              const influencer = await criarInfluenciador({
                nome,
                telefone: null,
                documento: null,
                chave_pix: null,
                canal: "Cupom",
                observacao:
                  typeof body.influencer_email === "string" ? body.influencer_email : null,
              });
              influenciadorId = influencer.id;
            }

            return json(
              await criarCupom({
                influenciador_id: influenciadorId,
                codigo: body.codigo,
                tipo_desconto: body.tipo_desconto === "valor_fixo" ? "valor_fixo" : "percentual",
                valor_desconto: numberField(body.valor_desconto),
                comissao_tipo:
                  body.comissao_tipo === "percentual_lucro" || body.comissao_tipo === "valor_fixo"
                    ? body.comissao_tipo
                    : "percentual_faturamento",
                comissao_valor: numberField(body.comissao_valor),
                limite_usos:
                  body.limite_usos === null || body.limite_usos === undefined
                    ? null
                    : Math.max(0, Math.trunc(numberField(body.limite_usos))),
                validade: typeof body.validade === "string" && body.validade ? body.validade : null,
                influencer_name:
                  typeof body.influencer_name === "string" ? body.influencer_name : null,
                influencer_email:
                  typeof body.influencer_email === "string" ? body.influencer_email : null,
              }),
              { status: 201 },
            );
          }

          if (acao === "editar_influenciador") {
            const id = typeof body.id === "string" ? body.id : "";
            const nome = typeof body.nome === "string" ? body.nome.trim() : "";
            if (!id || !nome) {
              return json(
                { ok: false, erro: "Influenciador e nome obrigatorios" },
                { status: 400 },
              );
            }

            return json(
              await atualizarInfluenciador(id, {
                nome,
                telefone: typeof body.telefone === "string" ? body.telefone : null,
                documento: typeof body.documento === "string" ? body.documento : null,
                chave_pix: typeof body.chave_pix === "string" ? body.chave_pix : null,
                canal: typeof body.canal === "string" ? body.canal : null,
                status:
                  body.status === "pausado" || body.status === "encerrado" ? body.status : "ativo",
                observacao: typeof body.observacao === "string" ? body.observacao : null,
              }),
            );
          }

          if (acao === "validar_cupom") {
            if (typeof body.codigo !== "string") {
              return json(
                { ok: false, valido: false, erro: "Codigo obrigatorio" },
                { status: 400 },
              );
            }

            const cupom = await validarCupom(body.codigo, numberField(body.total));
            return json({ ok: true, valido: Boolean(cupom), cupom });
          }

          if (acao === "marcar_comissao_paga") {
            if (typeof body.id !== "string") {
              return json({ ok: false, erro: "Comissao obrigatoria" }, { status: 400 });
            }

            return json(await marcarComissaoPaga(body.id));
          }

          if (acao === "definir_cupom_ativo") {
            if (typeof body.id !== "string" || typeof body.ativo !== "boolean") {
              return json({ ok: false, erro: "Cupom e status obrigatorios" }, { status: 400 });
            }

            return json(await definirCupomAtivo(body.id, body.ativo));
          }

          if (acao === "remover_cupom") {
            if (typeof body.id !== "string") {
              return json({ ok: false, erro: "Cupom obrigatorio" }, { status: 400 });
            }

            await removerCupom(body.id);
            return json({ ok: true });
          }

          if (acao === "remover_influenciador") {
            if (typeof body.id !== "string") {
              return json({ ok: false, erro: "Influenciador obrigatorio" }, { status: 400 });
            }

            await removerInfluenciador(body.id);
            return json({ ok: true });
          }

          return json({ ok: false, erro: "Acao invalida" }, { status: 400 });
        } catch (error) {
          return json({ ok: false, erro: errorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
