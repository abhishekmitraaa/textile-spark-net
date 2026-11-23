import { COMPANY } from "@/lib/company";
import type { PolicySection } from "@/data/privacyPolicy";

// Cosora Refund & Cancellation Policy (Mitra, 2026-11-24; documentation/company-disclosure-plan-2026-11-24.md).
// Only the rules the code already applies, each named in documentation/claude.md: the 7-day money-back guarantee
// (refund_guarantee_request), plan changes (admin.subscription_quote), autopay (a plan runs to the end of what was
// paid), and ad refunds through Cosora-Admin (refund_review, admin-refund-payment). Change this text in the same commit
// as any of those rules. Cosora sells no goods, so there is no shipping policy: Terms clause 2.

export const REFUND_LAST_UPDATED = "24 November 2026";

export const REFUND_INTRO = `This policy explains when you can get money back for what you buy from Cosora, and how to cancel. Cosora is a brand of ${COMPANY.legalName}, which takes these payments and makes these refunds.`;

export const REFUND_SECTIONS: PolicySection[] = [
  {
    id: "what-we-sell",
    heading: "1. What Cosora sells",
    paragraphs: [
      "Cosora sells services to sellers: subscription plans, ad campaigns, the Trusted Seal and the Verified Certificate. You pay for them online, through our payment partner Razorpay.",
      "Cosora doesn't sell or ship goods. Products listed on Cosora are sold by the sellers themselves, and buyers and sellers agree price, payment, delivery and returns between themselves. So there is no shipping policy here, and a refund for goods is a matter between the buyer and the seller.",
    ],
  },
  {
    id: "money-back",
    heading: "2. 7-day money-back guarantee on your first plan",
    paragraphs: [
      "If you're subscribing for the first time, you can ask for a full refund within 7 days of your first payment. Ask from the Subscription page. We refund the payment to the card or account you paid with, and your plan ends when the refund is made.",
      "The guarantee applies once per seller.",
    ],
  },
  {
    id: "plan-changes",
    heading: "3. Changing or cancelling a plan",
    bullets: [
      "Upgrading starts the new plan straight away, and the unused part of what you paid for the old one comes off the price.",
      "Downgrading, or moving from yearly to monthly, is paid now and starts when your current period ends.",
      "You can pay for one period ahead at most.",
      "If you turn off autopay, or it stops, your plan keeps running to the end of the period you've paid for. Nothing more is charged.",
      "Outside the 7-day guarantee, plan fees aren't refunded for the rest of a period.",
    ],
  },
  {
    id: "ads",
    heading: "4. Ads, the Trusted Seal and the Verified Certificate",
    paragraphs: [
      "Every paid campaign is reviewed before it goes live. If Cosora rejects or suspends a campaign you paid for, our finance team looks at the order and refunds it, or tells you why no refund is due.",
      "Otherwise these fees aren't refunded once the campaign, seal or certificate has started.",
    ],
  },
  {
    id: "how",
    heading: "5. How refunds are paid",
    paragraphs: [
      "Refunds go back to the card or account you paid with, through Razorpay. They usually reach you within [PLACEHOLDER: number of working days] working days of being made, depending on your bank.",
      "We issue a credit note for every refunded invoice. You'll find it with the invoice in My Payments.",
    ],
  },
  {
    id: "contact",
    heading: "6. Questions",
    paragraphs: [
      `Write to ${COMPANY.email} or call or WhatsApp ${COMPANY.phoneLabel}, with your invoice number if you have one.`,
    ],
    links: [{ label: "Contact us", href: "/contact" }],
  },
];
