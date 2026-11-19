/** Lê todas as páginas, inclusive quando o limite do servidor é menor que o solicitado. */
export async function lerPaginasSupabase<T>(url: string, headers: HeadersInit): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  let total: number | undefined;
  while (true) {
    const pageHeaders = new Headers(headers);
    pageHeaders.set("Range-Unit", "items");
    pageHeaders.set("Range", `${rows.length}-${rows.length + pageSize - 1}`);
    if (rows.length === 0) pageHeaders.set("Prefer", "count=exact");
    const response = await fetch(url, { headers: pageHeaders });
    if (response.status === 416 && rows.length > 0) break;
    if (!response.ok) throw new Error(`Falha ao carregar registros (${response.status})`);
    const page: T[] = await response.json();
    const count = response.headers.get("content-range")?.split("/")[1];
    if (count && count !== "*" && Number.isFinite(Number(count))) total = Number(count);
    rows.push(...page);
    if (page.length === 0 || (total !== undefined ? rows.length >= total : page.length < pageSize))
      break;
  }
  return rows;
}
