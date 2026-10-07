import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EditSheet, editFieldClass } from "@/components/vendor/EditSheet";
import { INDIA_STATES } from "@/data/indiaStates";
import { sellerCategories } from "@/data/sellerCategories";
import {
  CAPABILITIES,
  CAPACITY_UNITS,
  PRIMARY_TYPES,
  categoryRootName,
  defaultCapacityUnit,
  type CapacityUnit,
} from "@/data/vendorTypes";
import type { CapacityRow } from "@/lib/queries/vendorStore";
import { useLang } from "@/lib/i18n";

// The business profile's "Business type & reach" sheets (Ranking Part 1, F2): what the
// business mainly is and what else it can do, the states it serves beyond its own, and
// how much it can make or handle a month per category. Personalised ranking reads all
// three (documentation/ranking-foundations-design-2026-10-07.md).

const optionClass =
  "flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-900";
const legendClass = "mb-2 text-xs font-bold uppercase tracking-wide text-gray-500";

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed">
      {saving ? "Saving..." : "Save"}
    </button>
  );
}

export function BusinessTypeSheet({
  isOpen,
  onClose,
  initialType,
  initialCapabilities,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialType: string | null;
  initialCapabilities: string[];
  onSave: (type: string, capabilities: string[]) => Promise<boolean>;
}) {
  const [type, setType] = useState("");
  const [caps, setCaps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setType(initialType ?? "");
      setCaps(initialCapabilities);
    }
  }, [isOpen, initialType, initialCapabilities]);
  if (!isOpen) return null;

  const submit = async () => {
    if (!type) {
      toast.error("Pick your business type");
      return;
    }
    setSaving(true);
    try {
      if (await onSave(type, caps)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="Business Type" onClose={onClose} footer={<SaveButton saving={saving} onClick={submit} />}>
      <fieldset className="space-y-2">
        <legend className={legendClass}>What your business mainly is</legend>
        {PRIMARY_TYPES.map((t) => (
          <label key={t.value} className={optionClass}>
            <input type="radio" name="primary-type" checked={type === t.value} onChange={() => setType(t.value)} />
            {t.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-5 space-y-2">
        <legend className={legendClass}>What you can also do</legend>
        {CAPABILITIES.map((c) => (
          <label key={c.value} className={optionClass}>
            <input
              type="checkbox"
              checked={caps.includes(c.value)}
              onChange={(e) => setCaps((prev) => (e.target.checked ? [...prev, c.value] : prev.filter((v) => v !== c.value)))}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
    </EditSheet>
  );
}

export function ServedStatesSheet({
  isOpen,
  onClose,
  initial,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial: string[];
  onSave: (codes: string[]) => Promise<boolean>;
}) {
  const lang = useLang();
  const [codes, setCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) setCodes(initial);
  }, [isOpen, initial]);
  if (!isOpen) return null;

  const submit = async () => {
    setSaving(true);
    try {
      // Kept in the list's order, so the profile reads the same however they were ticked.
      if (await onSave(INDIA_STATES.map((s) => s.code).filter((c) => codes.includes(c)))) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="States You Serve" onClose={onClose} footer={<SaveButton saving={saving} onClick={submit} />}>
      <p className="mb-3 text-xs text-gray-500">
        Tick the states you deliver to or work in, beyond your own. Requirements from these states count as nearby.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INDIA_STATES.map((s) => (
          <label key={s.code} className={optionClass}>
            <input
              type="checkbox"
              checked={codes.includes(s.code)}
              onChange={(e) => setCodes((prev) => (e.target.checked ? [...prev, s.code] : prev.filter((c) => c !== s.code)))}
            />
            <span data-no-translate>{lang === "hi" ? s.hi : lang === "gu" ? s.gu : s.name}</span>
          </label>
        ))}
      </div>
    </EditSheet>
  );
}

export function CapacitySheet({
  isOpen,
  onClose,
  initial,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial: CapacityRow[];
  onSave: (rows: CapacityRow[]) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<CapacityUnit>("pieces");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setRows(initial);
      setCategory("");
      setAmount("");
    }
  }, [isOpen, initial]);
  if (!isOpen) return null;

  const free = sellerCategories.filter((c) => !rows.some((r) => r.categoryRoot === c.id));
  const add = () => {
    const n = Number(amount.replace(/,/g, ""));
    if (!category) {
      toast.error("Pick a category");
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter how much you can make or handle in a month");
      return;
    }
    setRows((prev) => [...prev, { categoryRoot: category, monthlyCapacity: n, unit }]);
    setCategory("");
    setAmount("");
  };
  const submit = async () => {
    setSaving(true);
    try {
      if (await onSave(rows)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditSheet title="Monthly Capacity" onClose={onClose} footer={<SaveButton saving={saving} onClick={submit} />}>
      <p className="mb-3 text-xs text-gray-500">
        How much you can make or handle in a month, per category. Only you and Cosora see these numbers.
      </p>
      {rows.length > 0 && (
        <ul className="mb-4 space-y-2">
          {rows.map((r) => (
            <li key={r.categoryRoot} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5 text-sm">
              <span className="text-gray-800">
                {categoryRootName(r.categoryRoot)}:{" "}
                <span className="font-semibold">{r.monthlyCapacity.toLocaleString("en-IN")}</span> {r.unit}
              </span>
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.categoryRoot !== r.categoryRoot))}
                aria-label="Remove"
                className="text-gray-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && (
        <div className="space-y-3 rounded-xl bg-gray-50 p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Category</span>
            <select
              className={editFieldClass}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (e.target.value) setUnit(defaultCapacityUnit(e.target.value));
              }}
            >
              <option value="">Select a category</option>
              {free.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Per month</span>
              <input className={editFieldClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-700">Unit</span>
              <select className={editFieldClass} value={unit} onChange={(e) => setUnit(e.target.value as CapacityUnit)}>
                {CAPACITY_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={add} className="w-full rounded-xl border border-blue-600 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50">
            Add
          </button>
        </div>
      )}
    </EditSheet>
  );
}
