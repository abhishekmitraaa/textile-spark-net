import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft } from "lucide-react";

// Shared chrome for the business profile's edit sheets: bottom sheet on mobile,
// centered card on desktop, back-arrow header. First lifted out of
// AddBusinessCategoriesModal into BusinessProfile.tsx, and moved here (Ranking F2)
// so the sheets in BusinessReachSheets.tsx share it too and none can drift.
//
// A real dialog since 2026-11-17 (Seller Home audit SH-053): it was a plain div, with no role, no focus trap, no Escape
// and an unlabelled back button. Radix gives the role, the trap, Escape and focus return; a tap outside the card closes
// it. Rendered in a portal, so it carries the Clarity mask itself, as components/ui/dialog does.
export function EditSheet({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/50" />
        <DialogPrimitive.Content
          data-clarity-mask="True"
          aria-describedby={undefined}
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center focus:outline-none"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
              <DialogPrimitive.Close aria-label="Close" className="rounded-full p-0.5 hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5 text-gray-500" />
              </DialogPrimitive.Close>
              <DialogPrimitive.Title className="text-base font-bold text-gray-900">{title}</DialogPrimitive.Title>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="border-t border-gray-100 px-5 py-4">{footer}</div>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The input style every field in these sheets uses. */
export const editFieldClass =
  "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";
