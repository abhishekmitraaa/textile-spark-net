import { cn } from "@/lib/utils";

/** A spec the listing left empty: the mapping's "—" placeholder, or nothing at all. */
const known = (v: string | null | undefined): v is string => Boolean(v && v.trim() && v.trim() !== "—");

/**
 * Fabric, GSM and fit on a product card (2026-11-20, review L-19): only what the listing states, one format on every
 * card. Cards printed "Fabric: — | GSM: —" on some pages and "GSM:" with nothing after it on others.
 */
export function CardSpecs({ fabric, gsm, fit, className, lineClassName }: {
  fabric?: string | null; gsm?: string | null; fit?: string | null; className?: string; lineClassName?: string;
}) {
  const hasFabric = known(fabric);
  const hasGsm = known(gsm);
  const hasFit = known(fit);
  if (!hasFabric && !hasGsm && !hasFit) return null;
  return (
    <div className={className}>
      {(hasFabric || hasGsm) && (
        <p className={cn("text-gray-500", lineClassName)}>
          {hasFabric && <>Fabric: <span data-no-translate>{fabric}</span></>}
          {hasFabric && hasGsm && " | "}
          {hasGsm && <>GSM: <span data-no-translate>{gsm}</span></>}
        </p>
      )}
      {hasFit && (
        <p className={cn("text-gray-500", lineClassName)}>
          Fit Type: <span data-no-translate>{fit}</span>
        </p>
      )}
    </div>
  );
}
