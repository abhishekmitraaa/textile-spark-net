// India's 36 states and union territories: the one list behind every state picker and
// behind `public.india_states` (Ranking Part 1, F2). The migration's seed rows are
// generated from this file, so the two can't drift; change a name here and in a new
// migration together.
//
// `code` is ISO 3166-2:IN without the "IN-" prefix. `aliases` are older or common
// spellings that `state_code_for()` also accepts (it ignores case, punctuation and
// "&" vs "and").

export interface IndiaState {
  code: string;
  name: string;
  hi: string;
  gu: string;
  aliases?: string[];
}

export const INDIA_STATES: readonly IndiaState[] = [
  { code: "AN", name: "Andaman and Nicobar Islands", hi: "अंडमान और निकोबार द्वीपसमूह", gu: "આંદામાન અને નિકોબાર ટાપુઓ", aliases: ["Andaman", "Andaman Nicobar"] },
  { code: "AP", name: "Andhra Pradesh", hi: "आंध्र प्रदेश", gu: "આંધ્ર પ્રદેશ" },
  { code: "AR", name: "Arunachal Pradesh", hi: "अरुणाचल प्रदेश", gu: "અરુણાચલ પ્રદેશ" },
  { code: "AS", name: "Assam", hi: "असम", gu: "આસામ" },
  { code: "BR", name: "Bihar", hi: "बिहार", gu: "બિહાર" },
  { code: "CH", name: "Chandigarh", hi: "चंडीगढ़", gu: "ચંડીગઢ" },
  { code: "CT", name: "Chhattisgarh", hi: "छत्तीसगढ़", gu: "છત્તીસગઢ", aliases: ["Chattisgarh", "Chhatisgarh"] },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", hi: "दादरा और नगर हवेली और दमन और दीव", gu: "દાદરા અને નગર હવેલી અને દમણ અને દીવ", aliases: ["Dadra and Nagar Haveli", "Daman and Diu"] },
  { code: "DL", name: "Delhi", hi: "दिल्ली", gu: "દિલ્હી", aliases: ["New Delhi", "NCT of Delhi", "National Capital Territory of Delhi"] },
  { code: "GA", name: "Goa", hi: "गोवा", gu: "ગોવા" },
  { code: "GJ", name: "Gujarat", hi: "गुजरात", gu: "ગુજરાત", aliases: ["Gujrat"] },
  { code: "HR", name: "Haryana", hi: "हरियाणा", gu: "હરિયાણા" },
  { code: "HP", name: "Himachal Pradesh", hi: "हिमाचल प्रदेश", gu: "હિમાચલ પ્રદેશ" },
  { code: "JK", name: "Jammu and Kashmir", hi: "जम्मू और कश्मीर", gu: "જમ્મુ અને કાશ્મીર", aliases: ["J and K", "JnK"] },
  { code: "JH", name: "Jharkhand", hi: "झारखंड", gu: "ઝારખંડ" },
  { code: "KA", name: "Karnataka", hi: "कर्नाटक", gu: "કર્ણાટક" },
  { code: "KL", name: "Kerala", hi: "केरल", gu: "કેરળ" },
  { code: "LA", name: "Ladakh", hi: "लद्दाख", gu: "લદ્દાખ" },
  { code: "LD", name: "Lakshadweep", hi: "लक्षद्वीप", gu: "લક્ષદ્વીપ" },
  { code: "MP", name: "Madhya Pradesh", hi: "मध्य प्रदेश", gu: "મધ્ય પ્રદેશ" },
  { code: "MH", name: "Maharashtra", hi: "महाराष्ट्र", gu: "મહારાષ્ટ્ર" },
  { code: "MN", name: "Manipur", hi: "मणिपुर", gu: "મણિપુર" },
  { code: "ML", name: "Meghalaya", hi: "मेघालय", gu: "મેઘાલય" },
  { code: "MZ", name: "Mizoram", hi: "मिज़ोरम", gu: "મિઝોરમ" },
  { code: "NL", name: "Nagaland", hi: "नागालैंड", gu: "નાગાલેન્ડ" },
  { code: "OR", name: "Odisha", hi: "ओडिशा", gu: "ઓડિશા", aliases: ["Orissa"] },
  { code: "PY", name: "Puducherry", hi: "पुडुचेरी", gu: "પુડુચેરી", aliases: ["Pondicherry"] },
  { code: "PB", name: "Punjab", hi: "पंजाब", gu: "પંજાબ" },
  { code: "RJ", name: "Rajasthan", hi: "राजस्थान", gu: "રાજસ્થાન" },
  { code: "SK", name: "Sikkim", hi: "सिक्किम", gu: "સિક્કિમ" },
  { code: "TN", name: "Tamil Nadu", hi: "तमिलनाडु", gu: "તમિલનાડુ", aliases: ["Tamilnadu"] },
  { code: "TG", name: "Telangana", hi: "तेलंगाना", gu: "તેલંગાણા", aliases: ["Telengana"] },
  { code: "TR", name: "Tripura", hi: "त्रिपुरा", gu: "ત્રિપુરા" },
  { code: "UP", name: "Uttar Pradesh", hi: "उत्तर प्रदेश", gu: "ઉત્તર પ્રદેશ" },
  { code: "UT", name: "Uttarakhand", hi: "उत्तराखंड", gu: "ઉત્તરાખંડ", aliases: ["Uttaranchal"] },
  { code: "WB", name: "West Bengal", hi: "पश्चिम बंगाल", gu: "પશ્ચિમ બંગાળ" },
];

/** The state with this code, or undefined. */
export function stateByCode(code: string | null | undefined): IndiaState | undefined {
  return code ? INDIA_STATES.find((s) => s.code === code) : undefined;
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z]/g, "");

/** The code for a typed state name (or alias), or null. Mirrors `public.state_code_for()`. */
export function stateCodeFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalise(name);
  if (!n) return null;
  const hit = INDIA_STATES.find((s) => normalise(s.name) === n || (s.aliases ?? []).some((a) => normalise(a) === n));
  return hit?.code ?? null;
}
