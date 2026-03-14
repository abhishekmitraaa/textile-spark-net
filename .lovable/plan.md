

## Plan: Create Vendor Landing Page + Route Seller Flow Through It

### Overview
Create `src/pages/VendorLanding.tsx` as a standalone scrollable landing page at `/seller`. Update the Landing page's Seller card and RoleSelection's Seller option to route to `/seller` instead of `/register`.

### 1. Create `src/pages/VendorLanding.tsx`

Standalone page (no DashboardLayout) with these sections, all using `motion.div` with `whileInView` fade-in (`viewport={{ once: true }}`):

- **Header**: Cosora logo left, "View Existing Applications" link + "Get Started" button right
- **Hero**: Headline with "0% Commission" in `text-accent`, video placeholder, 4-item document checklist (green Check icons), "Complete in 10 minutes" badge, full-width CTA → `/register`, "View Existing Applications" link
- **Market Positioning**: Dark card (`bg-foreground text-background`), italic heading, "Explore as Guest" outline button → `/browse`
- **Why Partner**: 3 value prop cards (Users/Percent/Shield icons) in responsive grid, brand logo badges horizontal scroll, CTA
- **Pricing**: Green "Limited-Time Offer" badge, "Daily ads from Rs 25" heading, "Registration Fee: FREE", 3 plan cards (Basic ₹999, Silver ₹1,999, Gold ₹4,999)
- **Success Stories**: 3 testimonial cards + FAQ accordion (4 items)
- **Reach**: "150+ countries" stat, world map placeholder with Globe icon, CTA
- **Footer**: hello@cosora.in, Instagram, © 2024

Icons: Play, Check, Clock, Users, Percent, Shield, Globe, Star, Instagram, Mail, ChevronRight from lucide-react. Accordion from `@/components/ui/accordion`.

### 2. Update `src/App.tsx`
- Import `VendorLanding`
- Add route: `<Route path="/seller" element={<VendorLanding />} />`

### 3. Update `src/pages/Landing.tsx` (line 119)
- Change Seller card's `Link to` from `/register` to `/seller`

### 4. Update `src/pages/RoleSelection.tsx` (line 28)
- Change seller navigation from `navigate("/register")` to `navigate("/seller")`

### Flow
```text
Landing → "I'm a Seller" → /seller (Vendor Landing) → "Get Started" → /register
Landing → "I'm a Buyer" → /register → OTP → Role Selection → Sub-role → ...
RoleSelection → SELLER → /seller (Vendor Landing)
```

