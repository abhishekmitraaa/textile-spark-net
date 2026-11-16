// ─────────────────────────────────────────────────────────────
// What the Advertise page tells a seller after an ad checkout (Seller Home audit SH-090).
//
// One rule: say what happened to the money, and claim nothing the page doesn't know.
//   * Razorpay's checkout hands back a payment only after it took one. From then on the page never says "You were not
//     charged", whatever the server answers: a signature that doesn't verify can mean the server's key doesn't match
//     the checkout's, and the money has still moved.
//   * "Waiting for Cosora's review" is said only when this call set the campaigns up. When the order was already
//     handled (Razorpay's own notice got there first) the page doesn't know whether that published the campaigns or
//     sent the order to refund review, so it says neither, and never "0 campaigns".
//
// Dependency-free (no React, no supabase) so `scripts/ad-payment-outcome-check.mjs` can exercise every outcome: a real
// checkout can't be driven in a test.
// ─────────────────────────────────────────────────────────────

/** razorpay-verify-payment's answer, as far as the wording needs it (`AdPublishAnswer` in queries/payments.ts). */
export interface AdPublishOutcomeInput {
  ok: boolean;
  count?: number;
  error?: string;
  /** Nothing was written; the order is still waiting. */
  retry?: boolean;
  /** The order was not waiting: the other path handled it first. */
  already?: boolean;
  /** Paid, but nothing could be published; the order is in refund review. */
  blocked?: boolean;
  /** Why it was blocked: "refused" when the database turned the campaigns down; otherwise the plan. */
  reason?: string;
}

export interface AdCheckoutMessage {
  kind: "success" | "error";
  title: string;
  description: string;
  /** Kept on screen for a minute: it carries a payment ID the seller may need to copy. */
  long?: boolean;
}

/** After Razorpay's checkout handed back a payment. `picked` is how many listings the seller chose. */
export function paidAdOutcome(answer: AdPublishOutcomeInput, paymentId: string, picked: number): AdCheckoutMessage {
  if (answer.ok && answer.already) {
    return {
      kind: "success",
      title: "Payment received",
      description: `Your campaigns are listed under Your Campaigns. If none appear there, contact support with this payment ID: ${paymentId}`,
      long: true,
    };
  }
  if (answer.ok) {
    const n = answer.count || picked;
    return {
      kind: "success",
      title: "Payment received. Your ads are waiting for Cosora's review",
      description: `${n} campaign${n === 1 ? "" : "s"} sent for review. Your days start when Cosora approves them.`,
    };
  }
  if (answer.retry) {
    // The signature was good, so the money moved; only setting the campaigns up failed. The order is still waiting,
    // and Razorpay's own notice to Cosora sets it up when it is delivered again.
    return {
      kind: "error",
      title: "Payment received, but your ads are not set up yet",
      description: `Please contact support with this payment ID: ${paymentId}`,
      long: true,
    };
  }
  if (answer.blocked) {
    return {
      kind: "error",
      title: answer.reason === "refused"
        ? "Payment received, but these ads could not be set up"
        : "Payment received, but your plan cannot run these ads",
      description: "The order has been sent for a refund review.",
      long: true,
    };
  }
  return {
    kind: "error",
    title: "We couldn't confirm your payment",
    description: `If money left your account, contact support with this payment ID: ${paymentId}`,
    long: true,
  };
}

/** A code took the order to ₹0: there was no checkout and nothing was paid. */
export function freeAdOutcome(answer: AdPublishOutcomeInput, picked: number): AdCheckoutMessage {
  if (answer.ok && answer.already) {
    return { kind: "success", title: "Your ads are submitted!", description: "Your campaigns are listed under Your Campaigns." };
  }
  if (answer.ok) {
    const n = answer.count || picked;
    return { kind: "success", title: "Your ads are submitted!", description: `${n} campaign${n === 1 ? "" : "s"} sent for review.` };
  }
  if (answer.blocked) {
    return {
      kind: "error",
      title: answer.reason === "refused" ? "These ads could not be set up" : "Your plan cannot run these ads",
      description: "Nothing was charged. The order has been sent to Cosora to review.",
    };
  }
  return { kind: "error", title: "Couldn't publish your ads", description: "Nothing was charged. Please try again." };
}
