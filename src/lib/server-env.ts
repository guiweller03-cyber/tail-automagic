function isBrowserRuntime(): boolean {
  return typeof window !== "undefined";
}

export function requireServerEnv(name: string): string {
  if (isBrowserRuntime()) {
    throw new Error(`${name} is server-only and cannot be read in the browser`);
  }

  const value = process.env[name]?.trim();
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
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    requireServerEnv("SUPABASE_ANON_KEY")
  );
}
