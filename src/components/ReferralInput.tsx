import { useEffect, useState } from "react";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";

export function ReferralInput({
  userId,
  disabled,
  onValidChange,
}: {
  userId: string;
  disabled?: boolean;
  onValidChange?: (referral: { code: string; discountPercent: 10 } | null) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    const normalized = code.trim().toUpperCase();
    setValid(null);
    onValidChange?.(null);
    if (normalized.length < 3 || disabled) return;

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/referrals/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ referral_code: normalized, user_id: userId }),
        });
        const data = (await response.json()) as { valid: boolean; discount_percent: 10 };
        setValid(data.valid);
        onValidChange?.(data.valid ? { code: normalized, discountPercent: 10 } : null);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [code, disabled, onValidChange, userId]);

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">Codigo de indicacao</span>
      <div className="relative">
        <Gift className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          disabled={disabled}
          placeholder="JOAO-X4K2"
          className="input pl-9 pr-10"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" /> : null}
      </div>
      {valid ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
          <CheckCircle2 className="size-3.5" />
          Voce e seu amigo ganham 10% de desconto
        </span>
      ) : null}
      {valid === false ? <span className="text-xs text-destructive">Codigo invalido ou pertence a voce</span> : null}
    </label>
  );
}
