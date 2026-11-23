import { TERMS_CLAUSES } from "@/data/terms";
import { cn } from "@/lib/utils";

/**
 * The numbered Terms clauses (src/data/terms.ts), rendered the same way on /terms and on the sign-up Terms card, so a
 * buyer accepts exactly what the Terms page says. `compact` is the card's smaller type.
 */
export default function TermsClauses({ className, compact = false }: { className?: string; compact?: boolean }) {
  const body = compact ? "text-xs leading-relaxed text-gray-600" : "text-sm leading-relaxed text-gray-700";
  const Heading = compact ? "h3" : "h2";
  return (
    // A legal record buyers accept by version: English in every language (2026-11-24), as the Supplier Agreement is.
    <div className={cn(compact ? "space-y-4" : "space-y-6", className)} data-no-translate>
      {TERMS_CLAUSES.map((clause) => (
        <section key={clause.heading}>
          <Heading data-terms-heading className={cn("font-bold text-gray-900", compact ? "text-xs" : "text-sm")}>
            {clause.heading}
          </Heading>
          {clause.paragraphs?.map((p, i) => (
            <p key={i} className={cn("mt-2", body)}>{p}</p>
          ))}
          {clause.bulletsIntro && <p className={cn("mt-2", body)}>{clause.bulletsIntro}</p>}
          {clause.bullets && (
            <ul className="mt-2 space-y-1.5">
              {clause.bullets.map((b, i) => (
                <li key={i} className={cn("flex gap-2", body)}>
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-buyer" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
