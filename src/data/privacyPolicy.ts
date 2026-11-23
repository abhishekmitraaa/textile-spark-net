import { COMPANY } from "@/lib/company";
import { GRIEVANCE_OFFICER } from "@/lib/grievance";
import { SUPPORT_PHONE_LABEL } from "@/lib/supportContact";

// Cosora Privacy Policy: the one copy of the text, rendered by /privacy (PrivacyPolicy.tsx).
//
// First drafted 2026-11-05 ("Draft and publish now", Mitra) from what the app collects and keeps; rewritten
// 2026-11-24 to name the company and to say how Cosora contacts people (documentation/company-disclosure-plan-2026-11-24.md).
// Every statement must stay true of the code: when a feature changes what is collected, kept, sent or shared, change
// this text in the same commit. Values Mitra hasn't given yet are written "[PLACEHOLDER: …]" and highlighted on the page.
//
// A legal record, shown in English in every language (data-no-translate), like the Supplier Agreement.

export interface PolicySection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bulletsIntro?: string;
  bullets?: string[];
  after?: string[];
  links?: { label: string; href: string; external?: boolean }[];
}

export const PRIVACY_LAST_UPDATED = "24 November 2026";

export const PRIVACY_INTRO =
  "This policy explains what Cosora collects when you use our website and app, why, who else handles it, how we contact you, how long we keep it, and what you can ask us to do with it. It covers buyers, sellers and visitors. We've written it in plain English; if anything is unclear, ask us.";

const officer = GRIEVANCE_OFFICER;

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    id: "who-we-are",
    heading: "1. Who we are",
    paragraphs: [
      `Cosora is a brand of ${COMPANY.legalName}, a company registered in India (CIN ${COMPANY.cin}). ${COMPANY.legalName} owns and operates the Cosora website (cosora.in) and app, and decides how your personal data is used. In this policy, "Cosora", "we" and "us" mean ${COMPANY.legalName}.`,
      `Registered office: ${COMPANY.registeredAddress}.`,
      `Email: ${COMPANY.email} · Phone and WhatsApp: ${COMPANY.phoneLabel}.`,
    ],
  },
  {
    id: "what-we-collect",
    heading: "2. What we collect",
    bulletsIntro: "Only what you give us, or what using Cosora creates:",
    bullets: [
      "Your name, your mobile number (we sign you in with a one-time code sent to it) and, if you add one, your email address.",
      "Your profile and business address: your city and state, your business name, type and address, your photo, and, for sellers, a logo, store banner, office photos and social links.",
      "Order details: the requirements you post, the quotes you send or receive and the ones you accept, and the plans, ads and certificates you buy from us.",
      "Messages: your chats with buyers and sellers (including photos, PDFs, voice notes and contact cards you send), and the messages you send us on WhatsApp or by email.",
      "Seller registration: the documents you upload to verify your business (PAN, GST, a business registration such as Udyam or CIN, and an Aadhaar card with all but the last four digits masked, which we ask your consent for), and your acceptance of the Supplier Agreement.",
      "What you post: listings with their photos, videos and documents, requirements with their photos and details, quotes, reviews and reports.",
      "Your location, only if you allow it when you sign up: we use it once to fill in your city and state.",
      "Payments: the plan or ad you bought, the amount and your GST number for the invoice. Card and bank details go to our payment partner, never to us.",
      "Your marketing choices: whether you said yes to offers on WhatsApp or by email, and when and where you said it.",
    ],
  },
  {
    id: "support",
    heading: "3. Support chats, calls and reports",
    paragraphs: [
      "When you contact Cosora support we keep the conversation and anything you attach (photos, voice notes, PDFs), and the number you give us if you ask for a call back.",
      "A fraud report is kept, with its evidence, for one year. If we decide a report was fraud, we keep a lasting record of who was involved, what they did and the action we took, so the same person can't simply start again.",
      "App feedback you send is kept so we can act on it.",
    ],
  },
  {
    id: "how-we-use-it",
    heading: "4. How we use it",
    paragraphs: ["We use your data to run Cosora, and to contact you in two different ways."],
    bulletsIntro: "Service and transactional messages. These are part of providing Cosora, so you get them whether or not you've said yes to offers:",
    bullets: [
      "One-time codes (OTP) to sign in, and to confirm important actions such as deleting your account.",
      "Updates on your requirements, quotes and leads.",
      "Payment receipts and invoices for plans, ads and certificates, and reminders before a plan ends.",
      "Account and security alerts, such as the outcome of a review of something you posted, or a change to your account.",
    ],
    after: [
      "We send these by WhatsApp and/or email, and sign-in codes by SMS or WhatsApp. Cosora doesn't sell or ship goods itself, so we don't send shipping or delivery updates: buyers and sellers arrange delivery between themselves.",
      "Marketing messages. Offers, promotions and news about new products and features, by WhatsApp and/or email. We send these only to people who have opted in, by ticking a box when they sign up or pay, or by switching offers on in their settings. The boxes are never ticked for you, and saying no changes nothing else on Cosora.",
      "We also use your data to run the marketplace: to show listings and stores, deliver requirements to sellers and let buyers and sellers quote and talk; to match requirements and listings by state, category and the details you give, and to rank what you see; to review listings, requirements, videos and ads before others see them and keep the platform safe from fraud and abuse; and to show sellers how their listings perform, as counts of views and enquiries.",
    ],
  },
  {
    id: "otp",
    heading: "5. One-time codes",
    paragraphs: [
      "We use one-time codes only to check that it's really you. A code expires within minutes, and we never use a code, or the fact that we sent you one, for marketing.",
    ],
  },
  {
    id: "whatsapp",
    heading: "6. WhatsApp",
    paragraphs: [
      "We send WhatsApp messages through the WhatsApp Business Platform, provided by Meta. To deliver them, Meta processes your phone number and the messages we exchange with you. Meta handles that data under its own terms and WhatsApp's privacy policy.",
    ],
    links: [{ label: "WhatsApp Privacy Policy", href: "https://www.whatsapp.com/legal/privacy-policy", external: true }],
  },
  {
    id: "what-others-see",
    heading: "7. What other people see",
    bullets: [
      "A seller's store, listings, videos, reviews and business details are public.",
      "A buyer's requirement, without your phone number, is shown to sellers once Cosora approves it. Sellers you quote with or chat with see your name.",
      "Your phone number is shared with the other person only when you choose to call or share it.",
    ],
  },
  {
    id: "sharing",
    heading: "8. Who we share it with",
    bulletsIntro: "We share personal data only with service providers that help us run Cosora, and only what each one needs to do its job:",
    bullets: [
      "Meta, for WhatsApp messages (the WhatsApp Business Platform).",
      "Resend, which sends our emails.",
      "An SMS provider, which delivers sign-in codes by text message.",
      "Supabase, which hosts our database, files and sign-in, and Vercel, which hosts our website.",
      "Razorpay, our payment partner, which takes payments.",
      "OpenAI, which turns the text of listings and requirements, and photos you search with, into data we use to match them. It doesn't receive your name or contact details.",
      "Bunny, which can host videos.",
      "BigDataCloud, which turns your location into a city and state, if you allow it.",
    ],
    after: ["We do not sell personal data."],
  },
  {
    id: "analytics",
    heading: "9. Analytics",
    paragraphs: [
      "We record which products, stores and searches are viewed and which buttons are pressed, to run the marketplace and to show sellers how their listings perform. When you're signed in, these records are linked to your account.",
    ],
  },
  {
    id: "cookies",
    heading: "10. Cookies and storage",
    paragraphs: [
      "We keep your sign-in, language and a few preferences in your browser's storage so you stay signed in and the site remembers your choices. Clearing your browser's storage signs you out.",
    ],
  },
  {
    id: "opting-out",
    heading: "11. Opting out of marketing",
    bulletsIntro: "You can stop marketing messages at any time:",
    bullets: [
      "WhatsApp: reply STOP, or tap the \"Stop promotions\" button in the message.",
      "Email: click the unsubscribe link in any marketing email.",
      "In the app: switch offers off in Profile › Notifications, or in Settings if you're a seller.",
      `Or contact support at ${COMPANY.email} or ${COMPANY.phoneLabel}.`,
    ],
    after: [
      "Opting out of marketing doesn't stop the messages you need to use Cosora, such as sign-in codes, updates on your requirements and quotes, receipts and security alerts.",
    ],
  },
  {
    id: "storage-security",
    heading: "12. Where we store it, and how we protect it",
    paragraphs: [
      "Your data is stored on secure cloud servers run by our hosting and database providers. These may be in India or in other countries.",
      "Access is restricted to the people and systems that need it, data travels encrypted, and we encrypt stored data where appropriate. Each account can reach only its own private data, and verification documents are readable only by you and the Cosora staff who review them. No system is perfectly secure; if something goes wrong that affects you, we will tell you.",
    ],
  },
  {
    id: "retention",
    heading: "13. How long we keep it",
    bullets: [
      "What you post: while your account is open.",
      "Account and order data (your account, requirements, quotes, purchases, invoices and payment records): for [PLACEHOLDER: X years / as required by tax and accounting law].",
      "Message logs (records of the WhatsApp, SMS and email messages we send you): for [PLACEHOLDER: X months].",
      "Fraud reports for one year, and a confirmed fraud record for as long as it is needed to protect the platform.",
      "A record of each marketing choice you make, so we can show what you agreed to and when. When your account is deleted, the phone number or email in it is removed.",
    ],
    after: ["After that we delete your data or anonymise it, so it no longer identifies you."],
  },
  {
    id: "deleting",
    heading: "14. Deleting your account",
    paragraphs: [
      `A buyer can ask to delete their account from Profile › Help. It is confirmed with a code sent to your email or WhatsApp; sending that code isn't set up yet, so until it is, call Cosora Support on ${SUPPORT_PHONE_LABEL} to ask. We then wait 14 days in case you change your mind, and remove your name, contact details and photo, your saved items, followed and saved sellers, notifications and marketing choices, and your support messages and files. Requirements, messages and reviews other people took part in stay, without your name on them.`,
      "Sellers and anyone with an open matter should contact support to close their account.",
    ],
  },
  {
    id: "your-rights",
    heading: "15. Your rights",
    bulletsIntro: "Under India's Digital Personal Data Protection Act, 2023, you can ask us to:",
    bullets: [
      "tell you what personal data we hold about you and how we use it;",
      "correct it, complete it or bring it up to date;",
      "delete it;",
      "withdraw a consent you've given, such as to marketing (this doesn't undo what we did before you withdrew it);",
      "accept someone you nominate to exercise these rights for you if you die or can't do so yourself.",
    ],
    after: [
      officer
        ? `To make a request, email our Grievance Officer at ${officer.email} from the email address on your account, or give the mobile number you sign in with, and say what you'd like us to do. We may ask you to confirm it's you before we act.`
        : `To make a request, write to ${COMPANY.email}.`,
      "You can also see and correct most of your details yourself in your profile, switch offers on or off in your settings, and refuse location access (you can type your city and state instead).",
    ],
  },
  ...(officer
    ? [
        {
          id: "grievance",
          heading: "16. Grievance Officer",
          paragraphs: [
            `${officer.name}, ${officer.designation}`,
            `Email: ${officer.email} · Phone: ${officer.phoneLabel}`,
            `Address: ${officer.address ?? COMPANY.registeredAddress}`,
            `We acknowledge every complaint within ${officer.acknowledgeWithin} and resolve it within ${officer.resolveWithin}.`,
          ],
          links: [{ label: "How to raise a grievance", href: "/grievance" }],
        },
      ]
    : []),
  {
    id: "changes",
    heading: officer ? "17. Changes to this policy" : "16. Changes to this policy",
    paragraphs: [
      "When this policy changes we update the \"Last updated\" date at the top, and we tell you in the app if the change is significant.",
      `Questions about this policy: ${COMPANY.email} or ${COMPANY.phoneLabel}.`,
    ],
  },
];

// Microsoft Clarity's paragraph, shown only while it runs (lib/analytics/clarity.ts), after Analytics.
export const PRIVACY_CLARITY_SECTION: PolicySection = {
  id: "session-replay",
  heading: "Session replay",
  paragraphs: [
    "We also use Microsoft Clarity to see how our pages are used. It records clicks, taps and scrolling, and replays visits so we can find and fix problems. Recordings aren't linked to your Cosora account, and sign-in, chats, profiles, requirements, quotes, billing and everything you type are hidden from them. Microsoft processes this data under its own privacy statement.",
  ],
};
