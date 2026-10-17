import { Ruler } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SizeChart } from "@/data/sizeCharts";

/**
 * The measurement chart for a listing's garment type (data/sizeCharts.ts), with the sizes this vendor offers
 * marked (2026-10-17: a buyer saw "32B" or "UK 7" with no way to know what it means). A bottom sheet on a phone,
 * a dialog on a wide screen, like the share sheet.
 */
export default function SizeChartSheet({
  chart,
  offered,
  open,
  onOpenChange,
}: {
  chart: SizeChart;
  /** The listing's sizes, to mark in the chart. */
  offered: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const offeredSet = new Set(offered);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="size-chart"
        className={cn(
          "max-w-lg gap-0 p-0",
          "max-md:top-auto max-md:bottom-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0",
          "max-md:data-[state=open]:slide-in-from-bottom-full max-md:data-[state=closed]:slide-out-to-bottom-full",
          "max-h-[85vh] overflow-y-auto",
        )}
      >
        <div className="px-5 pt-5 pr-10">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
            <Ruler className="h-4 w-4 text-brand-buyer" /> Size chart: {chart.title}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-gray-500">{chart.howTo}</DialogDescription>
        </div>
        <div className="mx-5 mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {chart.columns.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r) => {
                // A bra listed as "32B" marks the band row "32".
                const mine = offeredSet.has(r[0]) || offered.some((o) => o.startsWith(r[0]) && /^[A-F]{1,2}$/.test(o.slice(r[0].length)));
                return (
                  <tr key={r.join("|")} data-offered={mine ? "true" : undefined} className={cn("border-t border-gray-100", mine ? "bg-brand-buyer/5 font-semibold text-gray-900" : "text-gray-700")}>
                    {r.map((cell, i) => (
                      <td key={i} className="whitespace-nowrap px-3 py-2 tabular-nums">{cell}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-5 pt-3 text-[11px] text-gray-500">
          {offered.length > 0 ? "Highlighted: the sizes this seller offers. " : ""}
          A guide to standard sizes; garments can run differently, so ask the seller for exact measurements.
        </p>
      </DialogContent>
    </Dialog>
  );
}
