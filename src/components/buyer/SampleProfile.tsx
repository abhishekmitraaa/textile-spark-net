import { Info } from "lucide-react";

/**
 * Service Vendors and Freelancers show sample profiles, not Cosora accounts (Mitra, 2026-11-18: "Keep, remove fakes";
 * review H-13). The pages say so once at the top, and every card and profile carries the tag, so nothing on them reads
 * as a real provider, rating or review.
 */
export function SampleProfilesNotice() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">Sample profiles</p>
        <p className="mt-0.5 text-xs text-amber-800">
          These providers show the kind of services coming to Cosora. They aren't Cosora accounts yet, so they can't
          be called, messaged or reviewed.
        </p>
      </div>
    </div>
  );
}

export function SampleTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
      Sample
    </span>
  );
}
