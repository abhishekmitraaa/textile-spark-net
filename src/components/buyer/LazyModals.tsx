import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
import { useSaved } from "@/lib/savedStore";
import { useCallNumber } from "@/lib/callStore";

// Dialogs opened by a tap load their code the first time they open (speed plan 3.1, 2026-11-27): they, and the
// dialog primitives they pull in, were in the first script of every visit. Once opened they stay mounted, so they
// close with their own animation. A chunk that fails to load is reloaded once by RouteErrorBoundary like a page's.

const SaveToFolderModalImpl = lazy(() => import("./SaveToFolderModal"));
const CallNumberModalImpl = lazy(() => import("./CallNumberModal"));
const QuickRfqModalImpl = lazy(() => import("./QuickRfqModal"));
const VideoCloseUpsViewerImpl = lazy(() => import("./VideoCloseUpsViewer"));

/** True from the first time `open` is true. */
function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);
  return opened || open;
}

/** "Save to folder", mounted once in App; opens when a product is pending. */
export function SaveToFolderModal() {
  const { pending } = useSaved();
  return useOpenedOnce(pending !== null) ? <Suspense fallback={null}><SaveToFolderModalImpl /></Suspense> : null;
}

/** "Here's the number to call", mounted once in App; opens when a number is set. */
export function CallNumberModal() {
  const info = useCallNumber();
  return useOpenedOnce(info !== null) ? <Suspense fallback={null}><CallNumberModalImpl /></Suspense> : null;
}

export function QuickRfqModal(props: ComponentProps<typeof QuickRfqModalImpl>) {
  return useOpenedOnce(Boolean(props.isOpen)) ? <Suspense fallback={null}><QuickRfqModalImpl {...props} /></Suspense> : null;
}

export function VideoCloseUpsViewer(props: ComponentProps<typeof VideoCloseUpsViewerImpl>) {
  return useOpenedOnce(Boolean(props.isOpen)) ? <Suspense fallback={null}><VideoCloseUpsViewerImpl {...props} /></Suspense> : null;
}
