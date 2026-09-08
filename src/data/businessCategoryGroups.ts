// The business categories a vendor can claim (vendor_profiles.category, text[]).
//
// Lives here rather than inside a page because BOTH /onboarding and
// /business-profile write this column through the same picker. It used to be a
// module-scope constant inside BusinessProfile.tsx, which is why onboarding had
// no way to collect it at all — and a vendor with an empty `category` is
// invisible to category search.
//
// NOT the same taxonomy as `categories` (the product taxonomy buyers filter
// products by). This describes what the BUSINESS is; that describes what a
// PRODUCT is.
export const CATEGORY_GROUPS: { group: string; items: string[] }[] = [
  {
    group: "MANUFACTURER",
    items: [
      "Garment Manufacturer", "Fabric Manufacturer", "Accessories Manufacturer",
      "Embroidery manufacturers", "Printing manufacturers", "Luxury/premium wear manufacturers",
      "Home Textile Manufacturers", "Export-grade manufacturers", "Leather Goods Manufacturer",
      "Footwear Manufacturer", "Uniforms / Corporate Wear", "Sportswear / Athleisure Manufacturer",
      "Private Label Manufacturer", "Made-to-Order / Custom Manufacturing",
      "Recycled fabric manufacturers", "Sustainable & organic wear manufacturers",
    ],
  },
  {
    group: "TRADER / WHOLESALER",
    items: [
      "Textile Trader", "Garment Wholesaler", "Fabric Wholesaler",
      "Export House", "Import / Trading Company", "Multi-brand Distributor",
    ],
  },
  {
    group: "RETAILER",
    items: [
      "Apparel Retail Store", "Online Fashion Retailer", "Multi-brand Outlet",
      "Boutique / Designer Studio", "Departmental Store",
    ],
  },
  {
    group: "SERVICES",
    items: [
      "Logistics & Shipping", "Quality Inspection / Testing Lab",
      "Fashion Designer / Consultant", "Sourcing Agent", "Buying House",
    ],
  },
];
