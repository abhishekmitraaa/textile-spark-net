import { useCallback, useRef } from "react";

// Adds click-and-drag horizontal scrolling (mouse) to an `overflow-x-auto`
// rail. Touch/trackpad swipe already scroll it natively; a plain mouse has no
// way to pan a horizontal-only rail — there's no visible scrollbar (usually
// hidden via `scrollbar-hide`) and a vertical wheel doesn't move it — so
// without this the rail silently doesn't "slide" for desktop mouse users even
// though `scrollLeft` itself works fine.
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { down: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false };
    // A `scroll-snap-type: mandatory` rail re-snaps mid-gesture and fights a
    // live scrollLeft drag, effectively cancelling it. Suspend snapping for
    // the duration of the drag; endDrag() re-engages it (a no-op for rails
    // that don't use scroll-snap at all).
    el.style.scrollSnapType = "none";
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.down) return;
    const delta = e.pageX - d.startX;
    if (Math.abs(delta) > 5) d.moved = true;
    if (d.moved) {
      e.preventDefault();
      el.scrollLeft = d.startScroll - delta;
    }
  }, []);

  const endDrag = useCallback(() => {
    drag.current.down = false;
    const el = ref.current;
    if (el) el.style.scrollSnapType = "";
  }, []);

  // Swallow the click that follows a drag so a Link/button inside the rail
  // doesn't navigate/fire just because the drag ended over it.
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current.moved = false;
  }, []);

  return {
    ref,
    onMouseDown,
    onMouseMove,
    onMouseUp: endDrag,
    onMouseLeave: endDrag,
    onClickCapture,
    className: "cursor-grab active:cursor-grabbing select-none",
  };
}
