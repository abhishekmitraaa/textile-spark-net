import { useId, useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * "Have a discount code?" at a vendor checkout (admin completion Phase 10).
 *
 * The field only collects the code. Whether it applies, and what it takes off,
 * comes back from the server through `onApply` (discount-quote); nothing here
 * works out a price.
 */
export function DiscountCodeField({
  applied,
  onApply,
  onRemove,
  disabled = false,
  className,
}: {
  /** The code in use and what it takes off, or null. */
  applied: { code: string; discount: number } | null;
  /** Resolves to a message saying why the code didn't apply, or null when it did. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (applied) {
    return (
      <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-brand-success/30 bg-brand-success/5 px-3 py-2 text-sm", className)}>
        <span className="flex min-w-0 items-center gap-2 text-foreground">
          <Tag className="h-4 w-4 shrink-0 text-brand-success" aria-hidden="true" />
          <span className="truncate font-mono font-semibold" data-no-translate>{applied.code}</span>
          <span className="text-muted-foreground">applied</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-semibold tabular-nums text-brand-success">−{formatINR(applied.discount)}</span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove discount code"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn("text-sm font-medium text-brand-vendor hover:underline disabled:opacity-50", className)}
      >
        Have a discount code?
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const message = await onApply(value);
      setError(message);
      if (!message) setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">Discount code</label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          placeholder="Enter code"
          maxLength={32}
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled || busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="font-mono uppercase"
          data-no-translate
        />
        <Button type="submit" variant="outline" disabled={disabled || busy || !code.trim()} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Checking code" /> : "Apply"}
        </Button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive">{error}</p>
      )}
    </form>
  );
}
