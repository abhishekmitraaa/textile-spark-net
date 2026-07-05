// Shared types + mock-data helpers for the compact buyer listing card.
// Kept separate from the card component so fast-refresh stays happy and
// the data layer can be reused without importing JSX.

export type Gender = "women" | "men" | "kids" | "unisex";

export interface ListingProduct {
  id: string;
  vendorId: string;
  name: string;
  manufacturer: string;
  location: string;
  price: string;
  priceValue: number; // numeric, for sorting
  moq: string;
  soldCount: string;
  enquiries: string;
  rating: number;
  fabric: string;
  gsm: string;
  fitType: string;
  image: string;
  secondaryImage: string;
  gender: Gender;
  /** Optional taxonomy used by preference-filtered feeds (e.g. For You). */
  category?: string;
  locationId?: string;
}

export const img = (seed: string, w = 500, h = 650) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const PRICE_POOL = [
  { label: "₹399", value: 399 },
  { label: "₹499", value: 499 },
  { label: "₹599", value: 599 },
];
const GENDER_POOL: Gender[] = ["women", "men", "kids", "unisex"];

export function makeListingProduct(
  seed: string,
  overrides: Partial<ListingProduct> = {}
): ListingProduct {
  // Deterministic-ish variety from the seed string so sort/filter visibly change order.
  const hash = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
  const price = PRICE_POOL[hash % PRICE_POOL.length];
  const rating = 3.7 + (hash % 13) / 10;
  const gender = GENDER_POOL[hash % GENDER_POOL.length];

  return {
    id: seed,
    vendorId: `v-${seed}`,
    name: "Product name",
    manufacturer: "Manufacturer",
    location: "Bangalore",
    price: price.label,
    priceValue: price.value,
    moq: "MOQ: 2",
    soldCount: "800+ sold",
    enquiries: hash % 2 === 0 ? "5.6k" : "1.6k",
    rating: Math.min(rating, 4.9),
    fabric: "Cotton",
    gsm: "200",
    fitType: "Regular",
    image: img(seed),
    secondaryImage: img(`${seed}-b`),
    gender,
    ...overrides,
  };
}
