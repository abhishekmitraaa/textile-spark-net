// Global UI language store (English / Hindi).
//
// Approach: a single module-level store (useSyncExternalStore + localStorage)
// shared across the whole app — vendor and buyer. `useT()` returns a translate
// function keyed by the ENGLISH string, so components wrap their existing text
// (`t("New Arrivals")`) with zero key bookkeeping; any string not in the Hindi
// dictionary safely falls back to English. Only the app "chrome" (navigation,
// buttons, headings, labels) is translated — dynamic data (product names, vendor
// descriptions, user/chat text) is intentionally left as entered. JSX-free.

import { useSyncExternalStore } from "react";

export type Lang = "en" | "hi" | "gu";

export const LANG_OPTIONS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिंदी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

const SUPPORTED: Lang[] = ["en", "hi", "gu"];

const KEY = "cosora.lang";

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY) as Lang | null;
    if (v && SUPPORTED.includes(v)) return v;
  } catch { /* ssr / private mode */ }
  return "en";
}

let current: Lang = read();
const listeners = new Set<() => void>();

function applyDocLang(l: Lang) {
  if (typeof document !== "undefined") document.documentElement.lang = l;
}
applyDocLang(current);

export function setLang(l: Lang) {
  if (!SUPPORTED.includes(l)) l = "en";
  if (l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  applyDocLang(l);
  listeners.forEach((fn) => fn());
}

// Map a human language name (from the Login modal / regional select) to a
// supported code. Only English & Hindi are translated today; anything else
// falls back to English so the app stays fully readable.
export function langCodeFromName(name: string): Lang {
  if (/gujarati|ગુજરાતી|ગુજરાતિ/i.test(name)) return "gu";
  if (/hindi|हिंदी|हिन्दी/i.test(name)) return "hi";
  return "en";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => current, () => "en");
}

// ── English → Hindi dictionary (app chrome only) ──
const HI: Record<string, string> = {
  // Bottom nav / sidebar (buyer)
  "Categories": "श्रेणियाँ",
  "Video Close-Ups": "वीडियो क्लोज़-अप",
  "Requirement": "आवश्यकता",
  "Chats": "चैट",
  "My Profile": "मेरी प्रोफ़ाइल",
  "New Arrivals": "नए आगमन",
  "For You": "आपके लिए",
  "Service Vendors": "सेवा विक्रेता",
  "Freelancers": "फ्रीलांसर",
  "Post Requirement": "आवश्यकता पोस्ट करें",
  "Recently Viewed": "हाल में देखा",
  "Cosora Studio": "कोसोरा स्टूडियो",
  "My Quotes": "मेरे कोटेशन",
  "Messages": "संदेश",
  "Trends": "ट्रेंड्स",
  "Sale": "सेल",
  "Followings": "फ़ॉलोइंग",
  // Uppercase home-feed tab strip (NewArrivals / Trends / Sale / ForYou / Following)
  "NEW ARRIVALS": "नए आगमन",
  "TRENDS": "ट्रेंड्स",
  "SALE": "सेल",
  "FOR YOU": "आपके लिए",
  "FOLLOWINGS": "फ़ॉलोइंग",
  "FOLLOWING": "फ़ॉलोइंग",
  "Browse Products": "उत्पाद ब्राउज़ करें",
  "Chats & Calls": "चैट और कॉल",
  "Saved Products": "सहेजे गए उत्पाद",

  // Bottom nav / sidebar (seller)
  "Home": "होम",
  "Products": "उत्पाद",
  "Upload": "अपलोड",
  "My Store": "मेरा स्टोर",
  "Dashboard": "डैशबोर्ड",
  "My Products": "मेरे उत्पाद",
  "Upload Product": "उत्पाद अपलोड करें",
  "Quote Requests": "कोटेशन अनुरोध",
  "Leads": "लीड्स",
  "Advertisements": "विज्ञापन",
  "Analytics": "एनालिटिक्स",
  "Subscription": "सब्सक्रिप्शन",

  // Sidebar chrome
  "Switch Mode": "मोड बदलें",
  "Buyer Menu": "खरीदार मेन्यू",
  "Seller Menu": "विक्रेता मेन्यू",
  "Support": "समर्थन",
  "Settings": "सेटिंग्स",
  "Help & Support": "सहायता और समर्थन",
  "Buyer": "खरीदार",
  "Seller": "विक्रेता",

  // Top bar
  "Search for items or brands": "आइटम या ब्रांड खोजें",
  "Default Currency": "डिफ़ॉल्ट मुद्रा",

  // Common actions
  "Call Now": "अभी कॉल करें",
  "Chat": "चैट",
  "Submit Requirement": "आवश्यकता सबमिट करें",
  "Looking for products?": "उत्पाद खोज रहे हैं?",
  "Get quotes from verified manufacturers": "सत्यापित निर्माताओं से कोटेशन प्राप्त करें",
  "FILTER": "फ़िल्टर",
  "Filter": "फ़िल्टर",
  "Filters": "फ़िल्टर",
  "Refining": "परिष्कृत",
  "SORT": "क्रमबद्ध करें",
  "Sort": "क्रमबद्ध करें",
  "Show": "दिखाएँ",
  "result": "परिणाम",
  "results": "परिणाम",
  "Clear": "साफ़ करें",
  "Clear all": "सभी साफ़ करें",
  "Save": "सहेजें",
  "Cancel": "रद्द करें",
  "Apply": "लागू करें",
  "Search": "खोजें",
  "Language": "भाषा",
  "Follow": "फ़ॉलो करें",
  "Following": "फ़ॉलो कर रहे हैं",

  // Profile page
  "Activity": "गतिविधि",
  "Account Settings": "खाता सेटिंग्स",
  "My Reviews": "मेरी समीक्षाएँ",
  "Reviews written": "लिखी गई समीक्षाएँ",
  "Notifications": "सूचनाएँ",
  "Regional Settings": "क्षेत्रीय सेटिंग्स",
  "Business Details": "व्यवसाय विवरण",
  "Social media links": "सोशल मीडिया लिंक",
  "Help Center": "सहायता केंद्र",
  "Chat with Us": "हमसे चैट करें",
  "Terms & Conditions": "नियम और शर्तें",
  "Privacy Policy": "गोपनीयता नीति",
  "Post Your Requirement": "अपनी आवश्यकता पोस्ट करें",
  "Quotes Received": "प्राप्त कोटेशन",

  // Regional settings page
  "Currency": "मुद्रा",
  "Timezone": "समय क्षेत्र",

  // ── Common actions / buttons ──
  "Save": "सहेजें", "Saved": "सहेजा गया", "Cancel": "रद्द करें", "Submit": "सबमिट करें",
  "Next": "आगे", "Back": "पीछे", "Previous": "पिछला", "Continue": "जारी रखें", "Done": "पूर्ण",
  "Close": "बंद करें", "Confirm": "पुष्टि करें", "Edit": "संपादित करें", "Delete": "हटाएँ",
  "Remove": "हटाएँ", "Add": "जोड़ें", "Apply": "लागू करें", "Retry": "पुनः प्रयास",
  "View All": "सभी देखें", "See All": "सभी देखें", "Show More": "और दिखाएँ", "Show Less": "कम दिखाएँ",
  "Load More": "और लोड करें", "Loading...": "लोड हो रहा है...", "Loading more...": "और लोड हो रहा है...",
  "Scroll for more": "और के लिए स्क्रॉल करें", "Yes": "हाँ", "No": "नहीं", "OK": "ठीक है",
  "Share": "साझा करें", "Copy": "कॉपी करें", "Copied": "कॉपी हो गया", "Send": "भेजें",
  "Skip": "छोड़ें", "Get Started": "शुरू करें", "Update": "अपडेट करें", "Updated": "अपडेट हो गया",

  // ── Auth ──
  "Login": "लॉग इन", "Log in": "लॉग इन", "Log In": "लॉग इन", "Sign In": "साइन इन",
  "Sign Up": "साइन अप", "Register": "रजिस्टर करें", "Log Out": "लॉग आउट", "Logout": "लॉग आउट",
  "Phone Number": "फ़ोन नंबर", "Email": "ईमेल", "Email Address": "ईमेल पता", "Password": "पासवर्ड",
  "Full Name": "पूरा नाम", "Send OTP": "OTP भेजें", "Verify": "सत्यापित करें", "Resend OTP": "OTP पुनः भेजें",
  "Create your account": "अपना खाता बनाएँ", "Create Account": "खाता बनाएँ", "Not You?": "आप नहीं?",
  "Continue as Buyer": "खरीदार के रूप में जारी रखें", "Continue as Seller": "विक्रेता के रूप में जारी रखें",

  // ── Commerce ──
  "Product": "उत्पाद", "Brands": "ब्रांड", "Brand": "ब्रांड", "Vendors": "विक्रेता", "Vendor": "विक्रेता",
  "Price": "मूल्य", "Quantity": "मात्रा", "Rating": "रेटिंग", "Reviews": "समीक्षाएँ", "Review": "समीक्षा",
  "Description": "विवरण", "Details": "विवरण", "Specifications": "विनिर्देश", "Fabric": "कपड़ा",
  "Color": "रंग", "Colour": "रंग", "Size": "आकार", "Material": "सामग्री", "Type": "प्रकार",
  "Buy Now": "अभी खरीदें", "Add to Cart": "कार्ट में जोड़ें", "Enquire": "पूछताछ करें",
  "Get Quote": "कोटेशन प्राप्त करें", "Request Quote": "कोटेशन का अनुरोध करें", "Get Quotes": "कोटेशन प्राप्त करें",
  "In Stock": "स्टॉक में", "Out of Stock": "स्टॉक ख़त्म", "Verified": "सत्यापित",
  "Popular": "लोकप्रिय", "Trending": "ट्रेंडिंग", "Featured": "विशेष रुप से प्रदर्शित",
  "Recommended": "अनुशंसित", "Discount": "छूट", "Sold": "बिके", "Manufacturer": "निर्माता",
  "Location": "स्थान", "sponsored": "प्रायोजित", "Brand Picks": "ब्रांड चयन",
  "Verified vendors only (TrustedSEAL)": "केवल सत्यापित विक्रेता (TrustedSEAL)",

  // ── RFQ / quotes ──
  "Requirements": "आवश्यकताएँ", "Quick RFQ": "त्वरित RFQ", "Quotes": "कोटेशन", "Quote": "कोटेशन",
  "My Previous Quotes": "मेरे पिछले कोटेशन", "Create New Requirement": "नई आवश्यकता बनाएँ",
  "Received": "प्राप्त", "Pending": "लंबित", "Accepted": "स्वीकृत", "Rejected": "अस्वीकृत",
  "Compare": "तुलना करें", "Compare Quotes": "कोटेशन की तुलना करें", "Fast": "तेज़",

  // ── Profile / account ──
  "Profile": "प्रोफ़ाइल", "Edit Profile": "प्रोफ़ाइल संपादित करें", "Account": "खाता",
  "Help": "सहायता", "Wishlist": "इच्छा-सूची", "Followers": "फ़ॉलोअर्स", "Unfollow": "अनफ़ॉलो करें",
  "Message": "संदेश", "Call": "कॉल", "Contact": "संपर्क", "Delete my account": "मेरा खाता हटाएँ",
  "Data & Export": "डेटा और निर्यात", "Regional & Data": "क्षेत्रीय और डेटा",
  "Regional Settings": "क्षेत्रीय सेटिंग्स", "Data Export": "डेटा निर्यात",

  // ── Sections / navigation ──
  "Search": "खोजें", "Explore": "एक्सप्लोर करें", "Discover": "खोजें", "All": "सभी",
  "Sort By": "इसके अनुसार क्रमबद्ध करें", "Apply Filters": "फ़िल्टर लागू करें",
  "Results": "परिणाम", "No results": "कोई परिणाम नहीं", "No results found": "कोई परिणाम नहीं मिला",
  "What's new": "नया क्या है", "Popularity": "लोकप्रियता", "Customer Rating": "ग्राहक रेटिंग",
  "Price - low to high": "मूल्य - कम से अधिक", "Price - high to low": "मूल्य - अधिक से कम",
  "Shop by Category": "श्रेणी के अनुसार खरीदें", "What's on your mind": "आपके मन में क्या है",

  // ── Chat / support ──
  "Type your message...": "अपना संदेश टाइप करें...", "Type your message…": "अपना संदेश टाइप करें…",
  "End chat": "चैट समाप्त करें", "Start Live Chat": "लाइव चैट शुरू करें", "Email Support": "ईमेल सहायता",
  "Request a Callback": "कॉलबैक का अनुरोध करें", "Contact Us": "हमसे संपर्क करें",
  "Follow Us": "हमें फ़ॉलो करें", "Still need help?": "अभी भी मदद चाहिए?",
  "Frequently Asked Questions": "अक्सर पूछे जाने वाले प्रश्न", "Quick Guides": "त्वरित गाइड",

  // ── Profile page extras ──
  "Calls": "कॉल", "CALLS": "कॉल",
  "Interest & Preferences": "रुचि और प्राथमिकताएँ",
  "Set your sourcing interests to personalize recommendations.": "अनुशंसाएँ व्यक्तिगत बनाने के लिए अपनी सोर्सिंग रुचियाँ सेट करें।",
  "Retailer": "रिटेलर", "Designer": "डिज़ाइनर", "Sourcing Manager": "सोर्सिंग मैनेजर",
  "Verified Buyer": "सत्यापित खरीदार", "Help & support": "सहायता और समर्थन",
  "Account & Preferences": "खाता और प्राथमिकताएँ", "Legal": "कानूनी",

  // ── Vendor dashboard ──
  "Total Orders": "कुल ऑर्डर", "Total Revenue": "कुल राजस्व", "Active Leads": "सक्रिय लीड्स",
  "Profile Score": "प्रोफ़ाइल स्कोर", "Recent Activity": "हाल की गतिविधि", "Quick Actions": "त्वरित क्रियाएँ",
  "View Details": "विवरण देखें", "Manage": "प्रबंधित करें", "Active": "सक्रिय", "New": "नया",
};

// ── English → Gujarati dictionary (mirrors the HI keys) ──
const GU: Record<string, string> = {
  // Bottom nav / sidebar (buyer)
  "Categories": "શ્રેણીઓ",
  "Video Close-Ups": "વિડિયો ક્લોઝ-અપ",
  "Requirement": "જરૂરિયાત",
  "Chats": "ચેટ",
  "My Profile": "મારી પ્રોફાઇલ",
  "New Arrivals": "નવા આગમન",
  "For You": "તમારા માટે",
  "Service Vendors": "સેવા વિક્રેતા",
  "Freelancers": "ફ્રીલાન્સર",
  "Post Requirement": "જરૂરિયાત પોસ્ટ કરો",
  "Recently Viewed": "તાજેતરમાં જોયેલું",
  "Cosora Studio": "કોસોરા સ્ટુડિયો",
  "My Quotes": "મારા ક્વોટ્સ",
  "Messages": "સંદેશા",
  "Trends": "ટ્રેન્ડ્સ",
  "Sale": "સેલ",
  "Followings": "ફોલોઇંગ",
  "Browse Products": "ઉત્પાદનો બ્રાઉઝ કરો",
  "Chats & Calls": "ચેટ અને કૉલ્સ",
  "Saved Products": "સાચવેલા ઉત્પાદનો",

  // Bottom nav / sidebar (seller)
  "Home": "હોમ",
  "Products": "ઉત્પાદનો",
  "Upload": "અપલોડ",
  "My Store": "મારો સ્ટોર",
  "Dashboard": "ડેશબોર્ડ",
  "My Products": "મારા ઉત્પાદનો",
  "Upload Product": "ઉત્પાદન અપલોડ કરો",
  "Quote Requests": "ક્વોટ વિનંતીઓ",
  "Leads": "લીડ્સ",
  "Advertisements": "જાહેરાતો",
  "Analytics": "એનાલિટિક્સ",
  "Subscription": "સબ્સ્ક્રિપ્શન",

  // Sidebar chrome
  "Switch Mode": "મોડ બદલો",
  "Buyer Menu": "ખરીદદાર મેનૂ",
  "Seller Menu": "વિક્રેતા મેનૂ",
  "Support": "સપોર્ટ",
  "Settings": "સેટિંગ્સ",
  "Help & Support": "મદદ અને સપોર્ટ",
  "Buyer": "ખરીદદાર",
  "Seller": "વિક્રેતા",

  // Top bar
  "Search for items or brands": "વસ્તુઓ અથવા બ્રાન્ડ શોધો",
  "Default Currency": "ડિફૉલ્ટ ચલણ",

  // Common actions
  "Call Now": "હમણાં કૉલ કરો",
  "Chat": "ચેટ",
  "Submit Requirement": "જરૂરિયાત સબમિટ કરો",
  "Looking for products?": "ઉત્પાદનો શોધી રહ્યા છો?",
  "Get quotes from verified manufacturers": "ચકાસાયેલ ઉત્પાદકો પાસેથી ક્વોટ્સ મેળવો",
  "FILTER": "ફિલ્ટર",
  "Filter": "ફિલ્ટર",
  "Filters": "ફિલ્ટર",
  "Refining": "શુદ્ધ કરી રહ્યા છીએ",
  "SORT": "ક્રમમાં ગોઠવો",
  "Sort": "ક્રમમાં ગોઠવો",
  "Show": "બતાવો",
  "result": "પરિણામ",
  "results": "પરિણામો",
  "Clear": "સાફ કરો",
  "Clear all": "બધું સાફ કરો",
  "Save": "સાચવો",
  "Cancel": "રદ કરો",
  "Apply": "લાગુ કરો",
  "Search": "શોધો",
  "Language": "ભાષા",
  "Follow": "ફોલો કરો",
  "Following": "ફોલો કરી રહ્યાં છો",

  // Profile page
  "Activity": "પ્રવૃત્તિ",
  "Account Settings": "ખાતા સેટિંગ્સ",
  "My Reviews": "મારી સમીક્ષાઓ",
  "Reviews written": "લખેલી સમીક્ષાઓ",
  "Notifications": "સૂચનાઓ",
  "Regional Settings": "પ્રાદેશિક સેટિંગ્સ",
  "Business Details": "વ્યવસાય વિગતો",
  "Social media links": "સોશિયલ મીડિયા લિંક્સ",
  "Help Center": "મદદ કેન્દ્ર",
  "Chat with Us": "અમારી સાથે ચેટ કરો",
  "Terms & Conditions": "નિયમો અને શરતો",
  "Privacy Policy": "ગોપનીયતા નીતિ",
  "Post Your Requirement": "તમારી જરૂરિયાત પોસ્ટ કરો",
  "Quotes Received": "પ્રાપ્ત ક્વોટ્સ",

  // Regional settings page
  "Currency": "ચલણ",
  "Timezone": "સમય ક્ષેત્ર",

  // Common actions / buttons
  "Saved": "સાચવ્યું", "Submit": "સબમિટ કરો",
  "Next": "આગળ", "Back": "પાછળ", "Previous": "પાછલું", "Continue": "ચાલુ રાખો", "Done": "થઈ ગયું",
  "Close": "બંધ કરો", "Confirm": "પુષ્ટિ કરો", "Edit": "સંપાદિત કરો", "Delete": "કાઢી નાખો",
  "Remove": "દૂર કરો", "Add": "ઉમેરો", "Retry": "ફરી પ્રયાસ કરો",
  "View All": "બધું જુઓ", "See All": "બધું જુઓ", "Show More": "વધુ બતાવો", "Show Less": "ઓછું બતાવો",
  "Load More": "વધુ લોડ કરો", "Loading...": "લોડ થઈ રહ્યું છે...", "Loading more...": "વધુ લોડ થઈ રહ્યું છે...",
  "Scroll for more": "વધુ માટે સ્ક્રોલ કરો", "Yes": "હા", "No": "ના", "OK": "બરાબર",
  "Share": "શેર કરો", "Copy": "કૉપિ કરો", "Copied": "કૉપિ થયું", "Send": "મોકલો",
  "Skip": "છોડો", "Get Started": "શરૂ કરો", "Update": "અપડેટ કરો", "Updated": "અપડેટ થયું",

  // Auth
  "Login": "લૉગ ઇન", "Log in": "લૉગ ઇન", "Log In": "લૉગ ઇન", "Sign In": "સાઇન ઇન",
  "Sign Up": "સાઇન અપ", "Register": "રજિસ્ટર કરો", "Log Out": "લૉગ આઉટ", "Logout": "લૉગ આઉટ",
  "Phone Number": "ફોન નંબર", "Email": "ઇમેઇલ", "Email Address": "ઇમેઇલ સરનામું", "Password": "પાસવર્ડ",
  "Full Name": "પૂરું નામ", "Send OTP": "OTP મોકલો", "Verify": "ચકાસો", "Resend OTP": "OTP ફરી મોકલો",
  "Create your account": "તમારું ખાતું બનાવો", "Create Account": "ખાતું બનાવો", "Not You?": "તમે નથી?",
  "Continue as Buyer": "ખરીદદાર તરીકે ચાલુ રાખો", "Continue as Seller": "વિક્રેતા તરીકે ચાલુ રાખો",

  // Commerce
  "Product": "ઉત્પાદન", "Brands": "બ્રાન્ડ્સ", "Brand": "બ્રાન્ડ", "Vendors": "વિક્રેતાઓ", "Vendor": "વિક્રેતા",
  "Price": "કિંમત", "Quantity": "જથ્થો", "Rating": "રેટિંગ", "Reviews": "સમીક્ષાઓ", "Review": "સમીક્ષા",
  "Description": "વર્ણન", "Details": "વિગતો", "Specifications": "સ્પષ્ટીકરણો", "Fabric": "કાપડ",
  "Color": "રંગ", "Colour": "રંગ", "Size": "સાઇઝ", "Material": "સામગ્રી", "Type": "પ્રકાર",
  "Buy Now": "હમણાં ખરીદો", "Add to Cart": "કાર્ટમાં ઉમેરો", "Enquire": "પૂછપરછ કરો",
  "Get Quote": "ક્વોટ મેળવો", "Request Quote": "ક્વોટની વિનંતી કરો", "Get Quotes": "ક્વોટ્સ મેળવો",
  "In Stock": "સ્ટોકમાં", "Out of Stock": "સ્ટોક ખતમ", "Verified": "ચકાસાયેલ",
  "Popular": "લોકપ્રિય", "Trending": "ટ્રેન્ડિંગ", "Featured": "વિશેષ",
  "Recommended": "ભલામણ કરેલ", "Discount": "ડિસ્કાઉન્ટ", "Sold": "વેચાયું", "Manufacturer": "ઉત્પાદક",
  "Location": "સ્થાન", "sponsored": "પ્રાયોજિત", "Brand Picks": "બ્રાન્ડ પસંદગી",
  "Verified vendors only (TrustedSEAL)": "ફક્ત ચકાસાયેલ વિક્રેતા (TrustedSEAL)",

  // RFQ / quotes
  "Requirements": "જરૂરિયાતો", "Quick RFQ": "ઝડપી RFQ", "Quotes": "ક્વોટ્સ", "Quote": "ક્વોટ",
  "My Previous Quotes": "મારા અગાઉના ક્વોટ્સ", "Create New Requirement": "નવી જરૂરિયાત બનાવો",
  "Received": "પ્રાપ્ત", "Pending": "બાકી", "Accepted": "સ્વીકૃત", "Rejected": "નકારેલ",
  "Compare": "સરખાવો", "Compare Quotes": "ક્વોટ્સ સરખાવો", "Fast": "ઝડપી",

  // Profile / account
  "Profile": "પ્રોફાઇલ", "Edit Profile": "પ્રોફાઇલ સંપાદિત કરો", "Account": "ખાતું",
  "Help": "મદદ", "Wishlist": "વિશલિસ્ટ", "Followers": "ફોલોઅર્સ", "Unfollow": "અનફોલો કરો",
  "Message": "સંદેશ", "Call": "કૉલ", "Contact": "સંપર્ક", "Delete my account": "મારું ખાતું કાઢી નાખો",
  "Data & Export": "ડેટા અને નિકાસ", "Regional & Data": "પ્રાદેશિક અને ડેટા",
  "Data Export": "ડેટા નિકાસ",

  // Sections / navigation
  "Explore": "એક્સપ્લોર કરો", "Discover": "શોધો", "All": "બધું",
  "Sort By": "આ પ્રમાણે ગોઠવો", "Apply Filters": "ફિલ્ટર લાગુ કરો",
  "Results": "પરિણામો", "No results": "કોઈ પરિણામ નથી", "No results found": "કોઈ પરિણામ મળ્યું નથી",
  "What's new": "નવું શું છે", "Popularity": "લોકપ્રિયતા", "Customer Rating": "ગ્રાહક રેટિંગ",
  "Price - low to high": "કિંમત - ઓછીથી વધુ", "Price - high to low": "કિંમત - વધુથી ઓછી",
  "Shop by Category": "શ્રેણી પ્રમાણે ખરીદો", "What's on your mind": "તમારા મનમાં શું છે",

  // Chat / support
  "Type your message...": "તમારો સંદેશ ટાઇપ કરો...", "Type your message…": "તમારો સંદેશ ટાઇપ કરો…",
  "End chat": "ચેટ સમાપ્ત કરો", "Start Live Chat": "લાઇવ ચેટ શરૂ કરો", "Email Support": "ઇમેઇલ સપોર્ટ",
  "Request a Callback": "કૉલબૅકની વિનંતી કરો", "Contact Us": "અમારો સંપર્ક કરો",
  "Follow Us": "અમને ફોલો કરો", "Still need help?": "હજુ મદદ જોઈએ છે?",
  "Frequently Asked Questions": "વારંવાર પૂછાતા પ્રશ્નો", "Quick Guides": "ઝડપી માર્ગદર્શિકા",

  // Profile page extras
  "Calls": "કૉલ્સ", "CALLS": "કૉલ્સ",
  "Interest & Preferences": "રુચિ અને પસંદગીઓ",
  "Set your sourcing interests to personalize recommendations.": "ભલામણોને વ્યક્તિગત બનાવવા માટે તમારી સોર્સિંગ રુચિઓ સેટ કરો.",
  "Retailer": "રિટેલર", "Designer": "ડિઝાઇનર", "Sourcing Manager": "સોર્સિંગ મેનેજર",
  "Verified Buyer": "ચકાસાયેલ ખરીદદાર", "Help & support": "મદદ અને સપોર્ટ",
  "Account & Preferences": "ખાતું અને પસંદગીઓ", "Legal": "કાનૂની",

  // Vendor dashboard
  "Total Orders": "કુલ ઓર્ડર્સ", "Total Revenue": "કુલ આવક", "Active Leads": "સક્રિય લીડ્સ",
  "Profile Score": "પ્રોફાઇલ સ્કોર", "Recent Activity": "તાજેતરની પ્રવૃત્તિ", "Quick Actions": "ઝડપી ક્રિયાઓ",
  "View Details": "વિગતો જુઓ", "Manage": "સંચાલિત કરો", "Active": "સક્રિય", "New": "નવું",

  // Uppercase home-feed tab strip
  "NEW ARRIVALS": "નવા આગમન", "TRENDS": "ટ્રેન્ડ્સ", "SALE": "સેલ",
  "FOR YOU": "તમારા માટે", "FOLLOWINGS": "ફોલોઇંગ", "FOLLOWING": "ફોલોઇંગ",
};

// Non-English dictionaries by code.
const DICTS: Record<Exclude<Lang, "en">, Record<string, string>> = { hi: HI, gu: GU };

export function translate(lang: Lang, en: string): string {
  if (lang === "en") return en;
  return DICTS[lang]?.[en] ?? en;
}

// Direct dictionary lookup used by the global DOM auto-translator.
// Returns undefined for English or when no translation exists.
export function lookup(lang: Lang, en: string): string | undefined {
  if (lang === "en") return undefined;
  return DICTS[lang]?.[en];
}

// Hook: returns a translate function bound to the current language. Subscribing
// via useLang() re-renders the component whenever the language changes.
export function useT(): (en: string) => string {
  const lang = useLang();
  return (en: string) => translate(lang, en);
}
