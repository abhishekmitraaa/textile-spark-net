// ─────────────────────────────────────────────────────────────
// Size sets per garment, and the measurement charts buyers read (2026-10-17).
//
// Mitra: "size charts are still not correct for all types of items: a bra has S, M… and not the size chart
// normally used, so the sizing of each type of garment needs checking." Every apparel sub-category used one of
// four sets (letters, waist, length, kids' ages); bras, panties, shoes, sarees, socks and caps had no set of
// their own, so a vendor picked S–5XL or typed free text. Now each garment type has the sizes its trade uses
// (data/sellerCategories.ts reads the sets below), and the listing page shows the matching chart.
//
// Charts follow the common Indian trade conventions (Indian brands' published charts; UK = IND shoe sizes).
// They are a guide: a vendor's own garment can run differently, which the sheet says.
// ─────────────────────────────────────────────────────────────

// ── Size sets (the chips a vendor picks) ──────────────────────
export const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "Plus Size", "Free Size"];
export const WAIST_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];
export const LENGTHS = ["28", "30", "32", "34", "36", "38", "40"];
export const KIDS_SIZES = ["0-3M", "3-6M", "6-12M", "1-2Y", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y", "8-10Y", "10-12Y", "12-14Y"];
export const SHIRT_COLLAR_SIZES = ["38", "39", "40", "41", "42", "43", "44", "46", "48"];

const BRA_BANDS = ["30", "32", "34", "36", "38", "40", "42"];
const BRA_CUPS = ["A", "B", "C", "D", "DD"];
/** Band × cup: 30A … 42DD. */
export const BRA_SIZES = BRA_BANDS.flatMap((b) => BRA_CUPS.map((c) => `${b}${c}`));
export const LINGERIE_LETTER_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"];
export const MENS_INNERWEAR_SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
/** UK = India. */
export const ADULT_SHOE_SIZES = ["UK 3", "UK 4", "UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"];
export const KIDS_SHOE_SIZES = ["UK 4K", "UK 5K", "UK 6K", "UK 7K", "UK 8K", "UK 9K", "UK 10K", "UK 11K", "UK 12K", "UK 13K", "UK 1", "UK 2", "UK 3", "UK 4", "UK 5"];
/** A saree is one length; a stitched blouse goes by bust (inches). */
export const SAREE_SIZES = ["Free Size", "Blouse 32", "Blouse 34", "Blouse 36", "Blouse 38", "Blouse 40", "Blouse 42", "Blouse 44"];
/** Lehenga skirt waist, inches. */
export const LEHENGA_WAIST_SIZES = ["24", "26", "28", "30", "32", "34", "36", "38", "40", "42"];
/** Lehenga and petticoat length, inches. */
export const SKIRT_LENGTHS = ["38", "39", "40", "41", "42", "43", "44"];
export const PETTICOAT_SIZES = ["Free Size", "S", "M", "L", "XL", "XXL", "3XL"];
export const SOCK_SIZES = ["Free Size (UK 6-10)", "UK 3-5", "UK 6-8", "UK 9-11", "UK 12-13", "Kids 0-1Y", "Kids 1-3Y", "Kids 3-5Y", "Kids 5-7Y", "Kids 7-9Y", "Kids 9-12Y"];
export const CAP_SIZES = ["Free Size (Adjustable)", "54 cm", "56 cm", "58 cm", "60 cm", "62 cm"];
export const GLOVE_SIZES = ["XS", "S", "M", "L", "XL", "Free Size"];
export const BELT_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "Free Size"];

// ── Charts (what the buyer reads) ─────────────────────────────
export interface SizeChart {
  id: string;
  title: string;
  /** How to measure, one line. */
  howTo: string;
  columns: string[];
  /** The first cell is the size as the vendor lists it. */
  rows: string[][];
}

const range = (a: number, b: number) => `${a}–${b}`;

export const SIZE_CHARTS: Record<string, SizeChart> = {
  womens: {
    id: "womens",
    title: "Women's clothing",
    howTo: "Bust: around the fullest part. Waist: the narrowest part. Hip: the fullest part. In inches (cm).",
    columns: ["Size", "Bust", "Waist", "Hip"],
    rows: ([
      ["XXS", 30, 24, 33], ["XS", 32, 26, 35], ["S", 34, 28, 37], ["M", 36, 30, 39], ["L", 38, 32, 41],
      ["XL", 40, 34, 43], ["XXL", 42, 36, 45], ["3XL", 44, 38, 47], ["4XL", 46, 40, 49], ["5XL", 48, 42, 51],
    ] as [string, number, number, number][]).map(([s, b, w, h]) => [s, `${b} (${Math.round(b * 2.54)})`, `${w} (${Math.round(w * 2.54)})`, `${h} (${Math.round(h * 2.54)})`]),
  },
  mens: {
    id: "mens",
    title: "Men's clothing",
    howTo: "Chest: around the fullest part, under the arms. Waist: where the trousers sit. In inches (cm).",
    columns: ["Size", "Chest", "Waist"],
    rows: ([
      ["XXS", 32, 26], ["XS", 34, 28], ["S", 36, 30], ["M", 38, 32], ["L", 40, 34], ["XL", 42, 36],
      ["XXL", 44, 38], ["3XL", 46, 40], ["4XL", 48, 42], ["5XL", 50, 44],
    ] as [string, number, number][]).map(([s, c, w]) => [s, `${c} (${Math.round(c * 2.54)})`, `${w} (${Math.round(w * 2.54)})`]),
  },
  shirts: {
    id: "shirts",
    title: "Men's shirts (collar size)",
    howTo: "Collar: around the base of the neck, plus a finger's room. Chest: around the fullest part.",
    columns: ["Size", "Collar (cm)", "Chest (in)", "Letter"],
    rows: [["38", "38", "38", "S"], ["39", "39", "39–40", "M"], ["40", "40", "40", "M"], ["41", "41", "41–42", "L"], ["42", "42", "42", "L"], ["43", "43", "43–44", "XL"], ["44", "44", "44", "XL"], ["46", "46", "46", "XXL"], ["48", "48", "48", "3XL"]],
  },
  waist: {
    id: "waist",
    title: "Trousers and jeans (waist × length)",
    howTo: "Waist: where the waistband sits. Length (inseam): crotch to ankle. In inches.",
    columns: ["Waist size", "Waist (in)", "Waist (cm)", "Hip (in)"],
    rows: WAIST_SIZES.map((w) => [w, w, String(Math.round(Number(w) * 2.54)), String(Number(w) + 8)]),
  },
  kids: {
    id: "kids",
    title: "Kids' clothing (by age)",
    howTo: "Pick by height first; age is a guide. Height and chest in cm.",
    columns: ["Size", "Height", "Chest"],
    rows: [
      ["0-3M", range(56, 62), range(40, 42)], ["3-6M", range(62, 68), range(42, 44)], ["6-12M", range(68, 80), range(44, 47)],
      ["1-2Y", range(80, 92), range(47, 50)], ["2-3Y", range(92, 98), range(50, 52)], ["3-4Y", range(98, 104), range(52, 54)],
      ["4-5Y", range(104, 110), range(54, 56)], ["5-6Y", range(110, 116), range(56, 58)], ["6-7Y", range(116, 122), range(58, 61)],
      ["7-8Y", range(122, 128), range(61, 64)], ["8-10Y", range(128, 140), range(64, 70)], ["10-12Y", range(140, 152), range(70, 76)],
      ["12-14Y", range(152, 164), range(76, 82)],
    ],
  },
  bra: {
    id: "bra",
    title: "Bras (band and cup)",
    howTo: "Band: measure snugly under the bust (underbust). Cup: bust at its fullest minus underbust. In cm.",
    columns: ["Band", "Underbust (cm)", "Cup", "Bust − underbust (cm)"],
    rows: [
      ["30", range(63, 67), "A", range(10, 12)], ["32", range(68, 72), "B", range(12, 14)], ["34", range(73, 77), "C", range(14, 16)],
      ["36", range(78, 82), "D", range(16, 18)], ["38", range(83, 87), "DD", range(18, 20)], ["40", range(88, 92), "", ""],
      ["42", range(93, 97), "", ""],
    ],
  },
  panties: {
    id: "panties",
    title: "Panties, shapewear and lingerie sets",
    howTo: "Hip: around the fullest part. Waist: the narrowest part. In cm (inches).",
    columns: ["Size", "Waist", "Hip"],
    rows: [
      ["XS", "58–63 (23–25)", "83–88 (33–35)"], ["S", "64–69 (25–27)", "89–94 (35–37)"], ["M", "70–75 (28–30)", "95–100 (37–39)"],
      ["L", "76–81 (30–32)", "101–106 (40–42)"], ["XL", "82–87 (32–34)", "107–112 (42–44)"], ["XXL", "88–93 (35–37)", "113–118 (44–46)"],
      ["3XL", "94–99 (37–39)", "119–124 (47–49)"],
    ],
  },
  mensInnerwear: {
    id: "mensInnerwear",
    title: "Men's innerwear",
    howTo: "Briefs and trunks by waist; vests by chest. In cm (inches).",
    columns: ["Size", "Waist", "Chest (vests)"],
    rows: [
      ["S", "71–76 (28–30)", "85–90 (34–36)"], ["M", "76–81 (30–32)", "90–95 (36–38)"], ["L", "81–86 (32–34)", "95–100 (38–40)"],
      ["XL", "86–91 (34–36)", "100–105 (40–42)"], ["XXL", "91–97 (36–38)", "105–110 (42–44)"], ["3XL", "97–102 (38–40)", "110–115 (44–46)"],
      ["4XL", "102–107 (40–42)", "115–120 (46–48)"],
    ],
  },
  shoes: {
    id: "shoes",
    title: "Shoes (UK / India)",
    howTo: "Stand on paper, mark heel and longest toe, measure in cm. US men's = UK + 1, US women's = UK + 2.",
    columns: ["Size", "EU", "Foot length (cm)"],
    rows: [
      ["UK 3", "36", "22.0"], ["UK 4", "37", "22.9"], ["UK 5", "38", "23.8"], ["UK 6", "39", "24.6"], ["UK 7", "40.5", "25.4"],
      ["UK 8", "42", "26.2"], ["UK 9", "43", "27.1"], ["UK 10", "44.5", "27.9"], ["UK 11", "46", "28.8"], ["UK 12", "47", "29.6"],
    ],
  },
  kidsShoes: {
    id: "kidsShoes",
    title: "Kids' shoes (UK / India)",
    howTo: "Measure the foot (heel to longest toe) in cm and allow about 1 cm to grow. Age is a guide.",
    columns: ["Size", "EU", "Foot length (cm)", "Age"],
    rows: [
      ["UK 4K", "20", "12.2", "1Y"], ["UK 5K", "21", "13.0", "1–2Y"], ["UK 6K", "23", "13.8", "2Y"], ["UK 7K", "24", "14.6", "2–3Y"],
      ["UK 8K", "25.5", "15.4", "3Y"], ["UK 9K", "27", "16.3", "3–4Y"], ["UK 10K", "28", "17.1", "4–5Y"], ["UK 11K", "29.5", "17.9", "5–6Y"],
      ["UK 12K", "31", "18.7", "6–7Y"], ["UK 13K", "32", "19.6", "7–8Y"], ["UK 1", "33", "20.4", "8–9Y"], ["UK 2", "34.5", "21.2", "9–10Y"],
      ["UK 3", "36", "22.0", "10–11Y"], ["UK 4", "37", "22.9", "11–12Y"], ["UK 5", "38", "23.8", "12Y+"],
    ],
  },
  saree: {
    id: "saree",
    title: "Sarees and blouses",
    howTo: "A saree is one size (usually 5.5 m, or 6.3 m with an unstitched blouse piece). A stitched blouse goes by bust, in inches.",
    columns: ["Size", "Bust (in)", "Bust (cm)"],
    rows: [["Free Size", "—", "—"], ...["32", "34", "36", "38", "40", "42", "44"].map((b) => [`Blouse ${b}`, b, String(Math.round(Number(b) * 2.54))])],
  },
  lehenga: {
    id: "lehenga",
    title: "Lehengas (waist × length)",
    howTo: "Waist: where the skirt will sit. Length: waist to floor, in the footwear you'll wear. In inches.",
    columns: ["Waist size", "Waist (in)", "Waist (cm)"],
    rows: LEHENGA_WAIST_SIZES.map((w) => [w, w, String(Math.round(Number(w) * 2.54))]),
  },
  petticoat: {
    id: "petticoat",
    title: "Petticoats (saree inskirts)",
    howTo: "Waist: where the saree is tied. Most petticoats have a drawstring. In inches.",
    columns: ["Size", "Waist (in)", "Length (in)"],
    rows: [["Free Size", "26–44", "39–40"], ["S", "26–30", "38"], ["M", "30–34", "39"], ["L", "34–38", "40"], ["XL", "38–42", "40"], ["XXL", "42–46", "41"], ["3XL", "46–50", "41"]],
  },
  socks: {
    id: "socks",
    title: "Socks (by shoe size)",
    howTo: "Socks go by shoe size (UK / India) or, for children, by age.",
    columns: ["Size", "Fits shoe size", "Foot length (cm)"],
    rows: [
      ["Free Size (UK 6-10)", "UK 6–10", "24.6–27.9"], ["UK 3-5", "UK 3–5", "22.0–23.8"], ["UK 6-8", "UK 6–8", "24.6–26.2"],
      ["UK 9-11", "UK 9–11", "27.1–28.8"], ["UK 12-13", "UK 12–13", "29.6–30.5"], ["Kids 0-1Y", "UK 1K–3K", "8–11"],
      ["Kids 1-3Y", "UK 4K–7K", "12–15"], ["Kids 3-5Y", "UK 8K–10K", "15–17"], ["Kids 5-7Y", "UK 11K–13K", "18–20"],
      ["Kids 7-9Y", "UK 1–2", "20–21"], ["Kids 9-12Y", "UK 3–5", "22–24"],
    ],
  },
  caps: {
    id: "caps",
    title: "Caps and hats",
    howTo: "Measure around the head, about 1 cm above the ears and eyebrows.",
    columns: ["Size", "Head (cm)", "Letter"],
    rows: [["Free Size (Adjustable)", "54–60", "One size"], ["54 cm", "54", "XS"], ["56 cm", "56", "S"], ["58 cm", "58", "M–L"], ["60 cm", "60", "XL"], ["62 cm", "62", "XXL"]],
  },
};

/**
 * The chart for a listing, by its category (public.categories.name: the vendor upload sub-category).
 * "letters": the men's or the women's letter chart, by the listing's gender. Undefined for categories with no
 * garment sizes (fabric, trims, machinery…).
 */
export const SIZE_CHART_BY_SUB: Record<string, string> = {
  "Men's T-Shirts": "mens",
  "Unisex T-Shirts": "letters",
  "Men's Shirts": "shirts",
  "Men's Pants/Trousers": "waist",
  "Men's Jeans": "waist",
  "Women's Tops": "womens",
  "Women's Pants/Trousers": "womens",
  "Women's Dresses": "womens",
  "Women's Ethnic Wear": "womens",
  "Kids Wear": "kids",
  "Footwear": "shoes",
  "Activewear": "letters",
  "Winter Wear": "letters",
  "Other Ready-made Garments": "letters",
  "Bras": "bra",
  "Briefs & Panties": "panties",
  "Lingerie Sets": "bra",
  "Shapewear": "panties",
  "Nightwear & Loungewear": "letters",
  "Sarees": "saree",
  "Lehengas": "lehenga",
  "Petticoats": "petticoat",
  "Men's Innerwear": "mensInnerwear",
  "Men's Ethnic Wear": "mens",
  "Men's Footwear": "shoes",
  "Women's Footwear": "shoes",
  "Kids' Footwear": "kidsShoes",
  "Socks": "socks",
  "Caps & Hats": "caps",
};

export function sizeChartFor(categoryName: string | null | undefined, gender?: string | null): SizeChart | null {
  let id = categoryName ? SIZE_CHART_BY_SUB[categoryName] : undefined;
  if (id === "letters") id = /^(women|girls)/i.test(gender ?? "") ? "womens" : "mens";
  return id ? SIZE_CHARTS[id] ?? null : null;
}
