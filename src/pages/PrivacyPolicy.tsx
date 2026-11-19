
import { ArrowLeft } from "lucide-react";
import { SUPPORT_PHONE_LABEL } from "@/lib/supportContact";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { CLARITY_ENABLED } from "@/lib/analytics/clarity";
import { useStepBack } from "@/hooks/useStepBack";
import { useHomePath } from "@/hooks/useHomePath";

// Cosora Privacy Policy (2026-11-05; ToDo "Add a Privacy Policy page", 2026-10-01).
// Mitra, 2026-11-05: "Draft and publish now" — drafted from what the app actually collects and
// keeps (documentation/claude.md, help-feature-plan.md D-16, the account-deletion rules), live
// before counsel's review. Every statement must stay true of the code: when a feature changes
// what is collected, kept or shared, change this page in the same commit. The Clarity section
// shows only while Clarity runs, as on the Terms page.

interface Section {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  bulletsIntro?: string;
}

const LAST_UPDATED = "5 November 2026";

const INTRO =
  "This policy explains what Cosora collects when you use our website and app, why, who else handles it, how long we keep it, and what you can ask us to do with it. It covers buyers, sellers and visitors.";

const SECTIONS: Section[] = [
  {
    heading: "1. What we collect",
    bulletsIntro: "Only what you give us or what using Cosora creates:",
    bullets: [
      "Your account: your mobile number (we sign you in with a one-time code), your name, and an email address if you add one.",
      "Your profile: your city and state, your business name, type and address, your photo, and, for sellers, a logo, store banner, office photos and social links.",
      "Seller registration: the documents you upload to verify your business (PAN, GST, a business registration such as Udyam or CIN, and an Aadhaar card with all but the last four digits masked, which we ask your consent for), and your acceptance of the Supplier Agreement.",
      "What you post: listings with their photos, videos and documents, requirements with their photos and details, quotes, reviews and reports.",
      "Your messages: chats with buyers and sellers, including photos, PDFs, voice notes and contact cards you send.",
      "Your location, only if you allow it when you sign up: we use it once to fill in your city and state.",
      "Payments: the plan or ad you bought, the amount and your GST number for the invoice. Card and bank details go to our payment provider, never to us.",
    ],
  },
  {
    heading: "2. Support chats, calls and reports",
    paragraphs: [
      "When you contact Cosora support we keep the conversation and anything you attach (photos, voice notes, PDFs), and the number you give us if you ask for a call back.",
      "A fraud report is kept, with its evidence, for one year. If we decide a report was fraud, we keep a lasting record of who was involved, what they did and the action we took, so the same person can't simply start again.",
      "App feedback you send is kept so we can act on it.",
    ],
  },
  {
    heading: "3. How we use it",
    bullets: [
      "To run the marketplace: show listings and stores, deliver requirements to sellers, and let buyers and sellers quote and talk.",
      "To match requirements and listings, including by state, category and the details you give, and to rank what you see.",
      "To review listings, requirements, videos and ads before others see them, and to keep the platform safe from fraud and abuse.",
      "To send you the notices you need: codes, reviews of what you posted, quotes and leads, invoices and plan reminders.",
      "To show sellers how their listings perform, as counts of views and enquiries.",
    ],
  },
  {
    heading: "4. What other people see",
    bullets: [
      "A seller's store, listings, videos, reviews and business details are public.",
      "A buyer's requirement, without your phone number, is shown to sellers once Cosora approves it. Sellers you quote with or chat with see your name.",
      "Your phone number is shared with the other person only when you choose to call or share it.",
      "We never sell your personal data.",
    ],
  },
  {
    heading: "5. Who handles it for us",
    bulletsIntro: "We use service providers who process data only to provide their service to Cosora:",
    bullets: [
      "Supabase, which hosts our database, files and sign-in.",
      "Vercel, which serves our website.",
      "Razorpay, which takes payments.",
      "OpenAI, which turns the text of listings and requirements, and photos you search with, into data we use to match them. It doesn't receive your name or contact details.",
      "Bunny, which can host videos.",
      "BigDataCloud, which turns your location into a city and state, if you allow it.",
      "Email and WhatsApp providers, when we send you a code or a notice.",
    ],
  },
  {
    heading: "6. Analytics",
    paragraphs: [
      "We record which products, stores and searches are viewed and which buttons are pressed, to run the marketplace and to show sellers how their listings perform. When you're signed in, these records are linked to your account.",
    ],
  },
  {
    heading: "7. Cookies and storage",
    paragraphs: [
      "We keep your sign-in, language and a few preferences in your browser's storage so you stay signed in and the site remembers your choices. Clearing your browser's storage signs you out.",
    ],
  },
  {
    heading: "8. How long we keep it",
    bullets: [
      "Your account and what you post, while your account is open.",
      "Invoices and payment records, as long as tax law requires.",
      "Fraud reports for one year, and a confirmed fraud record for as long as it is needed to protect the platform.",
    ],
  },
  {
    heading: "9. Deleting your account",
    paragraphs: [
      `A buyer can ask to delete their account from Profile › Help. It is confirmed with a code sent to your email or WhatsApp; sending that code isn't set up yet, so until it is, call Cosora Support on ${SUPPORT_PHONE_LABEL} to ask. We then wait 14 days in case you change your mind, and remove your name, contact details and photo, your saved items, followed and saved sellers and notifications, and your support messages and files. Requirements, messages and reviews other people took part in stay, without your name on them.`,
      "Sellers and anyone with an open matter should contact support to close their account.",
    ],
  },
  {
    heading: "10. Your choices",
    bullets: [
      "See and correct your details in your profile at any time.",
      "Turn notifications and WhatsApp messages on or off in your settings.",
      "Refuse location access; you can type your city and state instead.",
      "Ask us what we hold about you, or to correct or delete it, by writing to us.",
    ],
  },
  {
    heading: "11. Security",
    paragraphs: [
      "Data travels encrypted, each account can reach only its own private data, and verification documents are readable only by you and the Cosora staff who review them. No system is perfectly secure; if something goes wrong that affects you, we will tell you.",
    ],
  },
  {
    heading: "12. Changes and contact",
    paragraphs: [
      "When this policy changes we update the date above, and we tell you in the app if the change is significant.",
      "Questions or requests about your data: write to hello@cosora.in.",
    ],
  },
];

// Microsoft Clarity's paragraphs, shown only while it runs (lib/analytics/clarity.ts).
const CLARITY_SECTION: Section = {
  heading: "Session replay",
  paragraphs: [
    "We also use Microsoft Clarity to see how our pages are used. It records clicks, taps and scrolling, and replays visits so we can find and fix problems. Recordings aren't linked to your Cosora account, and sign-in, chats, profiles, requirements, quotes, billing and everything you type are hidden from them. Microsoft processes this data under its own privacy statement.",
  ],
};

const PrivacyPolicy = () => {
  const homePath = useHomePath();
  const goBack = useStepBack(homePath);
  const sections = CLARITY_ENABLED ? [...SECTIONS.slice(0, 6), CLARITY_SECTION, ...SECTIONS.slice(6)] : SECTIONS;

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-28">
        <p className="text-xs text-gray-400">Last updated: {LAST_UPDATED}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{INTRO}</p>

        <div className="mt-6 space-y-6">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-sm font-bold text-gray-900">{section.heading}</h2>
              {section.paragraphs?.map((p, i) => (
                <p key={i} className="mt-2 text-sm leading-relaxed text-gray-700">{p}</p>
              ))}
              {section.bulletsIntro && <p className="mt-2 text-sm leading-relaxed text-gray-700">{section.bulletsIntro}</p>}
              {section.bullets && (
                <ul className="mt-2 space-y-1.5">
                  {section.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-buyer" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default PrivacyPolicy;
