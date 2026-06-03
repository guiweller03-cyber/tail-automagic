import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Ticket } from "lucide-react";

type CouponValidation = {
  valid: boolean;
  discount_percent?: number;
  type?: string;
  error?: string;
};

export function CouponInput({
  userId,
  disabled,
  onValidChange,
}: {
  userId: string;
  disabled?: boolean;
  onValidChange?: (coupon: { code: string; discountPercent: number; type: string } | null) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CouponValidation | null>(null);

  useEffect(() => {
    const normalized = code.trim().toUpperCase();
    setResult(null);
    onValidChange?.(null);
    if (normalized.length < 3 || disabled) return;

    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: normalized, user_id: userId }),
        });
        const data = (await response.json()) as CouponValidation;
        setResult(data);
        onValidChange?.(
          data.valid
            ? { code: normalized, discountPercent: data.discount_percent ?? 0, type: data.type ?? "influencer" }
            : null,
        );
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [code, disabled, onValidChange, userId]);

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">Cupom</span>
      <div className="relative">
        <Ticket className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          disabled={disabled}
          placeholder="INFLUENCER20"
          className="input pl-9 pr-10"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin" /> : null}
      </div>
      {result?.valid ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
          <CheckCircle2 className="size-3.5" />
          {result.discount_percent}% de desconto aplicado
        </span>
      ) : null}
      {result && !result.valid ? <span className="text-xs text-destructive">Cupom invalido ou indisponivel</span> : null}
    </label>
  );
}
