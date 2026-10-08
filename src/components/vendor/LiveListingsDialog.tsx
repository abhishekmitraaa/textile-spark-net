import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { keepProducts, setLiveProducts, type VendorProductRow } from "@/lib/queries/products";
import { errorMessage } from "@/lib/errorMessage";

const STATE_LABEL: Record<VendorProductRow["status"], string> = {
  active: "Published",
  pending: "Under review",
  paused: "Paused",
  draft: "Draft",
};

/**
 * "Choose which stay live" (subscriptions P4). A plan allows so many listings; the ones
 * over it are paused (hidden from buyers, not deleted). One list, two uses:
 *
 *   keep  before a smaller plan starts (a paid downgrade, or a plan ending without
 *         autopay): the vendor names the listings to keep. Saved as picks; the database
 *         uses them when the limit applies, and falls back to the most viewed.
 *   swap  with listings already paused: the vendor names which are live now. The others
 *         are paused at once; a paused one that was edited goes through review first.
 *
 * The database checks ownership and the limit itself (vendor_keep_products,
 * vendor_set_live_products); the counter here only keeps the vendor inside it.
 */
export function LiveListingsDialog({
  open, mode, limit, planName, products, initialIds, onClose, onSaved,
}: {
  open: boolean;
  mode: "keep" | "swap";
  /** How many listings may be chosen. */
  limit: number;
  /** The plan the limit belongs to (the coming one in keep mode). */
  planName: string;
  /** The vendor's own listings; drafts are left out. */
  products: VendorProductRow[];
  /** What starts ticked: earlier picks, or what is live now. */
  initialIds: string[];
  onClose: () => void;
  onSaved: (result: { mode: "keep" | "swap"; chosen: number; paused: number; resumed: number }) => void;
}) {
  // Most viewed first: the same order the database falls back to.
  const rows = useMemo(
    () => products.filter((p) => p.status !== "draft").sort((a, b) => b.views - a.views),
    [products],
  );
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each opening starts from what was passed in, trimmed to the limit and to listings that still exist.
  useEffect(() => {
    if (!open) return;
    const known = new Set(rows.map((r) => r.id));
    setChosen(initialIds.filter((id) => known.has(id)).slice(0, Math.max(limit, 0)));
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const full = chosen.length >= limit;
  const toggle = (id: string, on: boolean) => {
    setChosen((cur) => (on ? (cur.includes(id) || cur.length >= limit ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
  };

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (mode === "keep") {
        // Most viewed first, so a later, even smaller limit still keeps the strongest.
        const ordered = rows.filter((r) => chosen.includes(r.id)).map((r) => r.id);
        await keepProducts(ordered);
        onSaved({ mode, chosen: ordered.length, paused: 0, resumed: 0 });
      } else {
        const res = await setLiveProducts(chosen);
        onSaved({ mode, chosen: chosen.length, paused: res.paused, resumed: res.resumed });
      }
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="live-listings-dialog">
        <DialogHeader>
          <DialogTitle>{mode === "keep" ? "Choose which listings stay live" : "Choose which listings are live"}</DialogTitle>
          <DialogDescription>
            {mode === "keep"
              ? (limit === 1
                ? `The ${planName} plan allows 1 listing. The rest will be paused: hidden from buyers, not deleted.`
                : `The ${planName} plan allows ${limit} listings. The rest will be paused: hidden from buyers, not deleted.`)
              : (limit === 1
                ? `Your ${planName} plan allows 1 listing. The others stay paused: hidden from buyers, not deleted.`
                : `Your ${planName} plan allows ${limit} listings. The others stay paused: hidden from buyers, not deleted.`)}
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-2 max-h-[50vh] space-y-1 overflow-y-auto px-2">
          {rows.map((p) => {
            const on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${on ? "border-brand-vendor/40 bg-brand-vendor/5" : "border-border hover:bg-muted/50"} ${!on && full ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <Checkbox
                    checked={on}
                    disabled={busy || (!on && full)}
                    onCheckedChange={(v) => toggle(p.id, v === true)}
                    aria-label={p.name}
                    data-testid={`live-pick-${p.id}`}
                  />
                  <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-md bg-muted object-cover" loading="lazy" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground" data-no-translate>{p.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{p.views}</span>
                      <span>{STATE_LABEL[p.status]}</span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="live-pick-count">
          {`${chosen.length} of ${limit} chosen`}
        </p>
        {mode === "swap" && (
          <p className="text-xs text-muted-foreground">
            A paused listing you edited goes through review before it is live again.
          </p>
        )}
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy} data-testid="live-pick-save">
            {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving…</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
