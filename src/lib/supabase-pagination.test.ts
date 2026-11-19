import assert from "node:assert/strict";
import test from "node:test";
import { lerPaginasSupabase } from "./supabase-pagination.ts";

test("busca contatos além da primeira página e respeita limite reduzido do servidor", async (t) => {
  const ranges: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const range = new Headers(init.headers).get("Range")!;
    ranges.push(range);
    const offset = Number(range.split("-")[0]);
    return Response.json(
      Array.from({ length: Math.min(400, 1050 - offset) }, (_, i) => offset + i),
      {
        headers: { "content-range": `${offset}-${Math.min(offset + 399, 1049)}/1050` },
      },
    );
  });
  const rows = await lerPaginasSupabase<number>("https://example.test/conversas", {});
  assert.equal(rows.length, 1050);
  assert.equal(rows.at(-1), 1049);
  assert.deepEqual(ranges, ["0-999", "400-1399", "800-1799"]);
});

test("falha em outra página não entrega uma lista incompleta como se estivesse correta", async (t) => {
  let page = 0;
  t.mock.method(globalThis, "fetch", async () =>
    ++page === 1
      ? Response.json([1], { headers: { "content-range": "0-0/2" } })
      : new Response(null, { status: 500 }),
  );
  await assert.rejects(lerPaginasSupabase("https://example.test/conversas", {}), /500/);
});
