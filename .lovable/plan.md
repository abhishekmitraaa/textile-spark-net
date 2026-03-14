

## Plan: Add Steps 3, 4, 5 to Onboarding.tsx

### Changes (single file: `src/pages/Onboarding.tsx`)

**New imports**: `MapPin`, `Upload`, `X`, `CheckCircle2` from lucide-react. `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`. `Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger` from `@/components/ui/dialog`.

**Step 3 — `StepBusinessAddress`**:
- Heading: "Where is your business located?"
- Google Maps placeholder: `rounded-xl bg-muted h-48 relative` with centered MapPin icon and "Mark your business location" overlay button at bottom center
- Form fields (`space-y-3`): Shop/Building No. (optional), Floor/Tower (optional), Area/Sector/Locality* (required), City* (required), Landmark (optional), Pincode* (required, `inputMode="numeric"` `maxLength={6}`)
- Italic note below: "Please ensure this address matches your business license"

**Step 4 — `StepOwnerDetails`**:
- Heading: "Who owns this business?"
- Fields: Full Name*, Email Address*, Registered Country (shadcn Select, default "India" with a few country options)
- Internal `showSuccess` state. When parent calls Continue on step 4, show inline success animation: green `CheckCircle2` scaling from 0→1, "Business information saved ✓" text, then auto-advance after 1 second
- To handle the auto-advance: the Continue button on step 4 will first trigger `showSuccess=true` inside the step, then after 1s timeout call `setCurrentStep(5)`. This requires passing an `onContinue` callback prop or lifting the logic. Simplest: make `StepOwnerDetails` accept an `onAdvance` callback, and override the Continue button behavior for step 4 in the main component.

**Step 5 — `StepBusinessImages`**:
- Heading: "Show us your business"
- Subtitle text
- Upload zone: `rounded-xl border-2 border-dashed` with Upload icon, "Click to upload or drag & drop", "PNG, JPG up to 10MB". Hidden `<input type="file" accept="image/*" multiple>` triggered on click
- State: `images: string[]` using `URL.createObjectURL` for previews
- Image preview grid: `grid-cols-3 gap-2`, each with `rounded-lg aspect-square object-cover` and X remove button overlay
- "View Guidelines" link opens shadcn Dialog with photo guidelines checklist (5 items with Check icons)

**Main component changes**:
- For step 4's special Continue behavior: add state `step4Success`. When `currentStep === 4` and Continue is clicked, set `step4Success = true`, then `setTimeout(() => { setStep4Success(false); setCurrentStep(5); }, 1000)`. Pass `step4Success` to `StepOwnerDetails` to show the success overlay.
- Update `renderStep()` switch to include cases 3, 4, 5
- Update Continue button `onClick` to handle step 4 specially

