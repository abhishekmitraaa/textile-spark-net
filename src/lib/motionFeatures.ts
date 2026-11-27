// framer-motion's animation engine, loaded after the first script (speed plan 3.3, 2026-11-27). Files in the first
// script import `m` (aliased `motion`) and run inside <LazyMotion> in App.tsx, which loads this. domMax because the
// bottom bar and role switcher use layoutId and the New Arrivals hero uses drag. Pages loaded on their own may keep
// importing `motion`: LazyMotion isn't strict, so those still carry their own engine.
import { domMax } from "framer-motion";

export default domMax;
