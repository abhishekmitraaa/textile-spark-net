import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Phone, Copy } from "lucide-react";
import { useCallNumber, closeCallNumber } from "@/lib/callStore";

// Global "here's the number to call" dialog, shown on desktop (where tel: does
// nothing). Mounted once in App. Displays the vendor's number big and legible,
// as a tel: link (works if a soft-phone is installed) with a copy button.
export default function CallNumberModal() {
  const info = useCallNumber();
  const open = info !== null;

  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.phone);
      toast.success("Number copied");
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeCallNumber(); }}>
      <DialogContent className="max-w-xs">
        <DialogTitle className="text-base font-bold text-gray-900">Call {info?.name ?? "vendor"}</DialogTitle>
        <DialogDescription className="text-xs text-gray-500">Dial this number from your phone</DialogDescription>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
          <span className="w-10 h-10 rounded-full bg-[#ef4d62]/10 flex items-center justify-center shrink-0">
            <Phone className="w-5 h-5 text-[#ef4d62]" />
          </span>
          <a
            href={`tel:${(info?.phone ?? "").replace(/[^\d+]/g, "")}`}
            className="flex-1 min-w-0 text-lg font-bold text-gray-900 tabular-nums truncate hover:text-[#ef4d62] transition-colors"
          >
            {info?.phone}
          </a>
        </div>

        <button
          onClick={copy}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white py-3 text-sm font-bold transition-colors"
        >
          <Copy className="w-4 h-4" /> Copy number
        </button>
      </DialogContent>
    </Dialog>
  );
}
