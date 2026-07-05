// Context-aware search filters.
//
// The Search Results filter panel adapts tightly to WHAT the buyer searched:
//   "mens t-shirt"  → T-Shirt Type / Sleeve / Fit / Fabric / Pattern / GSM …
//   "womens jeans"  → Jeans Style / Wash / Waist / Length …
//   "fabric"        → Fabric Type / GSM / Width / Weave …
//   "lipstick"      → Product Type / Skin Type / Formulation / Finish …
// Only facets relevant to the searched item are shown. Gender is inferred from
// the query and applied as a pre-scope (not shown as a redundant filter). JSX-free.

export type MatchField =
  | "gender" | "fabric" | "fit" | "price" | "gsm" | "rating" | "verified" | "moq" | "colour";

export interface Facet {
  id: string;
  label: string;
  options: string[];
  multi?: boolean;      // default true; single-select facets set false
  field?: MatchField;   // how a product is tested; omitted → derived (hashPick)
  hint?: string;        // small helper under the facet label
  kind?: "chips" | "range";
  min?: number;         // range facets: slider lower bound
  max?: number;         // range facets: slider upper bound
  step?: number;        // range facets: slider step
  hidden?: boolean;     // applied to filtering but not rendered (e.g. inferred gender)
}

export interface FilterSchema {
  domainId: string;
  domainLabel: string;  // e.g. "Men's T-Shirt", "Fabrics", "Lipstick"
  categoryId?: string;  // taxonomy top-category id (metadata only)
  facets: Facet[];
}

// ── Bucket helpers (options must match these EXACT strings) ──
export const PRICE_BUCKETS = ["Under ₹300", "₹300 – ₹600", "₹600 – ₹1,000", "Over ₹1,000"];
export const priceBucket = (v: number) =>
  v < 300 ? PRICE_BUCKETS[0] : v < 600 ? PRICE_BUCKETS[1] : v < 1000 ? PRICE_BUCKETS[2] : PRICE_BUCKETS[3];

export const GSM_BUCKETS = ["Up to 160", "160 – 200", "200 – 240", "240+"];
export const gsmBucket = (g: string | number) => {
  const n = typeof g === "number" ? g : parseInt(g, 10) || 0;
  return n < 160 ? GSM_BUCKETS[0] : n < 200 ? GSM_BUCKETS[1] : n < 240 ? GSM_BUCKETS[2] : GSM_BUCKETS[3];
};

export const MOQ_BUCKETS = ["Up to 50 pcs", "50 – 100 pcs", "100 – 500 pcs", "500+ pcs"];
export const RATING_OPTIONS = ["4.5★ & above", "4.0★ & above", "3.5★ & above"];
export const ratingThreshold = (label: string) => parseFloat(label) || 0;

// Deterministic pseudo-attribute for facets with no backing product field, so
// selecting them still narrows results in a stable way.
export function hashPick(seed: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

// ── Reusable facets ──
const COLOUR: Facet = { id: "colour", label: "Colour", field: "colour", options: ["Black", "White", "Blue", "Navy", "Grey", "Beige", "Olive", "Maroon", "Red", "Pink", "Green", "Yellow"] };
const PRICE: Facet = { id: "price", label: "Price", field: "price", kind: "range", min: 0, max: 2000, step: 50, options: [] };
const GSM: Facet = { id: "gsm", label: "GSM (fabric weight)", field: "gsm", options: GSM_BUCKETS, hint: "Higher GSM = heavier fabric" };
const MOQ: Facet = { id: "moq", label: "Minimum Order (MOQ)", field: "moq", options: MOQ_BUCKETS };
const RATING: Facet = { id: "rating", label: "Vendor Rating", field: "rating", multi: false, options: RATING_OPTIONS };
const VERIFIED: Facet = { id: "verified", label: "Vendor", field: "verified", options: ["TrustedSEAL Verified"] };
const gender = (options = ["Men", "Women", "Boys", "Girls"]): Facet => ({ id: "gender", label: "Gender / Age", field: "gender", options });
const fabric = (options: string[]): Facet => ({ id: "fabric", label: "Fabric", field: "fabric", options });
const fit: Facet = { id: "fit", label: "Fit", field: "fit", options: ["Slim", "Regular", "Relaxed", "Oversized"] };

// Focused item facets (no backing field → hashPick, narrows deterministically).
const type = (label: string, options: string[]): Facet => ({ id: "type", label, options });
const sleeve = (options: string[]): Facet => ({ id: "sleeve", label: "Sleeve", options });
const pattern = (options: string[]): Facet => ({ id: "pattern", label: "Pattern", options });
const length = (options: string[]): Facet => ({ id: "length", label: "Length", options });
const waist = (): Facet => ({ id: "waist", label: "Waist Size", options: ["28", "30", "32", "34", "36", "38", "40"] });

const APPAREL_FABRICS = ["Cotton", "Linen", "Denim", "Polyester", "Rayon", "Satin", "Terry"];

// ── Resolver helper: whole-word (plural-tolerant) match ──
// so "bag" doesn't fire inside "polybag" and "short" catches "shorts".
const wordHit = (q: string, k: string) =>
  new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i").test(q);

// ── Focused sub-item facet sets for tops & bottoms ──
// NB: "t-shirt" contains the word "shirt" (hyphen is a word boundary), so the
// tee set MUST be matched before the shirt set. Groups are checked in order;
// an unmatched query (e.g. bare "top") uses the explicit fallback set.
interface ItemGroup { key: string; kws: string[]; facets: () => Facet[] }

const teeFacets = (): Facet[] => [
  type("T-Shirt Type", ["Round Neck", "V-Neck", "Polo", "Henley", "Oversized", "Graphic", "Tank Top"]),
  fit, fabric(["Cotton", "Poly-Cotton", "Polyester", "Modal", "Supima"]),
  sleeve(["Half Sleeve", "Full Sleeve", "Sleeveless"]),
  pattern(["Solid", "Printed", "Striped", "Graphic", "Colour-Block"]), GSM, COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const poloFacets = (): Facet[] => [
  type("Polo Style", ["Classic", "Tipped", "Pique", "Colour-Block", "Long-Sleeve"]),
  fit, fabric(["Cotton Pique", "Poly-Cotton", "Cotton"]), sleeve(["Half Sleeve", "Full Sleeve"]),
  pattern(["Solid", "Striped", "Tipped", "Colour-Block"]), GSM, COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const shirtFacets = (): Facet[] => [
  type("Shirt Type", ["Casual", "Formal", "Denim", "Check", "Oxford", "Linen", "Flannel", "Printed"]),
  fit, fabric(["Cotton", "Linen", "Denim", "Poly-Cotton", "Oxford"]), sleeve(["Half Sleeve", "Full Sleeve"]),
  { id: "collar", label: "Collar", options: ["Spread", "Button-Down", "Mandarin", "Cuban", "Club"] },
  pattern(["Solid", "Checked", "Striped", "Printed"]), COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const womensTopFacets = (): Facet[] => [
  type("Type", ["Top", "Blouse", "Tank", "Camisole", "Crop Top", "Tunic", "Shrug"]),
  fit, fabric(["Cotton", "Rayon", "Georgette", "Satin", "Crepe", "Linen"]),
  sleeve(["Sleeveless", "Half Sleeve", "Full Sleeve", "Puff"]),
  pattern(["Solid", "Printed", "Floral", "Embroidered"]), COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const TOP_GROUPS: ItemGroup[] = [
  { key: "tee", kws: ["t-shirt", "tshirt", "t shirt", "tee"], facets: teeFacets },
  { key: "polo", kws: ["polo"], facets: poloFacets },
  { key: "womens-top", kws: ["blouse", "tank", "camisole", "crop", "tunic"], facets: womensTopFacets },
  { key: "shirt", kws: ["shirt", "overshirt"], facets: shirtFacets },
];

const jeansFacets = (): Facet[] => [
  type("Jeans Style", ["Skinny", "Slim", "Straight", "Bootcut", "Relaxed", "Baggy", "Mom", "Boyfriend"]),
  fit, { id: "wash", label: "Wash", options: ["Light", "Mid", "Dark", "Raw", "Distressed", "Black"] },
  waist(), length(["Ankle Length", "Full Length", "Cropped"]), COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const shortsFacets = (): Facet[] => [
  type("Shorts Type", ["Bermuda", "Cargo", "Denim", "Chino", "Sports", "Boxer"]),
  fit, fabric(["Cotton", "Denim", "Polyester", "Terry", "Nylon"]),
  length(["Above Knee", "Knee Length"]), waist(),
  pattern(["Solid", "Printed", "Cargo", "Washed"]), COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const joggersFacets = (): Facet[] => [
  type("Type", ["Joggers", "Track Pants", "Leggings", "Sweatpants", "Cargo Joggers", "Pyjamas"]),
  fit, fabric(["Cotton", "Polyester", "Terry", "Fleece", "Lycra"]), GSM,
  length(["Ankle Length", "Full Length", "Capri"]), COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const trousersFacets = (): Facet[] => [
  type("Trouser Type", ["Formal", "Chino", "Cargo", "Casual", "Pleated", "Cropped"]),
  fit, fabric(["Cotton", "Poly-Viscose", "Linen", "Terry", "Denim"]), waist(),
  length(["Ankle Length", "Full Length", "Cropped"]), pattern(["Solid", "Checked", "Striped"]),
  COLOUR, PRICE, MOQ, RATING, VERIFIED,
];
const BOTTOM_GROUPS: ItemGroup[] = [
  { key: "jeans", kws: ["jean", "jeans"], facets: jeansFacets },
  { key: "shorts", kws: ["short", "shorts", "bermuda"], facets: shortsFacets },
  { key: "joggers", kws: ["jogger", "joggers", "track", "sweatpant", "legging", "leggings", "pyjama", "pajama"], facets: joggersFacets },
  { key: "trousers", kws: ["trouser", "trousers", "pant", "pants", "chino", "cargo", "capri"], facets: trousersFacets },
];

// Match a sub-item by keyword; fall back to the given default set when none hit.
function groupFacets(q: string, groups: ItemGroup[], fallback: () => Facet[]): Facet[] {
  const hit = groups.find((gr) => gr.kws.some((k) => wordHit(q, k)));
  return (hit ? hit.facets : fallback)();
}

// ── Domain definitions (order = match priority, specific → generic) ──
interface Domain {
  id: string;
  categoryId?: string;
  keywords: string[];
  label?: string;                 // static label; else title-cased query
  build: (q: string) => Facet[];  // q = the full lowercased query, for sub-item focus
}

const DOMAINS: Domain[] = [
  {
    id: "innerwear", categoryId: "womenswear",
    keywords: ["bra", "panty", "panties", "innerwear", "lingerie", "brief", "vest", "shapewear", "camisole"],
    build: () => [gender(["Men", "Women", "Boys", "Girls"]), fabric(["Cotton", "Modal", "Nylon", "Lace", "Microfiber"]),
      type("Type", ["T-shirt Bra", "Padded", "Non-Padded", "Sports", "Brief", "Boxer", "Vest"]),
      { id: "size", label: "Size", options: ["S", "M", "L", "XL", "XXL"] },
      { id: "pack", label: "Pack Size", options: ["Single", "Pack of 2", "Pack of 3", "Pack of 5"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "footwear", categoryId: "footwear",
    keywords: ["shoe", "shoes", "sandal", "sneaker", "slipper", "heel", "boot", "footwear", "loafer", "flip", "flop", "sliders", "juttis", "crocs"],
    build: () => [gender(),
      type("Type", ["Sneakers", "Sandals", "Loafers", "Formal", "Boots", "Slippers", "Flip-Flops", "Sports"]),
      { id: "material", label: "Material", options: ["Leather", "Synthetic", "Canvas", "Rubber", "Mesh", "Suede"] },
      { id: "sole", label: "Sole", options: ["Rubber", "EVA", "PU", "TPR", "Air"] },
      { id: "size", label: "Size (UK)", options: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "packaging", categoryId: "packaging",
    keywords: ["polybag", "packaging", "carton", "envelope", "ziplock", "pouch", "box", "boxes", "paper bag", "corrugated", "mailer"],
    build: () => [
      type("Type", ["Polybag", "Paper Bag", "Corrugated Box", "Garment Box", "Envelope", "Ziplock", "Pouch"]),
      { id: "material", label: "Material", options: ["LDPE", "Kraft Paper", "Corrugated", "Non-woven", "BOPP", "Recycled"] },
      { id: "size", label: "Size", options: ["Small", "Medium", "Large", "Custom"] },
      { id: "printing", label: "Printing", options: ["Plain", "Printed", "Custom Logo"] },
      COLOUR, PRICE, MOQ, VERIFIED],
  },
  {
    id: "bags", categoryId: "accessories",
    keywords: ["bag", "bags", "backpack", "tote", "wallet", "purse", "handbag", "duffel", "sling", "clutch"],
    build: () => [
      type("Type", ["Backpack", "Tote", "Sling", "Wallet", "Duffel", "Handbag", "Clutch", "Laptop Bag"]),
      { id: "material", label: "Material", options: ["Leather", "Canvas", "PU", "Jute", "Nylon", "Denim"] },
      { id: "size", label: "Size", options: ["Mini", "Small", "Medium", "Large"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "beauty", categoryId: "beauty",
    keywords: ["skincare", "makeup", "lipstick", "cream", "serum", "cosmetic", "cosmetics", "fragrance", "perfume", "shampoo", "nail", "foundation", "moisturizer", "moisturiser", "lip", "kajal", "mascara", "sunscreen", "beauty"],
    build: () => [
      { id: "productType", label: "Product Type", options: ["Skincare", "Makeup", "Haircare", "Fragrance", "Bath & Body", "Nail"] },
      { id: "skin", label: "Skin / Hair Type", options: ["Normal", "Oily", "Dry", "Combination", "Sensitive"] },
      { id: "formulation", label: "Formulation", options: ["Cream", "Gel", "Serum", "Powder", "Liquid", "Balm"] },
      { id: "concern", label: "Concern", options: ["Anti-Ageing", "Brightening", "Acne", "Hydration", "Sun Protection"] },
      { id: "finish", label: "Finish", options: ["Matte", "Dewy", "Natural", "Glossy"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "fabric", categoryId: "raw-materials",
    keywords: ["fabric", "fabrics", "cloth", "textile", "cotton", "denim", "silk", "linen", "yarn", "knit", "woven", "viscose", "rayon", "chiffon", "georgette", "twill", "jersey", "fleece", "corduroy"],
    build: () => [
      { id: "fabricType", label: "Fabric Type", options: ["Cotton", "Denim", "Linen", "Silk", "Rayon", "Polyester", "Viscose", "Wool", "Blends"] },
      GSM,
      { id: "width", label: "Width", options: ["36\"", "44\"", "58\"", "60\""] },
      { id: "weave", label: "Construction", options: ["Knitted", "Woven", "Non-woven"] },
      { id: "pattern", label: "Pattern", options: ["Solid", "Printed", "Yarn-Dyed", "Dobby", "Checks", "Stripes"] },
      { id: "composition", label: "Composition", options: ["100% Cotton", "Poly-Cotton", "Poly-Viscose", "Blended"] },
      COLOUR, PRICE, MOQ, VERIFIED],
  },
  {
    id: "trims", categoryId: "trims-home",
    keywords: ["button", "buttons", "zipper", "zip", "patch", "elastic", "lace", "thread", "hook", "velcro", "trim", "trims", "label", "tag", "eyelet", "rivet", "drawcord", "toggle"],
    build: () => [
      type("Type", ["Buttons", "Zippers", "Elastic", "Lace", "Hook & Eye", "Velcro", "Patches", "Labels", "Drawcords"]),
      { id: "material", label: "Material", options: ["Metal", "Plastic", "Resin", "Nylon", "Cotton", "Wood"] },
      { id: "size", label: "Size", options: ["Small", "Medium", "Large", "Assorted"] },
      COLOUR, MOQ, PRICE, VERIFIED],
  },
  {
    id: "home-textile", categoryId: "trims-home",
    keywords: ["bedsheet", "bedding", "towel", "curtain", "cushion", "carpet", "rug", "blanket", "table linen", "duvet", "quilt", "pillow", "upholstery"],
    build: () => [
      type("Type", ["Bedsheet", "Towel", "Curtain", "Cushion", "Carpet", "Table Linen", "Blanket"]),
      { id: "material", label: "Material", options: ["Cotton", "Microfiber", "Polyester", "Jute", "Velvet", "Linen"] },
      { id: "size", label: "Size", options: ["Single", "Double", "Queen", "King"] },
      { id: "pattern", label: "Pattern", options: ["Solid", "Printed", "Woven", "Embroidered"] },
      COLOUR, PRICE, MOQ, VERIFIED],
  },
  {
    id: "accessories", categoryId: "accessories",
    keywords: ["belt", "cap", "hat", "watch", "sunglass", "sunglasses", "jewellery", "jewelry", "scarf", "stole", "sock", "socks", "glove", "tie", "accessory", "accessories"],
    build: () => [
      type("Type", ["Belts", "Caps & Hats", "Watches", "Sunglasses", "Jewellery", "Scarves", "Socks", "Gloves", "Ties"]),
      { id: "material", label: "Material", options: ["Leather", "Metal", "Fabric", "Plastic", "Cotton", "Alloy"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "ethnic", categoryId: "menswear",
    keywords: ["kurta", "sherwani", "lehenga", "saree", "sari", "ethnic", "salwar", "kurti", "dhoti", "nehru", "anarkali"],
    build: () => [gender(),
      fabric(["Cotton", "Silk", "Rayon", "Georgette", "Chanderi", "Linen"]),
      { id: "work", label: "Work / Embellishment", options: ["Plain", "Embroidered", "Printed", "Zari", "Mirror", "Sequin"] },
      { id: "occasion", label: "Occasion", options: ["Casual", "Festive", "Wedding", "Formal"] },
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "winterwear", categoryId: "menswear",
    keywords: ["jacket", "sweater", "hoodie", "coat", "winter", "sweatshirt", "cardigan", "pullover", "windbreaker", "parka", "blazer"],
    build: () => [gender(),
      fabric(["Fleece", "Wool", "Nylon", "Cotton", "Polyester", "Denim"]),
      type("Type", ["Bomber", "Puffer", "Denim", "Hooded", "Zipper", "Pullover", "Blazer"]),
      pattern(["Solid", "Printed", "Colour-Block", "Melange"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "dress", categoryId: "womenswear",
    keywords: ["dress", "frock", "gown", "jumpsuit", "playsuit", "maxi", "midi", "bodycon"],
    build: () => [gender(["Women", "Girls"]),
      fabric(["Cotton", "Rayon", "Satin", "Georgette", "Linen", "Crepe"]),
      length(["Mini", "Knee Length", "Midi", "Maxi"]),
      { id: "occasion", label: "Occasion", options: ["Casual", "Party", "Festive", "Formal", "Beach"] },
      pattern(["Solid", "Printed", "Floral", "Embroidered"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "skirt", categoryId: "womenswear",
    keywords: ["skirt", "skort"],
    build: () => [gender(["Women", "Girls"]),
      fabric(APPAREL_FABRICS),
      length(["Mini", "Knee Length", "Midi", "Maxi"]),
      pattern(["Solid", "Printed", "Pleated", "A-Line", "Denim"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "apparel-bottom", categoryId: "menswear",
    keywords: ["shorts", "short", "trouser", "trousers", "pant", "pants", "jean", "jeans", "jogger", "joggers", "legging", "leggings", "cargo", "chino", "bottomwear", "bottom", "bermuda", "capri", "pyjama", "pajama", "track"],
    build: (q) => [gender(), ...groupFacets(q, BOTTOM_GROUPS, trousersFacets)],
  },
  {
    id: "apparel-top", categoryId: "menswear",
    keywords: ["t-shirt", "tshirt", "tee", "shirt", "top", "tops", "blouse", "polo", "tank", "camisole", "crop", "upperwear", "overshirt", "tunic"],
    build: (q) => [gender(), ...groupFacets(q, TOP_GROUPS, teeFacets)],
  },
];

// Fallback for anything apparel-ish / unrecognised.
const DEFAULT_DOMAIN: Domain = {
  id: "general", keywords: [], label: "All Products",
  build: () => [gender(),
    fabric(APPAREL_FABRICS),
    pattern(["Solid", "Printed", "Striped", "Checked", "Graphic"]),
    COLOUR, GSM, PRICE, MOQ, RATING, VERIFIED],
};

// ── Gender detection ──
const GENDER_TOKENS: [RegExp, string][] = [
  [/\b(men|man|mens|male|gents|boys?)\b/, "Men"],
  [/\b(women|woman|womens|female|ladies|girls?)\b/, "Women"],
  [/\b(kid|kids|child|children|baby)\b/, "Boys"],
];
function detectGender(q: string): string | null {
  for (const [re, g] of GENDER_TOKENS) if (re.test(q)) return g;
  return null;
}

function titleCase(q: string): string {
  return q
    .replace(/\bmens\b/gi, "Men's").replace(/\bwomens\b/gi, "Women's").replace(/\bkids\b/gi, "Kids'")
    .split(/\s+/).map((w) => (/['A-Z]/.test(w[0] || "") ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

// ── Resolver ──
export function resolveFilterSchema(query: string): FilterSchema {
  const q = query.toLowerCase().trim();
  const g = detectGender(q);
  const domain = DOMAINS.find((d) => d.keywords.some((k) => wordHit(q, k))) ?? DEFAULT_DOMAIN;

  let facets = domain.build(q);
  // If the query already implies a gender, keep it as a pre-scope but hide the
  // (now redundant) gender facet so the panel stays focused on the item.
  if (g) facets = facets.map((f) => (f.field === "gender" ? { ...f, hidden: true } : f));

  const domainLabel = domain.label ?? (q ? titleCase(query) : "All Products");
  return { domainId: domain.id, domainLabel, categoryId: domain.categoryId, facets };
}

// Initial selections — pre-scope gender if the query implies it (e.g. "mens shorts").
export function defaultSelections(query: string): Record<string, string[]> {
  const g = detectGender(query.toLowerCase());
  const hasGenderFacet = resolveFilterSchema(query).facets.some((f) => f.id === "gender");
  return g && hasGenderFacet ? { gender: [g] } : {};
}
