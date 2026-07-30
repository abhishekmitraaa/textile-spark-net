import { vendorOptions } from "@/data/sellerCategories";

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
  | "gender" | "fabric" | "fit" | "price" | "gsm" | "rating" | "verified" | "moq" | "colour"
  // Backed by real products columns as of the attribute-persistence work. A
  // facet without a `field` still falls back to hashPick, which is a stable
  // fake — only leave it unset when no column exists to match against.
  | "pattern" | "occasion" | "neckType" | "sleeveType" | "collarType"
  | "countryOfOrigin" | "sizes" | "waist" | "lengths" | "category";

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
  /**
   * Result count per option, shown beside the chip. Only set for facets whose
   * options are derived from the live catalogue at query time (Category), where
   * a count is a real number of matching products rather than decoration.
   */
  optionCounts?: Record<string, number>;
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
// products.moq is free text the vendor typed, so the caller parses a number out
// of it first (see CatalogueRow.moqValue) and buckets it here. This facet used
// to hashPick despite moq having had a real column all along.
export const moqBucket = (n: number) =>
  n <= 50 ? MOQ_BUCKETS[0] : n <= 100 ? MOQ_BUCKETS[1] : n <= 500 ? MOQ_BUCKETS[2] : MOQ_BUCKETS[3];
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

// `type` has no backing column — a vendor never answers "T-Shirt Type" as such —
// so it stays on hashPick. See the KNOWN GAPS note at the bottom of this file.
const type = (label: string, options: string[]): Facet => ({ id: "type", label, options });

// ── Facets backed by real products columns ──
// Options come from vendorOptions() so the buyer's choices are exactly what a
// vendor could have picked; matching is against the product's own column.
const TEE_SUBS = ["mens-tshirts", "womens-tops"];
const SHIRT_SUBS = ["mens-shirts"];
const DRESS_SUBS = ["womens-dresses", "womens-ethnic"];
const BOTTOM_SUBS = ["mens-jeans", "mens-pants"];
const APPAREL_SUBS = [...TEE_SUBS, ...SHIRT_SUBS, ...DRESS_SUBS];

const sleeve = (subs: string[]): Facet =>
  ({ id: "sleeve", label: "Sleeve", field: "sleeveType", options: vendorOptions("sleeveType", subs) });
const neck = (subs: string[]): Facet =>
  ({ id: "neck", label: "Neck Type", field: "neckType", options: vendorOptions("neckType", subs) });
const collar = (subs: string[]): Facet =>
  ({ id: "collar", label: "Collar", field: "collarType", options: vendorOptions("collarType", subs) });
const pattern = (subs: string[]): Facet =>
  ({ id: "pattern", label: "Pattern", field: "pattern", options: vendorOptions("pattern", subs) });
const occasion = (subs: string[]): Facet =>
  ({ id: "occasion", label: "Occasion", field: "occasion", options: vendorOptions("occasion", subs) });
const sizes = (subs: string[]): Facet =>
  ({ id: "sizes", label: "Size", field: "sizes", options: vendorOptions("sizes", subs) });
const waist = (): Facet =>
  ({ id: "waist", label: "Waist Size", field: "waist", options: vendorOptions("waistSizes", BOTTOM_SUBS) });
// Bottomwear inseam, backed by products.lengths.
const inseam = (): Facet =>
  ({ id: "inseam", label: "Length (inseam)", field: "lengths", options: vendorOptions("lengths", BOTTOM_SUBS) });
const ORIGIN: Facet =
  { id: "origin", label: "Country of Origin", field: "countryOfOrigin", options: vendorOptions("originCountry", ["mens-tshirts"]) };
// Buyer-facing category tree. Options are filled in at query time from the
// result set (see SearchResults) because they depend on what actually matched.
const CATEGORY: Facet = { id: "category", label: "Category", field: "category", options: [] };

// Garment hem length (Mini / Midi / Maxi). No backing column — see KNOWN GAPS.
const length = (options: string[]): Facet => ({ id: "length", label: "Length", options });

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
  CATEGORY,
  type("T-Shirt Type", ["Round Neck", "V-Neck", "Polo", "Henley", "Oversized", "Graphic", "Tank Top"]),
  fit, fabric(vendorOptions("fabric", ["mens-tshirts"])),
  neck(["mens-tshirts"]), sleeve(["mens-tshirts"]), pattern(["mens-tshirts"]),
  sizes(["mens-tshirts"]), occasion(["mens-tshirts"]),
  GSM, COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const poloFacets = (): Facet[] => [
  CATEGORY,
  type("Polo Style", ["Classic", "Tipped", "Pique", "Colour-Block", "Long-Sleeve"]),
  fit, fabric(vendorOptions("fabric", ["mens-tshirts"])),
  neck(["mens-tshirts"]), sleeve(["mens-tshirts"]), pattern(["mens-tshirts"]),
  sizes(["mens-tshirts"]), GSM, COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const shirtFacets = (): Facet[] => [
  CATEGORY,
  type("Shirt Type", ["Casual", "Formal", "Denim", "Check", "Oxford", "Linen", "Flannel", "Printed"]),
  fit, fabric(vendorOptions("fabric", SHIRT_SUBS)),
  collar(SHIRT_SUBS), sleeve(SHIRT_SUBS), pattern(SHIRT_SUBS),
  sizes(SHIRT_SUBS), occasion(SHIRT_SUBS),
  COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const womensTopFacets = (): Facet[] => [
  CATEGORY,
  type("Type", ["Top", "Blouse", "Tank", "Camisole", "Crop Top", "Tunic", "Shrug"]),
  fit, fabric(vendorOptions("fabric", ["womens-tops"])),
  neck(["womens-tops"]), sleeve(["womens-tops"]), pattern(["womens-tops"]),
  sizes(["womens-tops"]), occasion(["womens-tops"]),
  COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const TOP_GROUPS: ItemGroup[] = [
  { key: "tee", kws: ["t-shirt", "tshirt", "t shirt", "tee"], facets: teeFacets },
  { key: "polo", kws: ["polo"], facets: poloFacets },
  { key: "womens-top", kws: ["blouse", "tank", "camisole", "crop", "tunic"], facets: womensTopFacets },
  { key: "shirt", kws: ["shirt", "overshirt"], facets: shirtFacets },
];

const jeansFacets = (): Facet[] => [
  CATEGORY,
  type("Jeans Style", ["Skinny", "Slim", "Straight", "Bootcut", "Relaxed", "Baggy", "Mom", "Boyfriend"]),
  fit, { id: "wash", label: "Wash", options: vendorOptions("wash", ["mens-jeans"]) },
  waist(), inseam(), pattern(BOTTOM_SUBS),
  COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const shortsFacets = (): Facet[] => [
  CATEGORY,
  type("Shorts Type", ["Bermuda", "Cargo", "Denim", "Chino", "Sports", "Boxer"]),
  fit, fabric(vendorOptions("fabric", ["mens-pants"])),
  waist(), inseam(), pattern(BOTTOM_SUBS),
  COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const joggersFacets = (): Facet[] => [
  CATEGORY,
  type("Type", ["Joggers", "Track Pants", "Leggings", "Sweatpants", "Cargo Joggers", "Pyjamas"]),
  fit, fabric(vendorOptions("fabric", ["mens-pants"])), GSM,
  waist(), inseam(), COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
];
const trousersFacets = (): Facet[] => [
  CATEGORY,
  type("Trouser Type", ["Formal", "Chino", "Cargo", "Casual", "Pleated", "Cropped"]),
  fit, fabric(vendorOptions("fabric", ["mens-pants"])), waist(), inseam(),
  pattern(BOTTOM_SUBS), COLOUR, PRICE, MOQ, ORIGIN, RATING, VERIFIED,
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
      pattern(["home-textiles"]),
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
      occasion(["womens-ethnic"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "winterwear", categoryId: "menswear",
    keywords: ["jacket", "sweater", "hoodie", "coat", "winter", "sweatshirt", "cardigan", "pullover", "windbreaker", "parka", "blazer"],
    build: () => [gender(),
      fabric(["Fleece", "Wool", "Nylon", "Cotton", "Polyester", "Denim"]),
      type("Type", ["Bomber", "Puffer", "Denim", "Hooded", "Zipper", "Pullover", "Blazer"]),
      pattern(["ready-made-garments"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "dress", categoryId: "womenswear",
    keywords: ["dress", "frock", "gown", "jumpsuit", "playsuit", "maxi", "midi", "bodycon"],
    build: () => [gender(["Women", "Girls"]),
      fabric(["Cotton", "Rayon", "Satin", "Georgette", "Linen", "Crepe"]),
      length(["Mini", "Knee Length", "Midi", "Maxi"]),
      occasion(["womens-dresses"]),
      pattern(["womens-dresses"]),
      COLOUR, PRICE, MOQ, RATING, VERIFIED],
  },
  {
    id: "skirt", categoryId: "womenswear",
    keywords: ["skirt", "skort"],
    build: () => [gender(["Women", "Girls"]),
      fabric(APPAREL_FABRICS),
      length(["Mini", "Knee Length", "Midi", "Maxi"]),
      pattern(["womens-dresses"]),
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
    pattern(APPAREL_SUBS),
    CATEGORY, COLOUR, GSM, PRICE, MOQ, ORIGIN, RATING, VERIFIED],
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

// ── KNOWN GAPS: facets still on hashPick ──
// These have no backing products column, so matchFacet falls through to
// hashPick — a deterministic pseudo-value per product id. Selecting one still
// narrows the list, but not by anything the vendor actually entered.
//
//   type      ("T-Shirt Type", "Jeans Style", "Shirt Type", …) — the vendor
//             picks a subcategory, never a style label like "Oversized".
//   material  (bags / trims / packaging / footwear / home textiles) — collected
//             per subcategory in sellerCategories but never persisted; would
//             need a products.material column.
//   size      (innerwear / footwear UK / packaging / trims) — Footwear and
//             Other Ready-made Garments declare `sizes` as free TEXT, so it
//             cannot feed the sizes[] column. Fixing needs those two converted
//             to size-selector.
//   length    (dress / skirt hem length) — distinct from bottomwear inseam,
//             which is real (products.lengths). No garment_length column yet.
//   wash      (jeans) — options now come from the vendor list, but Men's Jeans
//             stores `wash` nowhere.
//   pack, sole, printing, skin, formulation, concern, finish, productType,
//   fabricType, width, weave, composition, work — same story: real questions in
//   the upload form with no column behind them.
//
// Everything else (gender, fabric, fit, price, gsm, colour, moq, rating,
// verified, pattern, occasion, neckType, sleeveType, collarType,
// countryOfOrigin, sizes, waist, lengths, category) matches a real column.

// Initial selections — pre-scope gender if the query implies it (e.g. "mens shorts").
export function defaultSelections(query: string): Record<string, string[]> {
  const g = detectGender(query.toLowerCase());
  const hasGenderFacet = resolveFilterSchema(query).facets.some((f) => f.id === "gender");
  return g && hasGenderFacet ? { gender: [g] } : {};
}
