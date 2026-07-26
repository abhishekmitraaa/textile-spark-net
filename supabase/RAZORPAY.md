# Razorpay setup — subscriptions + ads

Both payment flows are already implemented end to end (client → edge function →
Razorpay → verify → DB). Going live is **configuration only**: set three
secrets, deploy six functions, register two webhooks.

Project ref: `vxdhhgdfubqedfpwfyrb`
Key ID: `rzp_live_TF1gnuDb2l6AQW` — **live mode, real money.**

---

## Architecture

Two parallel, independent flows sharing one gateway account and one checkout
helper. Neither uses the Razorpay Subscriptions API — there is no autopay and no
recurring mandate. Every billing period is a discrete order the vendor pays
explicitly, which is why the subscription flow looks identical to the ad flow.

| | Ads | Subscriptions |
|---|---|---|
| Create order | `razorpay-create-order` | `subscription-create-order` |
| Verify | `razorpay-verify-payment` | `subscription-verify-payment` |
| Webhook backstop | `razorpay-webhook` | `subscription-webhook` |
| Intent table | `ad_orders` | `subscription_payment_orders` |
| On success | rows in `advertisements` (+ trust seals) | `vendor_subscriptions` + `subscription_invoices` |
| Client entry | [payments.ts](../src/lib/queries/payments.ts) | [subscriptions.ts](../src/lib/queries/subscriptions.ts) |

**The flow, both sides:**

1. Client calls create-order. The server computes the amount itself — from the
   placement price table (ads) or from `subscription_plans` + 18% GST
   (subscriptions) — and records a `status='created'` intent row holding the
   vendor id (taken from the caller's JWT) and the full spec/plan.
2. Razorpay Checkout opens in the browser with that order id.
3. On success the client calls verify-payment, which checks the
   HMAC-SHA256 signature of `orderId|paymentId` against the key secret, then
   fulfils the intent.
4. If the browser closes before step 3, Razorpay's `payment.captured` webhook
   fulfils the same intent instead.

Steps 3 and 4 both fulfil via a conditional `'created' → 'paid'` UPDATE, so
whichever arrives first wins and the other no-ops. **This is what makes
double-charging impossible** — not ordering luck.

Both webhook URLs receive every `payment.captured` event for the account. Each
looks up the order id in its own intent table only; an ad payment finds no row
in `subscription_payment_orders` and no-ops, and vice versa. That is intended,
not a misconfiguration.

### Amounts are never trusted from the client

Every price is recomputed server-side at both create-order and verify time. A
tampered client can change what it *asks* for, never what it *pays* or *gets*.

### Plan gating on the ad path

Before publishing a paid ad, verify-payment and the webhook re-resolve the
vendor's real plan and enforce `ad_location_scope`:

- **Free vendor** (`scope = 'none'`) — ads are not published; the order is
  flagged `refund_review` for manual admin follow-up. Never silently dropped.
- **Paid tier over its city allowance** — the target-city list is clamped to the
  allowed count and the ads publish. Ad pricing doesn't vary by city count, so
  clamping removes nothing the vendor paid for; failing the order outright would
  deny someone who legitimately paid.

Refunds for `refund_review` orders are **manual** — there is no automated
gateway refund call. Watch that status.

---

## Setup

### 1. Log in and run the script

```powershell
npx supabase login          # once; opens a browser
./scripts/setup-razorpay.ps1
```

It prompts for the key secret and a webhook secret (both hidden), sets all three
function secrets, and deploys the six functions. Re-running is safe.

Invent the **webhook secret** yourself — any long random string. Generate one with:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Use the **same value** in the Razorpay dashboard in step 2.

<details>
<summary>Manual equivalent, if you'd rather not use the script</summary>

```powershell
npx supabase secrets set --project-ref vxdhhgdfubqedfpwfyrb `
  "RAZORPAY_KEY_ID=rzp_live_TF1gnuDb2l6AQW" `
  "RAZORPAY_KEY_SECRET=<secret>" `
  "RAZORPAY_WEBHOOK_SECRET=<webhook secret>"

foreach ($f in 'razorpay-create-order','razorpay-verify-payment','razorpay-webhook',
                'subscription-create-order','subscription-verify-payment','subscription-webhook') {
  npx supabase functions deploy $f --project-ref vxdhhgdfubqedfpwfyrb
}
```
</details>

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform —
do not set them yourself.

### 2. Register the webhooks

Razorpay dashboard → **Settings → Webhooks → Add New Webhook**, twice:

| URL | Events | Secret |
|---|---|---|
| `https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/razorpay-webhook` | `payment.captured`, `order.paid` | the webhook secret |
| `https://vxdhhgdfubqedfpwfyrb.supabase.co/functions/v1/subscription-webhook` | `payment.captured`, `order.paid` | the same webhook secret |

Both webhooks must deploy with `verify_jwt = false`, or Supabase rejects
Razorpay's callbacks with 401 before the handler ever runs. That is set in
[config.toml](config.toml) and applied by the deploy — don't remove it.

### 3. Verify

```powershell
npx supabase secrets list --project-ref vxdhhgdfubqedfpwfyrb
```

Then in the app: **Subscription** page → buy a plan, and **Advertisements** →
buy a campaign. Before the secrets are set both pages run a *simulated*
checkout and say so on screen; once set, real Razorpay Checkout opens. That
on-screen wording is the fastest way to tell which mode you're in.

Because the key is **live**, the cheapest end-to-end test is a real ₹15
`directBroadcast` ad for one day, then refund it from the Razorpay dashboard.

Function logs: Supabase dashboard → Edge Functions → *(function)* → Logs.

---

## Rollback

Unsetting the key secret returns both flows to simulated checkout without a
redeploy — the functions branch on whether the secret is present:

```powershell
npx supabase secrets unset --project-ref vxdhhgdfubqedfpwfyrb RAZORPAY_KEY_SECRET
```
