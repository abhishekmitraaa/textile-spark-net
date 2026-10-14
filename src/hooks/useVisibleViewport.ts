import { useEffect, useState } from "react";

export interface VisibleViewport {
  /** Height of the part of the page the person can see, in px (the keyboard is not part of it). */
  height: number;
  /** How much of the bottom of the layout the on-screen keyboard covers, in px; 0 when it's down. */
  keyboard: number;
}

/**
 * What a phone actually shows while its keyboard is up.
 *
 * The keyboard covers the page without resizing it (iOS always, Android Chrome by default), so
 * a `position: fixed` sheet pinned to the bottom, or a dialog centred on the screen, ends up under
 * it, and whatever is being typed can't be seen. Pin such a thing at `bottom: keyboard` and cap
 * it at `height`. Same sum as useKeyboardInset (the chat composer), plus the visible height.
 * Null where the browser has no VisualViewport.
 */
export function useVisibleViewport(): VisibleViewport | null {
  const [state, setState] = useState<VisibleViewport | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // A pinch-zoom shrinks the visual viewport too; that isn't a keyboard.
      const kb = vv.scale > 1.01 ? 0 : window.innerHeight - vv.height - vv.offsetTop;
      const keyboard = kb > 24 ? Math.round(kb) : 0; // ignore tiny deltas (URL bar, etc.)
      const height = Math.round(vv.height);
      setState((prev) => (prev && prev.keyboard === keyboard && prev.height === height ? prev : { keyboard, height }));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return state;
}
