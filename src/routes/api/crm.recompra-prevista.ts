import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  definirCicloManualRecompra,
  listarRecompraPrevista,
  marcarRecompraContato,
  marcarRecompraTravada,
  recalcularTodasRecompras,
  registrarRecompraManual,
  salvarModeloRecompraRacao,
} from "@/lib/recompra-supabase";
import type { PetDetalhe } from "@/lib/crm-types";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function parsePetsDetalhes(value: unknown): PetDetalhe[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((item): PetDetalhe | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const pet = item as Record<string, unknown>;
      const nome = typeof pet.nome === "string" ? pet.nome.trim() : "";
      if (!nome) return null;

      const especie =
        pet.especie === "cachorro" || pet.especie === "gato" ? pet.especie : undefined;
      const porte =
        pet.porte === "toy" ||
        pet.porte === "pequeno" ||
        pet.porte === "medio" ||
        pet.porte === "grande" ||
        pet.porte === "gigante"
          ? pet.porte
          : undefined;
      const raca = typeof pet.raca === "string" ? pet.raca.trim() || undefined : undefined;
      const pesoKg = Number(pet.pesoKg);
      const nascimento =
        typeof pet.nascimento === "string" ? pet.nascimento.trim() || undefined : undefined;
      const dataNascimentoEstimada =
        typeof pet.dataNascimentoEstimada === "string"
          ? pet.dataNascimentoEstimada.trim() || undefined
          : nascimento;
      const idadeAdultaConfirmada =
        typeof pet.idadeAdultaConfirmada === "boolean" ? pet.idadeAdultaConfirmada : undefined;
      const racaSlug =
        typeof pet.racaSlug === "string" ? pet.racaSlug.trim() || undefined : undefined;
      const pesoKgMedidoEm =
        typeof pet.pesoKgMedidoEm === "string" ? pet.pesoKgMedidoEm.trim() || undefined : undefined;

      return {
        nome,
        ...(especie ? { especie } : {}),
        ...(porte ? { porte } : {}),
        ...(raca ? { raca } : {}),
        ...(Number.isFinite(pesoKg) && pesoKg > 0 ? { pesoKg } : {}),
        ...(pesoKgMedidoEm ? { pesoKgMedidoEm } : {}),
        ...(nascimento ? { nascimento } : {}),
        ...(dataNascimentoEstimada ? { dataNascimentoEstimada } : {}),
        ...(idadeAdultaConfirmada !== undefined ? { idadeAdultaConfirmada } : {}),
        ...(racaSlug ? { racaSlug } : {}),
      };
    })
    .filter((pet): pet is PetDetalhe => pet !== null);
}

export const Route = createFileRoute("/api/crm/recompra-prevista")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarRecompraPrevista());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Previsao obrigatoria" }, { status: 400 });
          }

          if (body.tipo === "contatado") {
            await marcarRecompraContato(body.id, body.contatado === true);
            return json({ ok: true });
          }

          if (body.tipo === "ciclo_manual") {
            return json({
              ok: true,
              recompra: await definirCicloManualRecompra(body.id, body.dias),
            });
          }

          if (body.tipo === "travado") {
            await marcarRecompraTravada(body.id, body.travado === true);
            return json({ ok: true });
          }

          return json({ ok: false, erro: "Tipo invalido" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async () => {
        try {
          return json({ ok: true, ...(await recalcularTodasRecompras()) });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;

          if (body.tipo === "modelo_racao") {
            return json(
              await salvarModeloRecompraRacao({
                sku: String(body.sku ?? ""),
                produtoNome: typeof body.produtoNome === "string" ? body.produtoNome : undefined,
                diasRecompra: Number(body.diasRecompra),
                consumoDiarioG:
                  body.consumoDiarioG === undefined || body.consumoDiarioG === ""
                    ? undefined
                    : Number(body.consumoDiarioG),
                ativo: body.ativo !== false,
              }),
            );
          }

          if (body.tipo === "venda_manual") {
            const petNomes = Array.isArray(body.petNomes)
              ? body.petNomes.filter((pet): pet is string => typeof pet === "string")
              : undefined;
            return json(
              await registrarRecompraManual({
                clienteId: String(body.clienteId ?? ""),
                sku: String(body.sku ?? ""),
                petNome: String(body.petNome ?? ""),
                petNomes,
                petsDetalhes: parsePetsDetalhes(body.petsDetalhes),
                modoDistribuicao: body.modoDistribuicao === "por_pet" ? "por_pet" : "compartilhada",
                compraEm: String(body.compraEm ?? ""),
                diasRecompra: Number(body.diasRecompra),
                quantidade:
                  body.quantidade === undefined || body.quantidade === ""
                    ? undefined
                    : Number(body.quantidade),
                pesoKg:
                  body.pesoKg === undefined || body.pesoKg === "" ? undefined : Number(body.pesoKg),
                consumoDiarioG:
                  body.consumoDiarioG === undefined || body.consumoDiarioG === ""
                    ? undefined
                    : Number(body.consumoDiarioG),
                produtoNome: typeof body.produtoNome === "string" ? body.produtoNome : undefined,
              }),
              { status: 201 },
            );
          }

          return json({ ok: false, erro: "Tipo invalido" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
