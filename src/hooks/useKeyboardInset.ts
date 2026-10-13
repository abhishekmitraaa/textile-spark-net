import { useEffect, useState } from "react";

/**
 * How much of the bottom of the page the on-screen keyboard covers, in px.
 *
 * On a phone the keyboard covers the page without resizing it (iOS always,
 * Android Chrome by default), so 100dvh still counts the part under the
 * keyboard, and a bar pinned to the foot of a full-height screen ends up
 * beneath it. The VisualViewport API reports what is actually visible.
 *
 * The same sum as the code screen's own copy in OtpVerify.tsx, which stays
 * where it is: sign-in isn't touched for this.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // A pinch-zoom shrinks the visual viewport too; that isn't a keyboard.
      const kb = vv.scale > 1.01 ? 0 : window.innerHeight - vv.height - vv.offsetTop;
      setInset(kb > 24 ? Math.round(kb) : 0); // ignore tiny deltas (URL bar, etc.)
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
