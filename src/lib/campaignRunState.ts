// ─────────────────────────────────────────────────────────────
// Phase 8.1 — what a campaign is actually doing, in words a vendor can act on.
//
// "Paused" alone never told a vendor whether they could resume it themselves.
// The state model now distinguishes paused_by_vendor from paused_by_admin, and
// this module is where that distinction turns into something readable: a label,
// a tone, a sentence saying WHY, and whether the vendor can do anything about it.
//
// Dependency-free (no React, no supabase) so `scripts/ad-run-state-check.mjs`
// can exercise every state, and so importing it from a component file cannot
// trip react-refresh/only-export-components.
// ─────────────────────────────────────────────────────────────

export type RunTone = "live" | "waiting" | "stopped" | "attention";

export interface CampaignLike {
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  moderationReason?: string | null;
  moderatedAt?: string | null;
}

export interface RunState {
  /** Short label for a badge. */
  label: string;
  tone: RunTone;
  /** One sentence explaining the state. Never empty. */
  reason: string;
  /** True when the campaign is being served to buyers right now. */
  serving: boolean;
  /** What the vendor can do from here, if anything. */
  action: "none" | "pause" | "resume" | "edit_and_resubmit";
}

function fmt(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Note the ORDER of checks. A campaign whose ends_at has passed reads as
 * finished even if its stored status still says 'active' — the sweep runs every
 * five minutes, and for those few minutes the row and the truth disagree. The
 * read path already stopped serving it, so claiming "live" here would be the
 * dashboard lying about something the buyer side had already stopped doing.
 */
export function runStateOf(c: CampaignLike, now: Date = new Date()): RunState {
  const s = c.status;
  const ends = c.endsAt ? new Date(c.endsAt) : null;
  const starts = c.startsAt ? new Date(c.startsAt) : null;
  const why = c.moderationReason?.trim() || null;

  if (s === "archived") {
    return { label: "Archived", tone: "stopped", reason: "This campaign has been archived.", serving: false, action: "none" };
  }
  if (s === "rejected") {
    return {
      label: "Not approved", tone: "attention",
      reason: why ? `Not approved: ${why}` : "This campaign was not approved and will not run.",
      serving: false, action: "none",
    };
  }
  if (s === "suspended") {
    return {
      label: "Suspended", tone: "attention",
      reason: why ? `Suspended pending review: ${why}` : "Suspended pending review by Cosora.",
      serving: false, action: "none",
    };
  }
  if (s === "changes_requested") {
    return {
      label: "Changes needed", tone: "attention",
      reason: why ? `Changes needed before this can run: ${why}` : "Cosora asked for changes before this campaign can run.",
      serving: false, action: "edit_and_resubmit",
    };
  }
  if (s === "pending_review") {
    const since = fmt(c.moderatedAt) ?? null;
    return {
      label: "Waiting for review", tone: "waiting",
      reason: since
        ? `Paid and waiting for Cosora to review it, since ${since}.`
        : "Paid and waiting for Cosora to review it. Payment does not publish a campaign.",
      serving: false, action: "none",
    };
  }
  if (s === "expired" || s === "ended" || (ends && ends.getTime() <= now.getTime())) {
    const on = fmt(c.endsAt);
    return {
      label: "Finished", tone: "stopped",
      reason: on ? `This campaign finished its run on ${on}.` : "This campaign has finished its run.",
      serving: false, action: "none",
    };
  }
  if (s === "paused_by_admin") {
    return {
      label: "Paused by Cosora", tone: "attention",
      reason: why ? `Paused by Cosora: ${why}` : "Paused by Cosora. Contact support to resume it.",
      // Deliberately not "resume": resume_ad_campaign refuses a vendor here,
      // and offering a button that always fails is worse than offering none.
      serving: false, action: "none",
    };
  }
  if (s === "paused_by_vendor" || s === "paused") {
    return { label: "Paused", tone: "stopped", reason: "You paused this campaign.", serving: false, action: "resume" };
  }
  if (s === "scheduled") {
    const on = fmt(c.startsAt);
    return {
      label: "Scheduled", tone: "waiting",
      reason: on ? `Approved. Starts on ${on}.` : "Approved and scheduled to start.",
      serving: false, action: "pause",
    };
  }
  if (s === "active") {
    if (starts && starts.getTime() > now.getTime()) {
      const on = fmt(c.startsAt);
      return {
        label: "Scheduled", tone: "waiting",
        reason: on ? `Approved. Starts on ${on}.` : "Approved and scheduled to start.",
        serving: false, action: "pause",
      };
    }
    const on = fmt(c.endsAt);
    return {
      label: "Live", tone: "live",
      reason: on ? `Running and being shown to buyers until ${on}.` : "Running and being shown to buyers.",
      serving: true, action: "pause",
    };
  }
  if (s === "budget_exhausted") {
    // Unreachable by construction: pricing is flat-rate/prepaid and there are no
    // budget columns. Handled anyway so a future metered phase cannot make this
    // fall through to the "Draft" default and read as something it is not.
    return { label: "Budget spent", tone: "stopped", reason: "This campaign has spent its budget.", serving: false, action: "none" };
  }
  return {
    label: "Draft", tone: "stopped",
    reason: "Not submitted yet. A campaign goes live only after payment and Cosora's review.",
    serving: false, action: "none",
  };
}
