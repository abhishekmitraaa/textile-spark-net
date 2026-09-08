import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Star, Link2, Share2, Download } from "lucide-react";
import { useVendorReviews } from "@/lib/queries/reviews";
import { useMyVendorProfile } from "@/lib/queries/vendorStore";

// ─────────────────────────────────────────────────────────────
// The one way a vendor collects reviews: hand a buyer the link to their public
// storefront, where /vendor/:id already has a working WriteReviewModal.
//
// Shared by /reviews and the Business Tools "Get Reviews" tile so the two can
// never share different links. Replaces two separate fakes:
//
//   • BusinessTools' "Get Reviews" modal collected real customer names and
//     phone numbers and then dropped them behind toast.success("Review
//     requests sent!"). There is no SMS pipeline in this repo, so nothing was
//     ever sent — the vendor believed it had been.
//   • Both pages drew a <QrCode> LUCIDE ICON at 128px and called it a QR code.
//     It is a picture of a QR code; scanning it does nothing. This renders a
//     real, scannable one and the download button saves that image.
//
// The link is /vendor/<id> — the buyer-facing storefront. It used to be
// /reviews, which is the VENDOR's own dashboard: a buyer who followed it got
// their own (empty) seller review page, not a way to review anyone.
// ─────────────────────────────────────────────────────────────

function reviewLinkFor(vendorId: string): string {
  return `${window.location.origin}/vendor/${vendorId}`;
}

export function ReviewLinkShare({ vendorId }: { vendorId: string | undefined }) {
  const { data: reviewData } = useVendorReviews(vendorId);
  const { data: store } = useMyVendorProfile(vendorId);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  const reviewUrl = vendorId ? reviewLinkFor(vendorId) : "";

  useEffect(() => {
    if (!reviewUrl) return;
    let cancelled = false;
    QRCode.toDataURL(reviewUrl, { width: 512, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (!cancelled) { setQrDataUrl(url); setQrError(false); } })
      .catch(() => { if (!cancelled) setQrError(true); });
    return () => { cancelled = true; };
  }, [reviewUrl]);

  const copyLink = async () => {
    if (!reviewUrl) return;
    await navigator.clipboard.writeText(reviewUrl);
    toast.success("Review link copied");
  };

  const share = async () => {
    if (!reviewUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Rate ${store?.brandName || "our business"} on Cosora`, url: reviewUrl });
        return;
      }
    } catch {
      // Dismissing the OS share sheet rejects — fall through to the clipboard.
    }
    await copyLink();
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `cosora-review-qr-${(store?.brandName || "store").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const rating = reviewData?.avg ?? 0;
  const count = reviewData?.count ?? 0;

  if (!vendorId) {
    return <p className="py-6 text-center text-sm text-gray-500">Sign in to share your review link.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Real ratings for THIS vendor. The tile this replaced printed
          "4.2 / 24 Ratings" for every vendor on the platform. */}
      <div className="rounded-xl bg-[#256fef]/5 p-4 text-center">
        {count > 0 ? (
          <>
            <div className="flex items-center justify-center gap-2">
              <span className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 font-bold text-white">
                {rating.toFixed(1)} <Star className="h-3.5 w-3.5 fill-white" />
              </span>
              <span className="text-sm text-gray-500">
                {count} {count === 1 ? "Rating" : "Ratings"}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">Share your link to collect more.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900">No reviews yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Share this link or QR code with buyers you have worked with — they can rate you straight from your storefront.
            </p>
          </>
        )}
      </div>

      {/* QR */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <div className="flex h-44 w-44 items-center justify-center rounded-xl border-2 border-gray-200 bg-white p-2 shadow-sm">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code linking to ${reviewUrl}`} className="h-full w-full object-contain" />
          ) : qrError ? (
            <span className="px-3 text-center text-xs text-gray-400">
              QR code unavailable — use the link below
            </span>
          ) : (
            <span className="h-full w-full animate-pulse rounded bg-gray-100" />
          )}
        </div>
        {store?.brandName?.trim() && (
          <p className="text-sm font-semibold text-gray-900">{store.brandName}</p>
        )}
        <p className="w-full break-all text-center text-xs text-gray-500">{reviewUrl}</p>
      </div>

      {/* Actions */}
      <div className="space-y-2.5">
        <button
          onClick={copyLink}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Link2 className="h-4 w-4" /> Copy Link
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={downloadQr}
            disabled={!qrDataUrl}
            className="flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download QR
          </button>
          <button
            onClick={share}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#256fef] text-sm font-medium text-white hover:bg-[#1d5ed6] transition-colors"
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
      </div>
    </div>
  );
}
