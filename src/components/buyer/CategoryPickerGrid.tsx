import { useEffect, useId, useRef } from "react";
import { Check, Plus } from "lucide-react";
import { BUYER_CATEGORIES, OTHER_INTEREST_ID, OTHER_INTEREST_MAX } from "@/lib/buyerCategories";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// The buyer-side interest picker: round photo tiles, four to a row, a coral
// check over the ones picked, and "Others" last with a box for the buyer's own
// words (Interest Preference design, 2026-10-11).
//
// One component for all three places that ask the question: registration
// (/auth/interest-preference), the profile's Edit (/profile/interest-preference)
// and For You's first visit and "Edit Preferences" popup.
//
// Presentational only: the caller owns `selected` and the "Others" text,
// because ForYou writes straight through to the preferences store while the
// Interest Preference screen holds a draft until Save.
// ─────────────────────────────────────────────────────────────

interface Props {
  selected: string[];
  onToggle: (id: string) => void;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  /** Called when the "Others" box loses focus (For You saves then). */
  onOtherTextCommit?: () => void;
}

function TileCheck() {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/25">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-buyer/90 text-white shadow-sm">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    </span>
  );
}

const tileButton =
  "group flex flex-col items-center gap-1.5 rounded-xl p-1 text-center transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-buyer focus-visible:ring-offset-2";
const tileCircle =
  "relative h-16 w-16 sm:h-[72px] sm:w-[72px] overflow-hidden rounded-full ring-offset-2 transition-shadow";
const tileLabel = "text-[11px] sm:text-xs font-medium leading-tight text-gray-700";

export default function CategoryPickerGrid({
  selected, onToggle, otherText, onOtherTextChange, onOtherTextCommit,
}: Props) {
  const otherId = useId();
  const otherOn = selected.includes(OTHER_INTEREST_ID);
  // Focus the box when the buyer has just picked Others, not when the picker
  // opens with Others already picked (that scrolled For You's popup to the end).
  const focusOther = useRef(false);
  const otherInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (otherOn && focusOther.current) otherInput.current?.focus();
    focusOther.current = false;
  }, [otherOn]);

  return (
    <div>
      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {BUYER_CATEGORIES.map((cat) => {
          const active = selected.includes(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onToggle(cat.id)}
              aria-pressed={active}
              className={tileButton}
            >
              <span className={cn(tileCircle, active ? "ring-2 ring-brand-buyer" : "ring-1 ring-gray-200 group-hover:ring-brand-buyer/40")}>
                <img
                  src={cat.image}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {active && <TileCheck />}
              </span>
              <span className={tileLabel}>{cat.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            focusOther.current = !otherOn;
            onToggle(OTHER_INTEREST_ID);
          }}
          aria-pressed={otherOn}
          aria-controls={otherOn ? otherId : undefined}
          className={tileButton}
        >
          <span
            className={cn(
              tileCircle,
              "flex items-center justify-center",
              otherOn
                ? "bg-brand-buyer/10 ring-2 ring-brand-buyer"
                : "border-2 border-dashed border-gray-300 bg-gray-50 group-hover:border-brand-buyer/50",
            )}
          >
            {otherOn ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-buyer text-white">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            ) : (
              <Plus className="h-6 w-6 text-gray-400" />
            )}
          </span>
          <span className={tileLabel}>Others</span>
        </button>
      </div>

      {otherOn && (
        <div className="mt-5">
          <label htmlFor={otherId} className="mb-1.5 block text-sm font-semibold text-gray-900">
            What else do you source?
          </label>
          <input
            ref={otherInput}
            id={otherId}
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value.slice(0, OTHER_INTEREST_MAX))}
            onBlur={onOtherTextCommit}
            maxLength={OTHER_INTEREST_MAX}
            autoComplete="off"
            placeholder="e.g. Leather goods, Home décor"
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-buyer focus:outline-none focus:ring-2 focus:ring-brand-buyer/20"
          />
          <p className="mt-1 text-right text-[11px] text-gray-400">
            {otherText.length}/{OTHER_INTEREST_MAX}
          </p>
        </div>
      )}
    </div>
  );
}
