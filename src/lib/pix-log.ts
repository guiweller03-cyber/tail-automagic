type PixLogLevel = "info" | "warn" | "error";

export function telefoneLog(value: string): string {
  const telefone = value.replace(/\D/g, "");
  const final = telefone.slice(-4);

  return final ? `***${final}` : "sem-telefone";
}

export function erroLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function logPix(
  origem: "crm" | "whatsapp",
  evento: string,
  dados: Record<string, unknown>,
  level: PixLogLevel = "info",
): void {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;

  logger(`[pix:${origem}] ${evento}`, dados);
}
