import { INDIA_STATES, stateCodeFor, stateByCode } from "@/data/indiaStates";
import { useLang } from "@/lib/i18n";

// One state picker for every form that asks where a business is (Ranking Part 1, F2):
// vendor onboarding, the vendor's contact details and the buyer's business details. It
// stores the state's English name in the form's free-text `state` field; the database
// derives `state_code` from it (sync_state_code), which is what ranking compares.
//
// Names come from src/data/indiaStates.ts in the reader's language, so the options are
// marked data-no-translate. A saved value that isn't a known state (older free text)
// shows as "Select state" until the user picks one.

export default function StateSelect({
  id,
  value,
  onChange,
  className,
  placeholder = "Select state",
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const lang = useLang();
  const current = stateByCode(stateCodeFor(value));
  const label = (s: (typeof INDIA_STATES)[number]) => (lang === "hi" ? s.hi : lang === "gu" ? s.gu : s.name);
  return (
    <select
      id={id}
      className={className}
      value={current?.code ?? ""}
      onChange={(e) => onChange(stateByCode(e.target.value)?.name ?? "")}
    >
      <option value="">{placeholder}</option>
      {INDIA_STATES.map((s) => (
        <option key={s.code} value={s.code} data-no-translate>
          {label(s)}
        </option>
      ))}
    </select>
  );
}
