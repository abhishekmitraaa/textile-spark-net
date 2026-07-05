// Freelancers & Experts — shared data for the listing + profile pages. JSX-free.

export interface FreelancerReview { id: string; client: string; project: string; rating: number; timeAgo: string; text: string; helpful: number }
export interface PortfolioItem { title: string; category: string; image: string }
export interface ServiceOffered { name: string; price: string }
export interface Education { title: string; org: string; year: string }

export interface Freelancer {
  id: string;
  name: string;
  title: string;         // role, e.g. "Senior Fashion Designer"
  specialty: string;     // e.g. "Womenswear & Ethnic"
  categoryId: string;
  rating: number;
  reviewsCount: number;
  location: string;      // "City, Country"
  online: boolean;
  verified: boolean;
  avatar: string;
  cover: string[];       // header carousel images
  hourlyRate: number;    // ₹/hr
  projectRate: string;   // "₹25k"
  experienceYears: number;
  turnaround: string;
  priceRange: string;
  tags: string[];
  about: string;
  services: ServiceOffered[];
  skills: string[];
  education: Education[];
  portfolio: PortfolioItem[];
  reviews: FreelancerReview[];
}

export const FREELANCER_CATEGORIES = [
  { id: "all", label: "All Experts" },
  { id: "designer", label: "Fashion Designing" },
  { id: "techpack", label: "Tech Pack Creation" },
  { id: "sourcing", label: "Fabric & Trim Sourcing" },
  { id: "marketing", label: "Performance & Influencer Marketing" },
  { id: "photography", label: "Photography & Videography" },
  { id: "uiux", label: "UI/UX & Website Development" },
];

const P = (s: string) => `https://images.unsplash.com/photo-${s}?w=600&q=80&auto=format&fit=crop`;
const A = (s: string) => `https://images.unsplash.com/photo-${s}?w=200&h=200&q=80&auto=format&fit=crop`;

const DESIGN_PORTFOLIO: PortfolioItem[] = [
  { title: "Summer Ethnic Collection", category: "Womenswear", image: P("1490481651871-ab68de25d43d") },
  { title: "Contemporary Fusion", category: "Indo-Western", image: P("1483985988355-763728e1935b") },
  { title: "Festive Wear 2024", category: "Ethnic", image: P("1595777457583-95e059d581b8") },
  { title: "Resort Collection", category: "Casual", image: P("1441984904996-e0b6ba687e04") },
];
const PHOTO_PORTFOLIO: PortfolioItem[] = [
  { title: "E-commerce Catalogue", category: "Product", image: P("1441986300917-64674bd600d8") },
  { title: "Editorial Lookbook", category: "Fashion", image: P("1469334031218-e382a71b716b") },
  { title: "Campaign Shoot", category: "Campaign", image: P("1524504388940-b1c1722653e1") },
  { title: "Studio Series", category: "Studio", image: P("1492707892479-7bc8d5a4ee93") },
];

const REVIEWS_DESIGN: FreelancerReview[] = [
  { id: "r1", client: "Trendy Exports", project: "Summer Collection 2024", rating: 5, timeAgo: "1 week ago", text: "Priya delivered exceptional designs for our summer collection. Her understanding of market trends is outstanding.", helpful: 15 },
  { id: "r2", client: "Fashion House Delhi", project: "Tech Pack Development", rating: 5, timeAgo: "3 weeks ago", text: "Very professional and creative. The tech packs were detailed and production-ready.", helpful: 10 },
  { id: "r3", client: "Ethnic Boutique", project: "Ethnic Fusion Collection", rating: 4, timeAgo: "1 month ago", text: "Great work on our ethnic fusion line. Would definitely work with her again.", helpful: 7 },
];

const designerBase = (over: Partial<Freelancer>): Freelancer => ({
  id: "", name: "", title: "Fashion Designer", specialty: "Womenswear", categoryId: "designer",
  rating: 4.8, reviewsCount: 80, location: "Mumbai, India", online: true, verified: true,
  avatar: A("1494790108377-be9c29b29330"), cover: DESIGN_PORTFOLIO.map((p) => p.image).slice(0, 3),
  hourlyRate: 2500, projectRate: "₹25k", experienceYears: 8, turnaround: "5-7 days", priceRange: "₹15 - ₹50 per piece",
  tags: ["Womenswear", "Sustainable Fashion"],
  about: "Award-winning fashion designer specializing in sustainable womenswear and ethnic fusion, with a decade of experience designing for D2C brands and exporters across India and the GCC.",
  services: [
    { name: "Collection Design", price: "₹15k - 20k" },
    { name: "Tech Pack Creation", price: "₹8k - 12k" },
    { name: "Pattern & Sampling", price: "₹10k - 15k" },
  ],
  skills: ["Tech Pack Creation", "CAD Design", "Pattern Making", "Trend Forecasting", "Color Theory", "Fabric Selection"],
  education: [
    { title: "B.Des Fashion Design", org: "NIFT Mumbai", year: "2016" },
    { title: "Advanced Pattern Making", org: "Pearl Academy", year: "2018" },
  ],
  portfolio: DESIGN_PORTFOLIO,
  reviews: REVIEWS_DESIGN,
  ...over,
});

export const FREELANCERS: Freelancer[] = [
  designerBase({
    id: "priya-sharma", name: "Priya Sharma", title: "Senior Fashion Designer", specialty: "Womenswear & Ethnic",
    rating: 4.9, reviewsCount: 89, location: "Mumbai, India", hourlyRate: 2500, projectRate: "₹25k", experienceYears: 12,
    tags: ["Womenswear", "Sustainable Fashion"], avatar: A("1494790108377-be9c29b29330"),
  }),
  designerBase({
    id: "vikram-singh", name: "Vikram Singh", title: "Senior Fashion Designer", specialty: "Menswear",
    rating: 4.8, reviewsCount: 74, location: "Delhi, India", hourlyRate: 2500, projectRate: "₹22k", experienceYears: 9,
    tags: ["Menswear", "Sustainable Fashion"], avatar: A("1507003211169-0a1dd7228f2d"),
  }),
  designerBase({
    id: "riya-menon", name: "Riya Menon", title: "Fashion Illustrator", categoryId: "designer", specialty: "Digital Art & Sketches",
    rating: 4.6, reviewsCount: 132, location: "Bangalore, India", hourlyRate: 1500, projectRate: "₹12k", experienceYears: 5,
    tags: ["Digital Art", "Hand Sketches"], avatar: A("1438761681033-6461ffad8d80"),
    skills: ["Technical Drawing", "Illustration", "Adobe Suite", "Procreate", "Color Theory", "Storyboarding"],
  }),
  designerBase({
    id: "neeta-krishnan", name: "Neeta Krishnan", title: "Master Pattern Maker", categoryId: "techpack", specialty: "Grading & Marker Making",
    rating: 4.5, reviewsCount: 61, location: "Bangalore, India", hourlyRate: 1300, projectRate: "₹10k", experienceYears: 11,
    tags: ["Grading", "Marker Making"], avatar: A("1580489944761-15a19d654956"),
    services: [{ name: "Tech Pack Creation", price: "₹8k - 12k" }, { name: "Pattern Grading", price: "₹6k - 10k" }, { name: "Marker Making", price: "₹4k - 8k" }],
    skills: ["Optitex", "Tukatech", "Grading", "Marker Making", "Tech Packs", "Consumption Costing"],
  }),
  designerBase({
    id: "arjun-das", name: "Arjun Das", title: "Fashion Photographer", categoryId: "photography", specialty: "Lookbook & E-commerce",
    rating: 4.7, reviewsCount: 145, location: "Mumbai, India", hourlyRate: 2000, projectRate: "₹18k", experienceYears: 10,
    tags: ["Lookbook", "E-commerce"], avatar: A("1472099645785-5658abf4ff4e"),
    cover: PHOTO_PORTFOLIO.map((p) => p.image).slice(0, 3), portfolio: PHOTO_PORTFOLIO,
    about: "Professional fashion photographer with studio and on-location expertise, delivering catalogue, lookbook and campaign imagery that converts for D2C and marketplace brands.",
    services: [{ name: "E-commerce Photography", price: "₹15k - 20k" }, { name: "Lookbook Shoot", price: "₹20k - 30k" }, { name: "Catalogue Design", price: "₹12k - 18k" }],
    skills: ["Product Photography", "Editorial", "Lighting", "Retouching", "Art Direction", "Videography"],
    education: [{ title: "Diploma in Photography", org: "Light & Life Academy", year: "2014" }],
  }),
  designerBase({
    id: "aditya-rao", name: "Aditya Rao", title: "Digital Marketing Specialist", categoryId: "marketing", specialty: "Social & Influencer",
    rating: 4.7, reviewsCount: 112, location: "Ahmedabad, India", hourlyRate: 2000, projectRate: "₹20k", experienceYears: 6,
    tags: ["Influencer", "Performance Ads"], avatar: A("1500648767791-00dcc994a43e"),
    about: "Growth marketer for fashion & lifestyle brands, running influencer and performance campaigns with a proven ROAS track record across Meta, Google and YouTube.",
    services: [{ name: "Influencer Campaign", price: "₹25k - 50k" }, { name: "Performance Ads", price: "₹20k - 40k" }, { name: "Content Strategy", price: "₹15k - 25k" }],
    skills: ["Meta Ads", "Google Ads", "Influencer Marketing", "SEO", "Content Strategy", "Analytics"],
    education: [{ title: "MBA Marketing", org: "MICA Ahmedabad", year: "2018" }],
  }),
  designerBase({
    id: "sneha-kapoor", name: "Sneha Kapoor", title: "UI/UX & Web Designer", categoryId: "uiux", specialty: "Shopify & Figma",
    rating: 4.8, reviewsCount: 96, location: "Pune, India", hourlyRate: 1800, projectRate: "₹40k", experienceYears: 7,
    tags: ["Shopify", "Figma"], avatar: A("1534528741775-53994a69daeb"),
    about: "Product & web designer building high-converting D2C storefronts and design systems on Shopify and Webflow, with a strong eye for brand and conversion.",
    services: [{ name: "Shopify Storefront", price: "₹40k - 80k" }, { name: "UI/UX Design", price: "₹25k - 50k" }, { name: "Brand & Design System", price: "₹20k - 35k" }],
    skills: ["Figma", "Shopify", "Webflow", "Design Systems", "Prototyping", "Conversion UX"],
    education: [{ title: "B.Des Interaction Design", org: "MIT Institute of Design", year: "2017" }],
  }),
  designerBase({
    id: "sanjay-gupta", name: "Sanjay Gupta", title: "Textile Sourcing Consultant", categoryId: "sourcing", specialty: "Fabric & Trims",
    rating: 4.9, reviewsCount: 178, location: "Surat, India", hourlyRate: 2800, projectRate: "₹30k", experienceYears: 15,
    tags: ["Fabric Sourcing", "Quality Control"], avatar: A("1506794778202-cad84cf45f1d"),
    about: "Veteran textile expert with deep mill connections for fabric and trim sourcing, quality assurance and costing across knits, wovens and sustainable materials.",
    services: [{ name: "Fabric Sourcing", price: "₹15k - 25k" }, { name: "Trim & Accessory Sourcing", price: "₹10k - 18k" }, { name: "Quality Audit", price: "₹12k - 20k" }],
    skills: ["Fabric Sourcing", "Trim Sourcing", "Quality Control", "Vendor Management", "Costing", "Compliance"],
    education: [{ title: "B.Tech Textile Technology", org: "VJTI Mumbai", year: "2008" }],
  }),
];

export const getFreelancer = (id: string) => FREELANCERS.find((f) => f.id === id);
