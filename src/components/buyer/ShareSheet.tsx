import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Link2, Mail, MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Share sheet (2026-10-14, Mitra: "sharing should show options like Instagram's
// reel share: WhatsApp and the rest", where it used to copy the link and stop).
//
// A row of destinations, each a plain link to that service's own share address,
// so it works signed out, on any browser, and on a phone hands over to the app
// (wa.me opens WhatsApp). "More" opens the device's own share menu where the
// browser has one (navigator.share), and is left out where it doesn't.
//
// Nothing is sent by Cosora and nothing is logged: the person shares a public
// page's address themselves. Brand marks: Simple Icons (CC0), drawn inline so no
// third-party request is made before the person picks one.
// ─────────────────────────────────────────────────────────────

const PATHS = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  facebook:
    "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  telegram:
    "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
} as const;

const Mark = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
    <path d={d} />
  </svg>
);

/** The share addresses, built in one place (tests/local/buyer-minor-fixes.spec.ts checks the links on the page). */
function shareTargets(url: string, title: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const both = encodeURIComponent(`${title}\n${url}`);
  return {
    whatsapp: `https://wa.me/?text=${both}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    telegram: `https://t.me/share/url?url=${u}&text=${t}`,
    email: `mailto:?subject=${t}&body=${both}`,
  };
}

/** Copies text, with the old textarea route for browsers (or http pages) without the Clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea route
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const OPTION_CLASS =
  "group flex w-16 shrink-0 snap-start flex-col items-center gap-1.5 focus:outline-none " +
  "focus-visible:[&>span:first-child]:ring-2 focus-visible:[&>span:first-child]:ring-brand-buyer focus-visible:[&>span:first-child]:ring-offset-2";

/** One destination: a round mark and its name. A link when it has an address, else a button. */
function Option({ label, className, children, href, onClick, testId }: {
  label: string; className: string; children: ReactNode; href?: string; onClick?: () => void; testId: string;
}) {
  const face = (
    <>
      <span className={cn("flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm transition-transform group-active:scale-95", className)}>
        {children}
      </span>
      <span className="text-[11px] font-medium text-gray-700">{label}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" data-share={testId} className={OPTION_CLASS} onClick={onClick}>
      {face}
    </a>
  ) : (
    <button type="button" data-share={testId} className={OPTION_CLASS} onClick={onClick}>
      {face}
    </button>
  );
}

export interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The address being shared: a public page on cosora.in. */
  url: string;
  /** What it is, e.g. the product's name. Goes into the message and the preview. */
  title: string;
  /** A second line for the preview, e.g. the price. */
  subtitle?: string | null;
  image?: string | null;
  /** The sheet's heading. */
  heading?: string;
  /** Opened from a full-screen layer (the Video Close-Ups viewer, z-[80]): sit above it. */
  aboveFullscreen?: boolean;
}

export default function ShareSheet({ open, onOpenChange, url, title, subtitle, image, heading = "Share", aboveFullscreen = false }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const targets = shareTargets(url, title);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async () => {
    if (await copyText(url)) {
      setCopied(true);
      toast.success("Link copied");
    } else {
      toast.error("Couldn't copy the link", { description: url });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: title, url });
      onOpenChange(false);
    } catch {
      // Dismissing the device's menu rejects; the sheet stays open.
    }
  };

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="share-sheet"
        overlayClassName={aboveFullscreen ? "z-[90]" : undefined}
        className={cn(
          "max-w-md gap-0 p-0",
          aboveFullscreen && "z-[90]",
          "max-md:top-auto max-md:bottom-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0",
          "max-md:data-[state=open]:slide-in-from-bottom-full max-md:data-[state=closed]:slide-out-to-bottom-full",
        )}
      >
        <div className="px-5 pt-5 pr-10">
          <DialogTitle className="text-base font-bold text-gray-900">{heading}</DialogTitle>
          <DialogDescription className="sr-only">Choose where to share this link.</DialogDescription>
        </div>

        {/* What is being shared */}
        <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
          {image ? (
            <img src={image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900" data-no-translate>{title}</p>
            {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
        </div>

        {/* Destinations: one swipeable row on a phone, like its own share sheet; a grid from md up */}
        <div className="flex snap-x scroll-px-5 gap-3 overflow-x-auto scrollbar-hide px-5 pb-5 pt-4 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] md:grid md:grid-cols-4 md:justify-items-center md:gap-y-4 md:overflow-visible">
          <Option label="WhatsApp" testId="whatsapp" className="bg-[#25D366]" href={targets.whatsapp} onClick={close}><Mark d={PATHS.whatsapp} /></Option>
          <Option label="Copy link" testId="copy" className={copied ? "bg-brand-success" : "bg-gray-700"} onClick={copy}>
            {copied ? <Check className="h-6 w-6" /> : <Link2 className="h-6 w-6" />}
          </Option>
          <Option label="Facebook" testId="facebook" className="bg-[#0866FF]" href={targets.facebook} onClick={close}><Mark d={PATHS.facebook} /></Option>
          <Option label="X" testId="x" className="bg-black" href={targets.x} onClick={close}><Mark d={PATHS.x} /></Option>
          <Option label="LinkedIn" testId="linkedin" className="bg-[#0A66C2]" href={targets.linkedin} onClick={close}><Mark d={PATHS.linkedin} /></Option>
          <Option label="Telegram" testId="telegram" className="bg-[#26A5E4]" href={targets.telegram} onClick={close}><Mark d={PATHS.telegram} /></Option>
          <Option label="Email" testId="email" className="bg-gray-500" href={targets.email} onClick={close}><Mail className="h-6 w-6" /></Option>
          {canNativeShare && (
            <Option label="More" testId="more" className="bg-gray-200 !text-gray-700" onClick={nativeShare}>
              <MoreHorizontal className="h-6 w-6" />
            </Option>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
