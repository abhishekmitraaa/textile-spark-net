

## Plan: Phone OTP Login Flow + OTP Verify Page

### Overview
Replace the email/password login with a phone-number OTP flow across two screens, plus add a new OTP verification page. Keep the left branding panel and animations intact.

---

### 1. Rewrite `src/pages/Login.tsx`

**Remove**: Email/password fields, role selector, show/hide password logic.

**Add**:
- **Language selector** (top-right): Globe icon button → dropdown with 15 Indian languages (English, Hindi, Bengali, Assamese, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Urdu, Rajasthani/Marwari, Bhojpuri). State-managed, default "English".
- **Country code selector**: Dropdown with flag emoji + dial code (default 🇮🇳 +91). Include ~10 common countries.
- **Phone number input**: Numeric input field, `inputMode="numeric"`, max 10 digits.
- **"Send OTP" button**: Full-width, `bg-accent text-accent-foreground`, disabled until phone has 10 digits.
- **Divider**: "Or continue with" text divider using horizontal rules.
- **Google Sign-in button**: Outline variant button with Google "G" SVG icon.
- **"Explore as Guest" link**: Centered below, `text-muted-foreground`, navigates to `/browse`.
- **On submit**: Navigate to `/auth/otp-verify`, passing phone number + country code via route state.

**Keep**: Left branding panel (lines 34–68), mobile logo, motion.div animations. Typography: DM Sans body, Playfair Display headings.

---

### 2. Create `src/pages/OtpVerify.tsx`

**Layout**: Same split-panel pattern as Login (left branding panel on `lg+`, full-width white on mobile).

**Content** (right panel / mobile full-screen):
- **Back arrow** top-left → navigates back to `/login`.
- **Cosora logo** centered (italic, `font-display text-accent`), mobile only.
- **"Verify your number"** heading (Playfair Display, `text-2xl font-bold`).
- **Masked phone**: Display received phone as "+91 98765 ••••10" format + "Not You?" link (`text-accent`) → navigates back to `/login`.
- **OTP input**: 6-digit using shadcn `InputOTP` component with `InputOTPGroup` and `InputOTPSlot`. Set `inputMode="numeric"`.
- **Resend timer**: 60-second countdown "Resend OTP in 0:XX" (`text-muted-foreground`). At 0:00, show "Resend OTP" as clickable `text-accent` link that resets timer.
- **"Verify" button**: Full-width `bg-accent`, disabled until all 6 digits entered.
- **On verify**: Mock logic — navigate to `/browse` (simulating existing user as buyer) using role context. Could also route to `/auth/role-selection` for new users (placeholder for future).

---

### 3. Update `src/App.tsx`

- Import `OtpVerify` from `src/pages/OtpVerify`.
- Add route: `<Route path="/auth/otp-verify" element={<OtpVerify />} />`.

---

### Technical Details

- **Phone masking**: Take phone string, show first 5 digits + "••••" + last 2 digits.
- **Timer**: `useEffect` with `setInterval`, decrement from 60, clear on unmount.
- **State flow**: Login passes `{ phone, countryCode }` via `useNavigate("/auth/otp-verify", { state })`. OtpVerify reads via `useLocation().state`.
- **No backend**: All mock/client-side. OTP verification is simulated (any 6 digits accepted).
- **Fonts**: Already configured — DM Sans for body (`font-family` on body), Playfair Display for headings (h1-h6 rule in index.css). `font-display` class likely maps to Playfair.

