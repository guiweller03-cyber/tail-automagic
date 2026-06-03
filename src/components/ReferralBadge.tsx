import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, Loader2 } from "lucide-react";

export function ReferralBadge({
  userId,
  name,
  email,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
}) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ user_id: userId });
    if (name) params.set("name", name);
    if (email) params.set("email", email);

    void fetch(`/api/referrals/my-code?${params}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { referral_code?: string }) => setCode(data.referral_code ?? ""))
      .finally(() => setLoading(false));
  }, [email, name, userId]);

  const message = useMemo(
    () => `Use meu codigo ${code} na BuildToPost e nos dois ganhamos 10% de desconto.`,
    [code],
  );

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Gift className="size-4" />
            Seu codigo
          </div>
          <div className="mt-1 font-mono text-lg font-bold tracking-normal">
            {loading ? <Loader2 className="size-4 animate-spin" /> : code || "Indisponivel"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!code}
          className="inline-flex size-9 items-center justify-center rounded-lg bg-secondary hover:bg-secondary/70 disabled:opacity-50"
          title="Copiar mensagem"
          aria-label="Copiar mensagem"
        >
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
      {code ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
