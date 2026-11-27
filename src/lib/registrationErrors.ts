// The seller-facing sentence for each registration refusal. Its own file (speed plan 3.2, 2026-11-27): errorMessage()
// is imported almost everywhere, and reading these through registrationValidation.ts put that file, the vendor types
// and the whole seller category table (109 KB) into the first script of every visit.

/** What each refusal means to the seller. The keys are the database's messages (22023 / P0001 / 42501). */
export const REGISTRATION_ERROR_TEXT: Record<string, string> = {
  invalid_payload: "Something in the form didn't come through. Check each step and submit again.",
  payload_too_large: "The registration is too large to send. Shorten long answers and submit again.",
  invalid_country: "Choose the country your business is registered in.",
  invalid_business_name: "Enter your business name (2 to 120 characters).",
  invalid_phone: "Enter a complete business phone number.",
  invalid_whatsapp: "Enter a complete WhatsApp number, with its country code.",
  invalid_website: "Enter your website's full address, like https://yourbusiness.com, or choose None.",
  invalid_owner_name: "Enter the owner's full name.",
  invalid_email: "Enter a working email address, like name@business.com.",
  invalid_address: "Enter the area, sector or locality of your business.",
  invalid_city: "Enter your city.",
  invalid_state: "Choose your state from the list.",
  invalid_postal_code: "Enter a valid pincode or postal code.",
  invalid_primary_type: "Choose what kind of business you are.",
  invalid_capability: "One of the capabilities isn't on the list. Choose them again.",
  invalid_categories: "Add at least one business category.",
  missing_premises_photo: "Add at least one photo of your business premises.",
  premises_photo_limit: "A store shows up to 12 premises photos.",
  invalid_file: "One of your files didn't upload properly. Remove it, add it again and submit.",
  invalid_pan: "Check your PAN, the name on it and the address.",
  invalid_gstin: "That GSTIN isn't valid. Check it against your GST certificate.",
  gstin_pan_mismatch: "The GSTIN doesn't match your PAN. A GSTIN contains the PAN it was issued for.",
  invalid_registration: "Check your business registration: its kind and its number.",
  missing_document: "A required document is missing. Check the documents step.",
  invalid_product: "Check your first product: a name, a price above zero, a whole-number MOQ and at least one photo.",
  too_many_products: "Your plan's listing limit is reached, so the first product can't be added.",
  catalogue_limit: "Your plan's catalogue allowance is used. Upgrade to add another catalogue.",
  invalid_contract: "Type your full name to sign the Supplier Agreement.",
  already_registered: "This account is already registered as a seller.",
  awaiting_approval: "Your registration is waiting for Cosora's approval.",
  submission_closed: "Cosora has already answered this registration. Check your details and submit again.",
  account_inactive: "This account can't register right now. Contact Cosora support.",
};

/** A refusal key → its sentence, or null when the message isn't one of ours. */
export function registrationErrorText(message: string): string | null {
  return Object.prototype.hasOwnProperty.call(REGISTRATION_ERROR_TEXT, message) ? REGISTRATION_ERROR_TEXT[message] : null;
}
