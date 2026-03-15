

## Plan: Create MyStore Page + Update Routes & Nav

### Files to change

**1. Create `src/pages/MyStore.tsx`** — Large new page with all sections:

- **Profile Summary card**: Photo with camera overlay (file input trigger), initials fallback, business name/phone, stats row (rating/reviews/followers), Progress bar with 45% score linking to profile completion Dialog (reuse same checklist pattern from BusinessProfileScore)
- **Quick Actions**: 4-item grid (Advertise/My Profile/My Products/Help) with colored icon backgrounds
- **Advertise banner**: Gradient card with CTA → /advertisements
- **Business Section card**: List rows with ChevronRight — Add Category (opens Sheet with chips), Shortlisted Leads (badge), Quotation Page, Customer Chats (badge)
- **Subscription Section**: Silver Plan + Active badge, Payment History row
- **Reviews Section**: 4.2 rating with star icons, Share QR Code button → Dialog with QR placeholder + Copy Link/Download/Share buttons
- **App Settings card**: Language toggle (English/Hindi pills), Lead Notification Tone (Select), Notifications (Switch), Test Now button, Default Currency (Select), Timezone (Select)
- **Other Settings list**: Report Fraud, App Feedback, Share App (navigator.share), Privacy Policy, Terms, About Us, Log Out (confirm Dialog → clear role → navigate /)
- **Email Notifications card**: Toggle rows for quote/message/RFQ/newsletter notifications + push notification toggles + Save button
- All sections wrapped in `motion.div` with staggered `fade-in` delays

**2. Update `src/App.tsx`**:
- Import MyStore, add `<Route path="/my-store" element={<MyStore />} />`

**3. Update `src/components/layout/MobileBottomNav.tsx`**:
- Import `Store` from lucide-react
- Change seller nav last item: `{ name: "My Store", href: "/my-store", icon: Store }`

### Technical notes
- Uses DashboardLayout wrapper
- Sheet component for category selection bottom sheet
- Dialog for QR code sharing and profile completion checklist
- Select, Switch components from shadcn
- navigator.share API for Share App (with fallback)
- Log Out confirmation via AlertDialog or Dialog

