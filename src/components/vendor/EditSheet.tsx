import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

// Shared chrome for the business profile's edit sheets: bottom sheet on mobile,
// centered card on desktop, back-arrow header. First lifted out of
// AddBusinessCategoriesModal into BusinessProfile.tsx, and moved here (Ranking F2)
// so the sheets in BusinessReachSheets.tsx share it too and none can drift.
export function EditSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={onClose}><ArrowLeft className="w-5 h-5 text-gray-500" /></button>
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-4 border-t border-gray-100">{footer}</div>
      </div>
    </div>
  );
}

/** The input style every field in these sheets uses. */
export const editFieldClass =
  "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";
