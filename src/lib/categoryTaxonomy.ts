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
  image: string;       // banner / rail image
  images: string[];    // pool cycled across subcategory tiles
  target: CategoryTarget;
  subs: SubCategory[];
}

const P = (s: string) => `https://images.unsplash.com/photo-${s}?w=500&q=80&auto=format&fit=crop`;

const APPAREL_IMGS = [
  P("1521572163474-6864f9cf17ab"), P("1583743814966-8936f5b7be1a"), P("1489987707025-afc232f7ea0f"),
  P("1618354691373-d851c5c3a990"), P("1596755094514-f87e34085b2c"), P("1503341504253-dff4815485f1"),
  P("1434389677669-e08b4cac3105"), P("1556905055-8f358a7a47b2"),
];
const WOMENS_IMGS = [
  P("1595777457583-95e059d581b8"), P("1490481651871-ab68de25d43d"), P("1483985988355-763728e1935b"),
  P("1502716119720-b23a93e5fe1b"), P("1469334031218-e382a71b716b"), P("1434389677669-e08b4cac3105"),
  P("1525507119028-ed4c629a60a3"), P("1487222477894-8943e31ef7b2"),
];
const KIDS_IMGS = [
  P("1519238263530-99bdd11df2ea"), P("1503919545889-aef636e10ad4"), P("1522771930-c13a09b19f2a"),
  P("1518831959646-742c3a14ebf7"), P("1476234251651-f353703a034d"), P("1607453998774-d533f65dac99"),
];
const FOOT_IMGS = [
  P("1542291026-7eec264c27ff"), P("1560769629-975ec94e6a86"), P("1595950653106-6c9ebd614d3a"),
  P("1543163521-1bf539c55dd2"), P("1491553895911-0055eca6402d"),
];
const ACC_IMGS = [
  P("1584917865442-de89df76afd3"), P("1523275335684-37898b6baf30"), P("1509941943102-10c232535736"),
  P("1611085583191-a3b181a88401"), P("1553062407-98eeb64c6a62"), P("1508296695146-257a814070b4"),
  P("1517686469429-8bdb88b9f907"), P("1620625515032-6ed0c1790c75"),
];
const BEAUTY_IMGS = [
  P("1596462502278-27bfdc403348"), P("1522335789203-aabd1fc54bc9"), P("1512496015851-a90fb38ba796"),
  P("1571781926291-c477ebfd024b"), P("1585652757173-57de5e9fab42"), P("1620916566398-39f1143ab7be"),
];
const PACK_IMGS = [
  P("1607166452427-7e4477079cb9"), P("1553413077-190dd305871c"), P("1586528116311-ad8dd3c8310d"),
  P("1608528577891-eb055944f2e7"), P("1602522797324-3d16c6c1a6e3"),
];
const RAW_IMGS = [
  P("1519751138087-5bf79df62d5b"), P("1558769132-cb1aea458c5e"), P("1620799140408-edc6dcb6d633"),
  P("1594612076020-3ad2a5b9d1f8"), P("1528459801416-a9e53bbf4e17"), P("1606924842584-4d6b9f0f0f1a"),
];
const TRIM_IMGS = [
  P("1591561954557-26941169b49e"), P("1610701596007-11502861dcfa"), P("1600166898405-da9535204843"),
  P("1584100936595-c0654b55a2e6"), P("1522708323590-d24dbb6b0267"), P("1567016432779-094069958ea5"),
];
const SERVICE_IMGS = [
  P("1558769132-cb1aea458c5e"), P("1581092160562-40aa08e78837"), P("1521737604893-d14cc237f11d"),
  P("1454165804606-c3d57bc86b40"), P("1552664730-d307ca884978"), P("1542038784456-1ea8e935640e"),
];
const FREELANCE_IMGS = [
  P("1494790108377-be9c29b29330"), P("1507003211169-0a1dd7228f2d"), P("1438761681033-6461ffad8d80"),
  P("1472099645785-5658abf4ff4e"), P("1500648767791-00dcc994a43e"), P("1534528741775-53994a69daeb"),
];

const sub = (labels: string[], group?: string): SubCategory[] => labels.map((label) => ({ label, group }));

export const CATEGORY_TAXONOMY: TopCategory[] = [
  {
    id: "menswear", label: "Menswear", icon: "Shirt", target: "products",
    blurb: "T-shirts, shirts, ethnic, sportswear, suits & more",
    image: bannerMenswear, images: APPAREL_IMGS,
    subs: sub([
      "T-Shirts", "Shirts", "Bottomwear", "Ethnic Wear", "Co-ord Sets",
      "Sportswear — Upper Body", "Sportswear — Lower Body", "Summer Jackets",
      "Winterwear", "Formal Suits", "Innerwear",
    ]),
  },
  {
    id: "womenswear", label: "Womenswear", icon: "Flower2", target: "products",
    blurb: "Dresses, ethnic, tops, lingerie, maternity & more",
    image: bannerWomenswear, images: WOMENS_IMGS,
    subs: [
      ...sub(["T-Shirts", "Tops / Blouses / Shirts", "Dresses", "Jumpsuits & Playsuits", "Bottomwear", "Skirts", "Ethnic Wear", "Saree", "Nightwear & Loungewear", "Jackets & Shrugs", "Formal Suits", "Winterwear", "Sportswear — Upper Body", "Sportswear — Lower Body", "Maternity Wear"], "Womenswear"),
      ...sub(["Bra", "Panties", "Lingerie Sets", "Shapewear"], "Lingerie & Shapewear"),
    ],
  },
  {
    id: "kidswear", label: "Kids' Wear", icon: "Baby", target: "products",
    blurb: "Babywear, frocks, co-ord sets, ethnic & winterwear",
    image: bannerKidswear, images: KIDS_IMGS,
    subs: sub([
      "Babywear / Onesies", "T-shirts, Vests & Tops", "Frocks / Dresses",
      "Co-ords / Sets", "Bottomwear", "Winterwear", "Ethnic Wear",
    ]),
  },
  {
    id: "footwear", label: "Footwear", icon: "Footprints", target: "products",
    blurb: "Men's, women's & kids' shoes, sandals & more",
    image: bannerFootwear, images: FOOT_IMGS,
    subs: sub(["Men's Footwear", "Women's Footwear", "Kids' Footwear"]),
  },
  {
    id: "accessories", label: "Fashion Accessories", icon: "Watch", target: "products",
    blurb: "Bags, belts, caps, jewellery, watches, socks & more",
    image: bannerAccessories, images: ACC_IMGS,
    subs: sub([
      "Bags", "Belts", "Caps & Hats", "Scarves & Stoles", "Sunglasses", "Watches",
      "Jewellery", "Bibs", "Hair Accessories", "Office Accessories", "Umbrellas",
      "Phone Cases", "Socks", "Gloves",
    ]),
  },
  {
    id: "beauty", label: "Beauty & Cosmetics", icon: "Sparkles", target: "products",
    blurb: "Skincare, makeup, haircare, fragrances, tools & devices",
    image: bannerBeauty, images: BEAUTY_IMGS,
    subs: sub([
      "Skincare", "Makeup", "Lip Products", "Eye & Brow Products", "Hair & Scalp",
      "Nail Products", "Fragrances", "Bath & Body", "Beauty Tools & Accessories",
      "Men's Grooming", "Beauty Devices",
    ]),
  },
  {
    id: "packaging", label: "Packaging", icon: "Package", target: "products",
    blurb: "Polybags, paper bags, boxes, envelopes & ziplocks",
    image: bannerPackaging, images: PACK_IMGS,
    subs: sub([
      "Packaging Bags & Polybags", "Paper Bags", "Corrugated Boxes",
      "Garment Boxes", "Envelope Packaging", "Ziplock Bags",
    ]),
  },
  {
    id: "raw-materials", label: "Raw Materials", icon: "Layers", target: "products",
    blurb: "Fabrics, yarn, thread, laces, dyes, chemicals & finishes",
    image: bannerRawMaterials, images: RAW_IMGS,
    subs: sub([
      "Fabrics", "Yarn", "Lining & Interlining", "Thread", "Laces & Nets",
      "Tapes & Cords", "Elastics", "Dyes", "Chemicals", "Finishes", "Labels & Tags",
    ]),
  },
  {
    id: "trims-home", label: "Trims & Home Textile", icon: "Scissors", target: "products",
    blurb: "Buttons, zippers, patches, mannequins & home textile",
    image: bannerTrimsHome, images: TRIM_IMGS,
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
    image: bannerServices, images: SERVICE_IMGS,
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
    image: bannerFreelancers, images: FREELANCE_IMGS,
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
