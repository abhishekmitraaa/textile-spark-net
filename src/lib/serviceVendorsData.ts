// Service Vendors — shared data for the listing + profile pages. JSX-free.

export interface ServiceReview { id: string; client: string; project: string; rating: number; timeAgo: string; text: string; helpful: number }
export interface ServicePortfolioItem { title: string; category: string; image: string }
export interface ServiceOffered { name: string; price: string }

export interface ServiceVendor {
  id: string;
  name: string;
  serviceType: string;      // coral badge, e.g. "Photography", "Shipping & Logistics"
  categoryId: string;       // maps to the category pills
  description: string;      // one-line sub text in list view
  rating: number;
  reviewsCount: number;
  location: string;         // "City, State"
  verified: boolean;
  image: string;            // listing thumbnail
  cover: string[];          // profile carousel
  tags: string[];           // chips on cards, e.g. "Lookbook Shoots"
  price: string;            // "₹5,000 - ₹50,000" or "₹2 - ₹50/piece"
  productCode: string;      // profile tag, e.g. "Printing Services"
  about: string;
  services: ServiceOffered[];
  experience: string;       // "12 years"
  turnaround: string;       // "5-7 days"
  priceRange: string;       // "₹15 - ₹50 per piece"
  portfolio: ServicePortfolioItem[];
  reviews: ServiceReview[];
}

export const SERVICE_CATEGORIES = [
  { id: "all", label: "All Services", icon: "Building2" },
  { id: "printing", label: "Printing & Manufacturing", icon: "Palette" },
  { id: "logistics", label: "Logistics & Supply Chain", icon: "Truck" },
  { id: "it", label: "IT/Software & SaaS", icon: "Monitor" },
  { id: "finance", label: "Finance & Compliance", icon: "Calculator" },
  { id: "marketing", label: "Marketing/PR/Photography", icon: "Camera" },
  { id: "machinery", label: "Machinery & Equipment", icon: "Wrench" },
] as const;

const P = (s: string) => `https://images.unsplash.com/photo-${s}?w=700&q=80&auto=format&fit=crop`;

const PHOTO_PORTFOLIO: ServicePortfolioItem[] = [
  { title: "Summer Ethnic Collection", category: "Womenswear", image: P("1490481651871-ab68de25d43d") },
  { title: "Contemporary Fusion", category: "Indo-Western", image: P("1483985988355-763728e1935b") },
  { title: "Festive Wear 2024", category: "Ethnic", image: P("1595777457583-95e059d581b8") },
  { title: "Resort Collection", category: "Casual", image: P("1441984904996-e0b6ba687e04") },
];
const PRINT_PORTFOLIO: ServicePortfolioItem[] = [
  { title: "Screen Print Run", category: "Cotton Tees", image: P("1503342217505-b0a15ec3261c") },
  { title: "Sublimation Batch", category: "Sportswear", image: P("1489987707025-afc232f7ea0f") },
  { title: "Embroidery Set", category: "Polos", image: P("1520006403909-838d6b92c22e") },
  { title: "DTG Sample", category: "Streetwear", image: P("1523381210434-271e8be1f52b") },
];
const LOGISTICS_PORTFOLIO: ServicePortfolioItem[] = [
  { title: "Container Export", category: "Sea Freight", image: P("1586528116311-ad8dd3c8310d") },
  { title: "Warehouse Ops", category: "Fulfilment", image: P("1553413077-190dd305871c") },
  { title: "Air Cargo", category: "Express", image: P("1601584115197-04ecc0da31d7") },
  { title: "Last-mile Fleet", category: "Delivery", image: P("1519003722824-194d4455a60c") },
];
const GENERIC_PORTFOLIO: ServicePortfolioItem[] = [
  { title: "Client Dashboard", category: "Product", image: P("1460925895917-afdab827c52f") },
  { title: "Onboarding Flow", category: "UX", image: P("1551288049-bebda4e38f71") },
  { title: "Analytics Suite", category: "Reporting", image: P("1551434678-e076c223a692") },
  { title: "Mobile App", category: "iOS / Android", image: P("1512941937669-90a1b58e7e9c") },
];

const REVIEWS_A: ServiceReview[] = [
  { id: "r1", client: "Trendy Exports", project: "Summer Collection 2024", rating: 5, timeAgo: "1 week ago", text: "Delivered exceptional work for our summer collection. Their understanding of our brand and market trends is outstanding.", helpful: 15 },
  { id: "r2", client: "Fashion House Delhi", project: "Catalogue Shoot", rating: 5, timeAgo: "3 weeks ago", text: "Very professional and creative. The output was detailed and production-ready ahead of schedule.", helpful: 10 },
  { id: "r3", client: "Ethnic Boutique", project: "Festive Campaign", rating: 4, timeAgo: "1 month ago", text: "Great work on our festive line. Communication was smooth and we'll definitely work with them again.", helpful: 7 },
];
const REVIEWS_B: ServiceReview[] = [
  { id: "r1", client: "Urban Threads", project: "Bulk Print Order", rating: 5, timeAgo: "5 days ago", text: "Colour accuracy and finish were spot on across 2,000 units. Turnaround beat every other quote we got.", helpful: 21 },
  { id: "r2", client: "Kraft Apparel", project: "Sampling Run", rating: 4, timeAgo: "2 weeks ago", text: "Solid sampling support and fair pricing. Minor delay on one batch but they kept us informed.", helpful: 9 },
  { id: "r3", client: "NorthStar Retail", project: "Repeat Production", rating: 5, timeAgo: "1 month ago", text: "Consistent quality across repeat orders. Now our default vendor for printed goods.", helpful: 12 },
];

const base = (over: Partial<ServiceVendor>): ServiceVendor => ({
  id: "", name: "", serviceType: "Service", categoryId: "printing",
  description: "", rating: 4.8, reviewsCount: 120, location: "Mumbai, Maharashtra",
  verified: true, image: P("1558618666-fcd25c85cd64"), cover: PRINT_PORTFOLIO.map((p) => p.image).slice(0, 3),
  tags: [], price: "₹15 - ₹100/piece", productCode: "Manufacturing Services",
  about: "An experienced team delivering reliable, high-quality service to fashion and textile brands across India.",
  services: [], experience: "10 years", turnaround: "5-7 days", priceRange: "₹15 - ₹50 per piece",
  portfolio: GENERIC_PORTFOLIO, reviews: REVIEWS_A, ...over,
});

export const SERVICE_VENDORS: ServiceVendor[] = [
  base({
    id: "printcraft-studios", name: "PrintCraft Studios", serviceType: "Fashion Photography", categoryId: "marketing",
    description: "Fashion & apparel product photography, lookbooks and catalogue design for D2C brands.",
    rating: 4.9, reviewsCount: 127, location: "Noida, Uttar Pradesh",
    image: P("1542038784456-1ea8e935640e"), cover: PHOTO_PORTFOLIO.map((p) => p.image).slice(0, 3),
    tags: ["Lookbook Shoots", "E-commerce Photography", "Catalogue Design"],
    price: "₹15,000 - ₹50,000", productCode: "Photography Services",
    about: "We are a team of experienced photographers specializing in fashion and apparel product photography. With over 10 years in the industry, we've worked with leading brands across India to create stunning visual content that drives sales.",
    services: [
      { name: "Lookbook Shoots", price: "₹15k - 20k" },
      { name: "E-commerce Photography", price: "₹15k - 20k" },
      { name: "Catalogue Design", price: "₹15k - 20k" },
    ],
    experience: "12 years", turnaround: "5-7 days", priceRange: "₹15 - ₹50 per piece",
    portfolio: PHOTO_PORTFOLIO, reviews: REVIEWS_A,
  }),
  base({
    id: "studiokraft-solutions", name: "StudioKraft Solutions", serviceType: "Photography", categoryId: "marketing",
    description: "Studio and on-location shoots — lookbooks, e-commerce catalogues and social content.",
    rating: 4.9, reviewsCount: 168, location: "Mumbai, Maharashtra",
    image: P("1512790182412-b19e6d62bc39"), cover: PHOTO_PORTFOLIO.map((p) => p.image).slice(1, 4),
    tags: ["Lookbook Shoots", "E-commerce Photography"],
    price: "₹5,000 - ₹50,000", productCode: "Photography Services",
    about: "A boutique fashion photography studio delivering high-converting product and campaign imagery for marketplace and D2C brands.",
    services: [
      { name: "Product Photography", price: "₹5k - 12k" },
      { name: "Lookbook Shoots", price: "₹18k - 30k" },
      { name: "Reels & Social Content", price: "₹10k - 20k" },
    ],
    experience: "8 years", turnaround: "2-3 days", priceRange: "₹500 - ₹2,000 per shot",
    portfolio: PHOTO_PORTFOLIO, reviews: REVIEWS_A,
  }),
  base({
    id: "fasttrack-logistics", name: "FastTrack Logistics", serviceType: "Shipping & Logistics", categoryId: "logistics",
    description: "End-to-end supply chain — air freight, container shipping and custom-cleared exports.",
    rating: 4.7, reviewsCount: 189, location: "Delhi NCR",
    image: P("1586528116311-ad8dd3c8310d"), cover: LOGISTICS_PORTFOLIO.map((p) => p.image).slice(0, 3),
    tags: ["Air Freight", "Container Shipping", "Custom Quote"],
    price: "Custom Quote", productCode: "Logistics Services",
    about: "A full-service logistics partner for the apparel industry — from factory pickup and warehousing to export documentation and last-mile delivery across India and the GCC.",
    services: [
      { name: "Air Freight", price: "From ₹120/kg" },
      { name: "Container Shipping", price: "Custom Quote" },
      { name: "Warehousing & Fulfilment", price: "From ₹8/unit" },
    ],
    experience: "14 years", turnaround: "Same day pickup", priceRange: "Custom per lane",
    portfolio: LOGISTICS_PORTFOLIO, reviews: REVIEWS_B,
  }),
  base({
    id: "embroidery-hub", name: "Embroidery Hub", serviceType: "Embroidery & Manufacturing", categoryId: "printing",
    description: "Machine and hand embroidery, sequin and zari work for ethnic and premium apparel.",
    rating: 4.8, reviewsCount: 203, location: "Surat, Gujarat",
    image: P("1520006403909-838d6b92c22e"), cover: PRINT_PORTFOLIO.map((p) => p.image).slice(0, 3),
    tags: ["Machine Embroidery", "Hand Embroidery", "Sequin Work"],
    price: "₹2 - ₹50/piece", productCode: "Manufacturing Services",
    about: "A specialist embroidery house running 40+ multi-head machines alongside a skilled hand-work karigar team, delivering intricate detailing at scale for exporters and boutiques.",
    services: [
      { name: "Machine Embroidery", price: "₹2 - 20/pc" },
      { name: "Hand Embroidery", price: "₹30 - 50/pc" },
      { name: "Sequin & Zari Work", price: "₹15 - 40/pc" },
    ],
    experience: "18 years", turnaround: "4-6 days", priceRange: "₹2 - ₹50 per piece",
    portfolio: PRINT_PORTFOLIO, reviews: REVIEWS_B,
  }),
  base({
    id: "printmasters-india", name: "PrintMasters India", serviceType: "Textile Printing", categoryId: "printing",
    description: "Full-service textile printing — screen, digital and sublimation with 20+ years experience.",
    rating: 4.6, reviewsCount: 156, location: "Tiruppur, Tamil Nadu",
    image: P("1558618666-fcd25c85cd64"), cover: PRINT_PORTFOLIO.map((p) => p.image).slice(1, 4),
    tags: ["Screen Printing", "Digital Printing", "Sublimation"],
    price: "₹15 - ₹100/piece", productCode: "Printing Services",
    about: "Tiruppur's trusted printing partner offering screen, digital and sublimation printing under one roof, with in-house colour matching and export-grade quality control.",
    services: [
      { name: "Screen Printing", price: "₹15 - 40/pc" },
      { name: "Digital Printing (DTG)", price: "₹40 - 100/pc" },
      { name: "Sublimation", price: "₹25 - 60/pc" },
    ],
    experience: "22 years", turnaround: "3-5 days", priceRange: "₹15 - ₹100 per piece",
    portfolio: PRINT_PORTFOLIO, reviews: REVIEWS_B,
  }),
  base({
    id: "techfashion-solutions", name: "TechFashion Solutions", serviceType: "IT / Software & SaaS", categoryId: "it",
    description: "ERP, inventory and e-commerce software tailored for fashion and textile businesses.",
    rating: 4.8, reviewsCount: 96, location: "Bengaluru, Karnataka",
    image: P("1460925895917-afdab827c52f"), cover: GENERIC_PORTFOLIO.map((p) => p.image).slice(0, 3),
    tags: ["ERP Systems", "E-commerce", "Inventory Software"],
    price: "₹10,000/mo onwards", productCode: "IT Services",
    about: "A product studio building ERP, POS and D2C commerce systems purpose-built for apparel — from raw-material planning to omnichannel inventory sync.",
    services: [
      { name: "ERP Implementation", price: "₹40k - 1.5L" },
      { name: "E-commerce Storefront", price: "₹40k - 80k" },
      { name: "Inventory & POS", price: "₹10k/mo" },
    ],
    experience: "9 years", turnaround: "Custom", priceRange: "₹10k - ₹1.5L per project",
    portfolio: GENERIC_PORTFOLIO, reviews: REVIEWS_A,
  }),
  base({
    id: "compliancefirst", name: "ComplianceFirst", serviceType: "Finance & Compliance", categoryId: "finance",
    description: "GST filing, export documentation and financial compliance for textile exporters.",
    rating: 4.6, reviewsCount: 98, location: "Surat, Gujarat",
    image: P("1554224155-6726b3ff858f"), cover: GENERIC_PORTFOLIO.map((p) => p.image).slice(1, 4),
    tags: ["GST Filing", "Export Docs", "Audit Services"],
    price: "₹5,000/mo onwards", productCode: "Finance Services",
    about: "A chartered team handling GST, export incentives, DGFT documentation and audits for textile exporters, keeping compliance airtight so brands can focus on growth.",
    services: [
      { name: "GST Filing & Returns", price: "₹5k/mo" },
      { name: "Export Documentation", price: "₹3k - 8k" },
      { name: "Audit & Tax Planning", price: "Custom Quote" },
    ],
    experience: "16 years", turnaround: "As needed", priceRange: "₹3k - ₹15k per filing",
    portfolio: GENERIC_PORTFOLIO, reviews: REVIEWS_A,
  }),
  base({
    id: "textilemach-pro", name: "TextileMach Pro", serviceType: "Machinery & Equipment", categoryId: "machinery",
    description: "Industrial sewing and cutting equipment sales, servicing and spare parts.",
    rating: 4.7, reviewsCount: 145, location: "Ludhiana, Punjab",
    image: P("1565193566173-7a0ee3dbe261"), cover: GENERIC_PORTFOLIO.map((p) => p.image).slice(0, 3),
    tags: ["Machine Sales", "Maintenance", "Spare Parts"],
    price: "₹25,000 onwards", productCode: "Equipment Services",
    about: "A machinery supplier and service network for garment units — from single-needle lockstitch to automated cutting, with AMC support and genuine spares.",
    services: [
      { name: "Machine Sales", price: "₹25k onwards" },
      { name: "Maintenance & AMC", price: "₹2k - 8k/visit" },
      { name: "Spare Parts & Training", price: "Custom Quote" },
    ],
    experience: "20 years", turnaround: "1-2 weeks", priceRange: "₹25k - ₹5L per unit",
    portfolio: GENERIC_PORTFOLIO, reviews: REVIEWS_B,
  }),
];

export const getServiceVendor = (id: string) => SERVICE_VENDORS.find((v) => v.id === id);
