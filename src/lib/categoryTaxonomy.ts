// Buyer-side category taxonomy — condensed from COSORA_CATEGORY_TAXONOMY.md.
// The browse page's job is navigation (category → subcategory → results); the
// long material/GSM/pattern option lists live in the Search Results filters,
// not here. JSX-free.

import bannerMenswear from "@/assets/categories/banners/menswear.jpg";
import bannerWomenswear from "@/assets/categories/banners/womenswear.jpg";
import bannerKidswear from "@/assets/categories/banners/kidswear.jpg";
import bannerFootwear from "@/assets/categories/banners/footwear.jpg";
import bannerAccessories from "@/assets/categories/banners/accessories.jpg";
import bannerBeauty from "@/assets/categories/banners/beauty.jpg";
import bannerPackaging from "@/assets/categories/banners/packaging.jpg";
import bannerRawMaterials from "@/assets/categories/banners/raw-materials.jpg";
import bannerTrimsHome from "@/assets/categories/banners/trims-home.jpg";
import bannerServices from "@/assets/categories/banners/services.jpg";
import bannerFreelancers from "@/assets/categories/banners/freelancers.jpg";

export type CategoryTarget = "products" | "services" | "freelancers";

export interface SubCategory {
  label: string;
  group?: string; // optional section header within a category
}

export interface TopCategory {
  id: string;
  label: string;
  icon: string;        // lucide-react icon name (resolved in the page)
  blurb: string;
  image: string;       // banner; each sub-category's tile picture is in categoryTileImages.ts
  target: CategoryTarget;
  subs: SubCategory[];
}

const sub = (labels: string[], group?: string): SubCategory[] => labels.map((label) => ({ label, group }));

export const CATEGORY_TAXONOMY: TopCategory[] = [
  {
    id: "menswear", label: "Menswear", icon: "Shirt", target: "products",
    blurb: "T-shirts, shirts, ethnic, sportswear, suits & more",
    image: bannerMenswear,
    subs: sub([
      "T-Shirts", "Shirts", "Bottomwear", "Ethnic Wear", "Co-ord Sets",
      "Sportswear — Upper Body", "Sportswear — Lower Body", "Summer Jackets",
      "Winterwear", "Formal Suits", "Innerwear",
    ]),
  },
  {
    id: "womenswear", label: "Womenswear", icon: "Flower2", target: "products",
    blurb: "Dresses, ethnic, tops, lingerie, maternity & more",
    image: bannerWomenswear,
    subs: [
      ...sub(["T-Shirts", "Tops / Blouses / Shirts", "Dresses", "Jumpsuits & Playsuits", "Bottomwear", "Skirts", "Ethnic Wear", "Saree", "Nightwear & Loungewear", "Jackets & Shrugs", "Formal Suits", "Winterwear", "Sportswear — Upper Body", "Sportswear — Lower Body", "Maternity Wear"], "Womenswear"),
      ...sub(["Bra", "Panties", "Lingerie Sets", "Shapewear"], "Lingerie & Shapewear"),
    ],
  },
  {
    id: "kidswear", label: "Kids' Wear", icon: "Baby", target: "products",
    blurb: "Babywear, frocks, co-ord sets, ethnic & winterwear",
    image: bannerKidswear,
    subs: sub([
      "Babywear / Onesies", "T-shirts, Vests & Tops", "Frocks / Dresses",
      "Co-ords / Sets", "Bottomwear", "Winterwear", "Ethnic Wear",
    ]),
  },
  {
    id: "footwear", label: "Footwear", icon: "Footprints", target: "products",
    blurb: "Men's, women's & kids' shoes, sandals & more",
    image: bannerFootwear,
    subs: sub(["Men's Footwear", "Women's Footwear", "Kids' Footwear"]),
  },
  {
    id: "accessories", label: "Fashion Accessories", icon: "Watch", target: "products",
    blurb: "Bags, belts, caps, jewellery, watches, socks & more",
    image: bannerAccessories,
    subs: sub([
      "Bags", "Belts", "Caps & Hats", "Scarves & Stoles", "Sunglasses", "Watches",
      "Jewellery", "Bibs", "Hair Accessories", "Office Accessories", "Umbrellas",
      "Phone Cases", "Socks", "Gloves",
    ]),
  },
  {
    id: "beauty", label: "Beauty & Cosmetics", icon: "Sparkles", target: "products",
    blurb: "Skincare, makeup, haircare, fragrances, tools & devices",
    image: bannerBeauty,
    subs: sub([
      "Skincare", "Makeup", "Lip Products", "Eye & Brow Products", "Hair & Scalp",
      "Nail Products", "Fragrances", "Bath & Body", "Beauty Tools & Accessories",
      "Men's Grooming", "Beauty Devices",
    ]),
  },
  {
    id: "packaging", label: "Packaging", icon: "Package", target: "products",
    blurb: "Polybags, paper bags, boxes, envelopes & ziplocks",
    image: bannerPackaging,
    subs: sub([
      "Packaging Bags & Polybags", "Paper Bags", "Corrugated Boxes",
      "Garment Boxes", "Envelope Packaging", "Ziplock Bags",
    ]),
  },
  {
    id: "raw-materials", label: "Raw Materials", icon: "Layers", target: "products",
    blurb: "Fabrics, yarn, thread, laces, dyes, chemicals & finishes",
    image: bannerRawMaterials,
    subs: sub([
      "Fabrics", "Yarn", "Lining & Interlining", "Thread", "Laces & Nets",
      "Tapes & Cords", "Elastics", "Dyes", "Chemicals", "Finishes", "Labels & Tags",
    ]),
  },
  {
    id: "trims-home", label: "Trims & Home Textile", icon: "Scissors", target: "products",
    blurb: "Buttons, zippers, patches, mannequins & home textile",
    image: bannerTrimsHome,
    subs: [
      ...sub(["Buttons", "Zippers", "Hook & Eye", "Velcro Tape", "Drawcords & Toggles", "Eyelets & Grommets", "Rivets & Studs", "Cord Locks & Stoppers", "Patches", "Tassels & Fringes"], "Trims & Accessories"),
      ...sub(["Mannequins & Display"], "Display"),
      ...sub(["Bedding & Bed Linen", "Towels & Bath Linen", "Curtains & Drapes", "Cushions & Covers", "Table Linen", "Carpets & Rugs", "Upholstery Fabric", "Kitchen Textiles"], "Home Textile"),
      ...sub(["Industrial / Uniform"], "Uniform"),
    ],
  },
  {
    id: "services", label: "B2B Services", icon: "Wrench", target: "services",
    blurb: "Printing, manufacturing, logistics, IT, finance & machinery",
    image: bannerServices,
    subs: [
      ...sub(["Dyeing", "Printing", "Embroidery", "Processing & Finishing"], "Printing, Dyeing & Finishing"),
      ...sub(["Stitching / Garmenting", "Cutting", "Final Packaging", "Quality Check (QC)", "Pattern Making / CAD", "Tech Pack Development", "Fashion Designing", "Fabric & Trims Sourcing"], "Manufacturing & Fashion Ops"),
      ...sub(["Logistics & Transportation", "Warehousing", "Import / Export Handling"], "Logistics & Supply Chain"),
      ...sub(["App Development", "ERP / SaaS Software", "CRM & Automation", "Accounting & Billing Software", "B2B Directory Listings"], "IT, Software & SaaS"),
      ...sub(["Accounting Services", "Income Tax Filing", "Business Registration", "Fundraising Support"], "Finance & Compliance"),
      ...sub(["Marketing", "E-commerce", "Brand Consulting", "Social Media Marketing", "Performance Marketing", "Public Relations", "Photography"], "Marketing / PR / Photography"),
      ...sub(["Sewing Machines", "Cutting Machines", "Pressing & Finishing", "Embroidery Machines", "Printing Machines", "Washing & Finishing", "Packaging Machinery", "Testing & QC Equipment"], "Machinery & Equipment"),
      ...sub(["Thrift / Resale", "Dead Stock & Surplus", "Vintage & Retro", "Upcycled & Reworked", "Rental Fashion", "Fabric Scrap & Recycling"], "Thrift & Second-Hand"),
    ],
  },
  {
    id: "freelancers", label: "Freelancer Services", icon: "Briefcase", target: "freelancers",
    blurb: "Designers, tech-packs, sourcing, marketing, photography & more",
    image: bannerFreelancers,
    subs: sub([
      "Fashion Designing", "Tech Pack Creation", "All Item Sourcing", "Garment Fit Consulting",
      "E-commerce", "Marketing & Sales", "Performance Marketing", "Influencer Marketing",
      "PR & Media", "Software Support", "CRM & Customer Support", "Financial Consulting",
      "Accounting & Bookkeeping", "Legal & Compliance", "Photography & Videography",
      "Content Creation", "Cataloging", "Model Coordination", "Styling Services",
      "Warehouse & Logistics", "Product Sampling",
    ]),
  },
];

// Destination route for a subcategory tap.
export const subCategoryHref = (cat: TopCategory, s: SubCategory): string => {
  if (cat.target === "services") return "/services";
  if (cat.target === "freelancers") return "/freelancers";
  return `/search/results?category=${encodeURIComponent(s.label)}`;
};

// Flat index for the cross-category search box.
export interface FlatSub { category: TopCategory; sub: SubCategory }
export const flatSubcategories = (): FlatSub[] =>
  CATEGORY_TAXONOMY.flatMap((category) => category.subs.map((sub) => ({ category, sub })));
