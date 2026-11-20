// Cosora Terms & Conditions: the one copy of the text. /terms (TermsConditions.tsx) shows all of it, and the sign-up
// Terms card (Terms.tsx) shows the same clauses (buyer sign-up audit 2026-11-13, item 5). Content supplied by the
// business. Changing what a buyer agrees to is a new BUYER_TERMS_VERSION (src/lib/buyerTerms.ts) and a new
// buyer_terms_version() in a migration, so the record names the wording that was shown.

export interface TermsClause {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  bulletsIntro?: string;
}

// Version 2026-11-v2 (Mitra, 2026-11-20, review L-59): the date the text took effect, and no "India's premier" (a
// claim nothing measures). Buyers who accepted v1 aren't asked again ("New text, don't re-ask").
export const TERMS_EFFECTIVE_DATE = "20th November 2026";

export const TERMS_INTRO =
  "Welcome to Cosora, a B2B fashion and textile sourcing platform. By accessing or using our website, mobile application, or any associated services (collectively, the \"Platform\"), you agree to be bound by the following terms and conditions (\"Terms\"). Please read them carefully.";

export const TERMS_CLAUSES: TermsClause[] = [
  {
    heading: "1. Acceptance of Terms",
    paragraphs: [
      "By registering, accessing, or using the Platform, you agree to comply with and be legally bound by these Terms, our Privacy Policy, and any other policies referenced herein. If you do not agree to these Terms, please refrain from using the Platform.",
    ],
  },
  {
    heading: "2. Platform Overview",
    paragraphs: [
      "Cosora acts as a digital marketplace facilitating connections between buyers and verified sellers in the fashion and textile industry. We do not partake in the actual transactions between users and are not responsible for the quality, safety, legality, or delivery of the products or services listed.",
    ],
  },
  {
    heading: "3. User Eligibility",
    bulletsIntro: "To use the Platform, you must:",
    bullets: [
      "Be at least 18 years old.",
      "Have the authority to enter into a legally binding agreement.",
      "Provide accurate, current, and complete information during registration.",
    ],
  },
  {
    heading: "4. User Responsibilities",
    bulletsIntro: "Users agree to:",
    bullets: [
      "Use the Platform in compliance with all applicable laws and regulations.",
      "Maintain the confidentiality of their account credentials.",
      "Refrain from posting false, misleading, or inappropriate content.",
      "Refrain from engaging in fraudulent activities.",
      "Refrain from violating intellectual property rights.",
      "Refrain from introducing viruses or harmful code.",
    ],
  },
  {
    heading: "5. Seller Verification and Listings",
    bullets: [
      "All sellers undergo a verification process to ensure credibility.",
      "Sellers are responsible for the accuracy and legality of their listings.",
      "Cosora reserves the right to remove or modify listings that violate our policies or applicable laws.",
    ],
  },
  {
    heading: "6. Payment and Fees",
    bullets: [
      "Cosora operates on a pay-per-lead model and offers premium listing services.",
      "All payments are to be made through authorized channels.",
      "Fees are non-refundable unless stated otherwise.",
      "Cosora reserves the right to modify its fee structure with prior notice.",
    ],
  },
  {
    heading: "7. Intellectual Property",
    bullets: [
      "All content on the Platform, including logos, designs, and text, is the property of Cosora or its licensors.",
      "Users may not reproduce, distribute, or create derivative works without prior written consent.",
    ],
  },
  {
    heading: "8. Confidentiality",
    bulletsIntro:
      "Users may gain access to confidential information, including business strategies, customer data, and proprietary processes. Users agree to:",
    bullets: [
      "Maintain the confidentiality of such information.",
      "Not disclose or use the information for unauthorized purposes.",
      "Notify Cosora immediately upon unauthorized disclosure.",
    ],
  },
  {
    heading: "9. Limitation of Liability",
    bulletsIntro: "To the maximum extent permitted by law:",
    bullets: [
      "Cosora shall not be liable for any indirect, incidental, or consequential damages arising out of or related to the use of the Platform.",
      "Our total liability for any claims under these Terms is limited to the amount paid by the user to Cosora in the 12 months preceding the claim.",
    ],
  },
  {
    heading: "10. Indemnification",
    bulletsIntro:
      "Users agree to indemnify and hold harmless Cosora, its affiliates, and employees from any claims, damages, or expenses arising from:",
    bullets: [
      "User's breach of these Terms.",
      "User's violation of any law or third-party rights.",
      "Content submitted by the user.",
    ],
  },
  {
    heading: "11. Termination",
    bulletsIntro: "Cosora reserves the right to:",
    bullets: [
      "Suspend or terminate user accounts for violations of these Terms.",
      "Remove content that violates our policies or applicable laws.",
      "Modify or discontinue the Platform with or without notice.",
    ],
  },
  {
    heading: "12. Dispute Resolution",
    bullets: [
      "Any disputes arising out of these Terms shall be resolved amicably between the parties.",
      "If unresolved, disputes shall be referred to arbitration under the Arbitration and Conciliation Act, 1996, with the arbitration held in India.",
      "The language of arbitration shall be English.",
    ],
  },
  {
    heading: "13. Governing Law",
    paragraphs: [
      "These Terms are governed by the laws of India. Courts in Mumbai, India shall have exclusive jurisdiction over any disputes arising from these Terms.",
    ],
  },
  {
    heading: "14. Amendments",
    paragraphs: [
      "Cosora reserves the right to modify these Terms at any time. Users will be notified of significant changes, and continued use of the Platform constitutes acceptance of the revised Terms.",
    ],
  },
  {
    heading: "15. Contact Information",
    paragraphs: [
      "For any queries or concerns regarding these Terms, please contact:",
      "Cosora Legal Department",
      "Email: ananditawork1@gmail.com",
    ],
  },
];

// Not one of the business's numbered clauses: a notice about analytics (admin completion
// Phase 8, 2026-09-28), pending legal review of its wording. The event log paragraph is
// always true. The Clarity paragraphs show only while Clarity actually runs, so the page
// never describes recording that isn't happening (lib/analytics/clarity.ts).
export const TERMS_ANALYTICS_NOTICE = {
  heading: "Analytics and session replay",
  events:
    "Cosora records which products, storefronts and searches are viewed and which buttons are pressed, to show sellers how their listings perform and to run the marketplace. When you're signed in, these records are linked to your account.",
  clarity: [
    "We also use Microsoft Clarity to see how our pages are used. It records clicks, taps and scrolling, and replays visits so we can find and fix problems. Recordings aren't linked to your Cosora account. Microsoft processes this data under its own privacy statement.",
    "Sign-in, chats, onboarding and KYC, your profile, requirements and quotes, billing, and anything in a pop-up are hidden from these recordings, as is everything you type into a field. Hidden content is masked in your browser and never sent.",
    "Clarity sets cookies to recognise a returning browser. The site works the same if you block them.",
  ],
};
