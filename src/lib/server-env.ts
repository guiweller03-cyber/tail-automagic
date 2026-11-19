import { configuracaoLoja } from "./loja-context";
function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

export function requireServerEnv(name: string): string {
  if (isBrowserRuntime()) {
    throw new Error(`${name} is server-only and cannot be read in the browser`);
  }

  const value = configuracaoLoja(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function requireSupabaseServerKey(): string {
  if (isBrowserRuntime()) {
    throw new Error("Supabase service role key is server-only and cannot be used in the browser");
  }

  return (
    configuracaoLoja("SUPABASE_SERVICE_ROLE_KEY") ||
    configuracaoLoja("SUPABASE_SECRET_KEY") ||
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}
