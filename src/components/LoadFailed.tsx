import { AlertCircle } from "lucide-react";

/**
 * A read that failed, said as such with a way to try again (review L-41). Loading, error, empty and loaded stay four
 * states: a failed read shown as an empty list tells the person they have nothing.
 */
export default function LoadFailed({ label, onRetry, className }: { label: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={className ?? "py-16 text-center"}>
      <AlertCircle className="w-9 h-9 text-gray-300 mx-auto mb-3" aria-hidden />
      <p className="text-sm text-gray-600">{label}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 hover:border-gray-400"
      >
        Try again
      </button>
    </div>
  );
}
