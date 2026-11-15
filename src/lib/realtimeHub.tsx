import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlag } from "@/lib/queries/featureFlags";

// ─────────────────────────────────────────────────────────────
// LIVE-UPDATE HUB (seller home fixes T9; SH-030, SH-031, SH-036; migration 20261116100400_live_updates_hub.sql).
//
// One private Broadcast channel per signed-in account, `user:<id>`, opened once above the router and kept across page
// changes. Database triggers send it "notifications" or "chat" when that account's notifications or chats change, at
// most one event per statement, with no content: listeners re-read what they show. Bursts are folded into one call
// per event 300 ms after the last one, so "Read all" is one re-read, not one per row.
//
// Behind the switch live_updates_hub. While it's off (or loading), `live` is false and the bell and chat badge keep
// their own postgres_changes subscriptions, as before.
// ─────────────────────────────────────────────────────────────

export type HubEvent = "notifications" | "chat";

const DEBOUNCE_MS = 300;

interface Hub {
  /** True once the account's channel is open; until then callers keep their own subscriptions. */
  live: boolean;
  subscribe: (event: HubEvent, handler: () => void) => () => void;
}

const HubContext = createContext<Hub>({ live: false, subscribe: () => () => {} });

export function RealtimeHubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const on = useFeatureFlag("live_updates_hub") === true;
  const [live, setLive] = useState(false);
  const handlers = useRef(new Map<HubEvent, Set<() => void>>());

  const subscribe = useCallback((event: HubEvent, handler: () => void) => {
    let set = handlers.current.get(event);
    if (!set) handlers.current.set(event, (set = new Set()));
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!userId || !on) {
      setLive(false);
      return;
    }
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const timers = new Map<HubEvent, ReturnType<typeof setTimeout>>();
    const fire = (event: HubEvent) => {
      const t = timers.get(event);
      if (t) clearTimeout(t);
      timers.set(event, setTimeout(() => handlers.current.get(event)?.forEach((h) => h()), DEBOUNCE_MS));
    };

    // A private channel is authorised with the session's token; give Realtime the new one whenever it changes, or
    // the channel is dropped when the old token expires.
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && session) void supabase.realtime.setAuth(session.access_token);
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`user:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "notifications" }, () => fire("notifications"))
        .on("broadcast", { event: "chat" }, () => fire("chat"))
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setLive(true);
            // Anything that changed between the first reads and the channel joining.
            fire("notifications");
            fire("chat");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            // Back to the per-hook subscriptions until it joins again.
            setLive(false);
          }
        });
    })();

    return () => {
      cancelled = true;
      auth.subscription.unsubscribe();
      timers.forEach((t) => clearTimeout(t));
      setLive(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, on]);

  const value = useMemo(() => ({ live, subscribe }), [live, subscribe]);
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

/** Whether the hub is carrying this account's updates right now. */
export function useHubLive(): boolean {
  return useContext(HubContext).live;
}

/** Calls `handler` (at most once per 300 ms burst) when the hub says this account's `event` changed. */
export function useHubEvent(event: HubEvent, handler: () => void): boolean {
  const hub = useContext(HubContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => hub.subscribe(event, () => latest.current()), [hub, event]);
  return hub.live;
}
