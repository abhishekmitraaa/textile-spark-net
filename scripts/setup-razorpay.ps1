# setup-razorpay.ps1 — one-shot Razorpay wiring for the Cosora Supabase project.
#
# Sets the three function secrets and deploys the six payment edge functions
# (ads + subscriptions, create-order / verify-payment / webhook each).
#
# The key SECRET and webhook secret are read as SecureString prompts and passed
# straight to `supabase secrets set` — they are never written to a file in this
# repo, never echoed, and never committed. The key ID is not a secret (it ships
# to the browser inside Razorpay Checkout), so it may be passed as a plain
# parameter.
#
# Usage, from the project root:
#     npx supabase login                       # once, opens a browser
#     ./scripts/setup-razorpay.ps1
#
# Re-running is safe: `secrets set` overwrites and `functions deploy` replaces.

[CmdletBinding()]
param(
  [string]$ProjectRef = 'vxdhhgdfubqedfpwfyrb',
  [string]$KeyId      = 'rzp_live_TF1gnuDb2l6AQW',
  [switch]$SkipSecrets,
  [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

$functions = @(
  'razorpay-create-order',
  'razorpay-verify-payment',
  'razorpay-webhook',
  'subscription-create-order',
  'subscription-verify-payment',
  'subscription-webhook'
)

function Convert-Secure([System.Security.SecureString]$s) {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host "Cosora - Razorpay setup" -ForegroundColor Cyan
Write-Host "Project ref : $ProjectRef"
Write-Host "Key ID      : $KeyId"
Write-Host ""

# ── Auth check ───────────────────────────────────────────────────────────────
# `projects list` is the cheapest call that proves the CLI holds a valid token.
npx supabase projects list *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run 'npx supabase login' first, then re-run this script." -ForegroundColor Red
  exit 1
}

# ── Secrets ──────────────────────────────────────────────────────────────────
if (-not $SkipSecrets) {
  $keySecret = Read-Host -AsSecureString "Razorpay KEY SECRET (from the dashboard; input hidden)"
  $hookSecret = Read-Host -AsSecureString "Razorpay WEBHOOK SECRET (you choose this; use the same value in the Razorpay dashboard)"

  $plainKey  = Convert-Secure $keySecret
  $plainHook = Convert-Secure $hookSecret

  if ([string]::IsNullOrWhiteSpace($plainKey) -or [string]::IsNullOrWhiteSpace($plainHook)) {
    Write-Host "Both secrets are required." -ForegroundColor Red
    exit 1
  }

  Write-Host "`nSetting function secrets..." -ForegroundColor Cyan
  npx supabase secrets set --project-ref $ProjectRef `
    "RAZORPAY_KEY_ID=$KeyId" `
    "RAZORPAY_KEY_SECRET=$plainKey" `
    "RAZORPAY_WEBHOOK_SECRET=$plainHook"

  # Drop the plaintext copies as soon as the call returns.
  $plainKey = $null; $plainHook = $null
  [GC]::Collect()

  if ($LASTEXITCODE -ne 0) { Write-Host "Failed to set secrets." -ForegroundColor Red; exit 1 }
  Write-Host "Secrets set." -ForegroundColor Green
}

# ── Deploy ───────────────────────────────────────────────────────────────────
# Deployed one at a time so a single failure names the function that broke.
# verify_jwt per function comes from supabase/config.toml — the two webhooks
# must land with verify_jwt = false or Razorpay's callbacks 401.
if (-not $SkipDeploy) {
  Write-Host "`nDeploying edge functions..." -ForegroundColor Cyan
  foreach ($fn in $functions) {
    Write-Host "  -> $fn"
    npx supabase functions deploy $fn --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed: $fn" -ForegroundColor Red; exit 1 }
  }
  Write-Host "All six functions deployed." -ForegroundColor Green
}

Write-Host ""
Write-Host "Remaining manual step - register two webhooks in the Razorpay dashboard" -ForegroundColor Yellow
Write-Host "(Settings -> Webhooks -> Add New Webhook), both with the WEBHOOK SECRET above"
Write-Host "and the events 'payment.captured' and 'order.paid':"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/razorpay-webhook       (ads)"
Write-Host "  https://$ProjectRef.supabase.co/functions/v1/subscription-webhook   (subscriptions)"
