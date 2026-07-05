import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

// Cosora Terms & Conditions (buyer-facing, linked from My Profile).
// Content supplied by the business; rendered as a readable legal document.

interface Clause {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  bulletsIntro?: string;
}

const EFFECTIVE_DATE = "27th October 2025";

const INTRO =
  "Welcome to Cosora, India's premier B2B fashion and textile sourcing platform. By accessing or using our website, mobile application, or any associated services (collectively, the \"Platform\"), you agree to be bound by the following terms and conditions (\"Terms\"). Please read them carefully.";

const CLAUSES: Clause[] = [
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

const TermsConditions = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Terms &amp; Conditions</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <p className="text-xs text-gray-400">Effective Date: {EFFECTIVE_DATE}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{INTRO}</p>

        <div className="mt-6 space-y-6">
          {CLAUSES.map((clause) => (
            <section key={clause.heading}>
              <h2 className="text-sm font-bold text-gray-900">{clause.heading}</h2>
              {clause.paragraphs?.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-gray-700">{p}</p>
              ))}
              {clause.bulletsIntro && <p className="mt-2 text-sm leading-relaxed text-gray-700">{clause.bulletsIntro}</p>}
              {clause.bullets && (
                <ul className="mt-2 space-y-1.5">
                  {clause.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#ef4d62]" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-8 text-sm leading-relaxed text-gray-600 border-t border-gray-100 pt-5">
          By using Cosora, you acknowledge that you have read, understood, and agree to be bound by these Terms &amp; Conditions.
        </p>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default TermsConditions;
