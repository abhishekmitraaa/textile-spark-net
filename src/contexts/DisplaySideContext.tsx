import { createContext, useContext, type ReactNode } from "react";
import { useUserRole } from "@/contexts/UserRoleContext";

type Side = "buyer" | "seller";
const DisplaySideCtx = createContext<Side | null>(null);

/**
 * The side a frame shows, apart from the account's side (2026-11-19, review M-63, M-64). A seller page shows the
 * seller header, sidebar and bottom bar even to an account that isn't a registered seller yet (a new seller, or one
 * waiting for approval): it used to show the seller frame with buyer tabs and the buyer bottom bar inside it. This
 * only changes what the frame draws; who may switch sides is still useSwitchRole's rule.
 */
export function DisplaySide({ side, children }: { side: Side | null; children: ReactNode }) {
  return <DisplaySideCtx.Provider value={side}>{children}</DisplaySideCtx.Provider>;
}

/** The side the chrome should draw: the frame's, else the account's. */
export function useDisplayRole(): Side {
  const forced = useContext(DisplaySideCtx);
  const { role } = useUserRole();
  return forced ?? role;
}
