// Seller Categories Data Structure for Cosora B2B Marketplace

export type FieldType = "text" | "number" | "select" | "multiselect" | "textarea";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  unit?: string;
}

export interface SubCategory {
  id: string;
  name: string;
  fields?: FormField[];
}

export interface SellerCategory {
  id: string;
  name: string;
  icon: string;
  type: "product" | "service" | "freelancer";
  subCategories: SubCategory[];
  commonFields?: FormField[];
}

// Common fields for all product-based sellers
export const productCommonFields: FormField[] = [
  { id: "moq", label: "Minimum Order Quantity", type: "number", placeholder: "e.g., 100", required: true },
  { id: "leadTime", label: "Lead Time", type: "select", options: ["1-7 days", "7-15 days", "15-30 days", "30+ days"], required: true },
  { id: "location", label: "Location / Origin", type: "text", placeholder: "e.g., Mumbai, India", required: true },
  { id: "priceRange", label: "Price Range", type: "text", placeholder: "e.g., ₹50 - ₹200 per unit" },
];

// Common fields for service-based sellers
export const serviceCommonFields: FormField[] = [
  { id: "experience", label: "Years of Experience", type: "number", placeholder: "e.g., 5" },
  { id: "turnaround", label: "Typical Turnaround Time", type: "select", options: ["1-3 days", "3-7 days", "1-2 weeks", "2-4 weeks", "1+ month"] },
  { id: "location", label: "Service Location", type: "text", placeholder: "e.g., PAN India, Remote" },
  { id: "priceModel", label: "Pricing Model", type: "select", options: ["Fixed Price", "Hourly Rate", "Per Project", "Retainer", "Custom Quote"] },
];

// Common fields for freelancers
export const freelancerCommonFields: FormField[] = [
  { id: "experience", label: "Years of Experience", type: "number", placeholder: "e.g., 3" },
  { id: "availability", label: "Availability", type: "select", options: ["Full-time", "Part-time", "Weekends Only", "Project Basis"] },
  { id: "workMode", label: "Work Mode", type: "select", options: ["Remote", "On-site", "Hybrid"] },
  { id: "hourlyRate", label: "Hourly Rate (₹)", type: "number", placeholder: "e.g., 500" },
];

export const sellerCategories: SellerCategory[] = [
  {
    id: "fashion-accessories",
    name: "Fashion Accessories (Unisex)",
    icon: "Gem",
    type: "product",
    subCategories: [
      { id: "bags", name: "Bags" },
      { id: "belts", name: "Belts" },
      { id: "caps-hats", name: "Caps & Hats" },
      { id: "scarves-stoles", name: "Scarves & Stoles" },
      { id: "sunglasses", name: "Sunglasses" },
      { id: "watches", name: "Watches" },
      { id: "jewellery", name: "Jewellery" },
      { id: "socks", name: "Socks" },
      { id: "gloves", name: "Gloves" },
    ],
    commonFields: [
      { id: "material", label: "Material", type: "text", placeholder: "e.g., Genuine Leather" },
      { id: "colors", label: "Available Colors", type: "text", placeholder: "e.g., Black, Brown, Tan" },
      { id: "sizes", label: "Available Sizes", type: "text", placeholder: "e.g., S, M, L, XL" },
    ],
  },
  {
    id: "raw-materials",
    name: "Raw Materials – Fabrics & Inputs",
    icon: "Layers",
    type: "product",
    subCategories: [
      { id: "knitted-fabrics", name: "Knitted Fabrics", fields: [
        { id: "gsm", label: "GSM", type: "number", placeholder: "e.g., 180" },
        { id: "width", label: "Width (inches)", type: "number", placeholder: "e.g., 58" },
      ]},
      { id: "woven-fabrics", name: "Woven Fabrics", fields: [
        { id: "weaveType", label: "Weave Type", type: "select", options: ["Plain", "Twill", "Satin", "Dobby", "Jacquard"] },
        { id: "threadCount", label: "Thread Count", type: "number", placeholder: "e.g., 200" },
      ]},
      { id: "denim", name: "Denim", fields: [
        { id: "oz", label: "Oz Weight", type: "number", placeholder: "e.g., 12" },
        { id: "stretch", label: "Stretch %", type: "number", placeholder: "e.g., 2" },
      ]},
      { id: "terry-fleece", name: "Terry & Fleece" },
      { id: "sustainable-fabrics", name: "Sustainable Fabrics", fields: [
        { id: "certification", label: "Certification", type: "multiselect", options: ["GOTS", "OEKO-TEX", "BCI", "GRS", "OCS"] },
      ]},
      { id: "yarns", name: "Yarns", fields: [
        { id: "count", label: "Yarn Count", type: "text", placeholder: "e.g., 30s, 40s" },
        { id: "ply", label: "Ply", type: "select", options: ["Single", "2-ply", "3-ply", "Multi-ply"] },
      ]},
      { id: "threads", name: "Threads" },
      { id: "linings-interlinings", name: "Linings & Interlinings" },
      { id: "laces-nets", name: "Laces & Nets" },
      { id: "tapes-cords", name: "Tapes & Cords" },
      { id: "elastics", name: "Elastics" },
      { id: "dyes", name: "Dyes" },
      { id: "chemicals", name: "Chemicals" },
      { id: "finishes", name: "Finishes" },
    ],
    commonFields: [
      { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Cotton" },
      { id: "gsm", label: "GSM / Weight", type: "text", placeholder: "e.g., 180 GSM" },
      { id: "width", label: "Width", type: "text", placeholder: "e.g., 58 inches" },
    ],
  },
  {
    id: "trims-accessories",
    name: "Trims & Accessories",
    icon: "Scissors",
    type: "product",
    subCategories: [
      { id: "buttons", name: "Buttons", fields: [
        { id: "buttonType", label: "Button Type", type: "select", options: ["2-hole", "4-hole", "Shank", "Snap", "Toggle"] },
        { id: "size", label: "Size (mm)", type: "number", placeholder: "e.g., 15" },
      ]},
      { id: "zippers", name: "Zippers", fields: [
        { id: "zipperType", label: "Zipper Type", type: "select", options: ["Metal", "Nylon Coil", "Vislon", "Invisible"] },
        { id: "length", label: "Length (cm)", type: "number", placeholder: "e.g., 20" },
      ]},
      { id: "hook-eye", name: "Hook & Eye" },
      { id: "velcro-tape", name: "Velcro Tape" },
      { id: "elastic", name: "Elastic" },
      { id: "drawcords-toggles", name: "Drawcords & Toggles" },
      { id: "eyelets-grommets", name: "Eyelets & Grommets" },
      { id: "labels", name: "Labels" },
      { id: "lace-tapes", name: "Lace & Tapes" },
      { id: "interlining", name: "Interlining" },
      { id: "rivets-studs", name: "Rivets & Studs" },
      { id: "cord-locks-stoppers", name: "Cord Locks & Stoppers" },
      { id: "patches", name: "Patches" },
      { id: "tassels-fringes", name: "Tassels & Fringes" },
    ],
    commonFields: [
      { id: "material", label: "Material", type: "text", placeholder: "e.g., Metal, Plastic" },
      { id: "finish", label: "Finish", type: "text", placeholder: "e.g., Nickel, Antique Brass" },
      { id: "colors", label: "Available Colors", type: "text", placeholder: "e.g., Silver, Gold, Black" },
    ],
  },
  {
    id: "labels-tags",
    name: "Labels & Tags",
    icon: "Tag",
    type: "product",
    subCategories: [
      { id: "woven-labels", name: "Woven Labels" },
      { id: "printed-labels", name: "Printed Labels" },
      { id: "hang-tags", name: "Hang Tags" },
      { id: "size-tags", name: "Size Tags" },
      { id: "care-labels", name: "Care Labels" },
      { id: "content-labels", name: "Content Labels" },
      { id: "rfid-qr-labels", name: "RFID / QR Code Labels" },
    ],
    commonFields: [
      { id: "printingMethod", label: "Printing Method", type: "select", options: ["Woven", "Screen Print", "Digital Print", "Heat Transfer", "Embossed"] },
      { id: "size", label: "Size (mm)", type: "text", placeholder: "e.g., 30x60mm" },
      { id: "foldType", label: "Fold Type", type: "select", options: ["Flat", "Center Fold", "End Fold", "Manhattan Fold", "Miter Fold"] },
    ],
  },
  {
    id: "packaging",
    name: "Packaging",
    icon: "Package",
    type: "product",
    subCategories: [
      { id: "polybags", name: "Polybags" },
      { id: "paper-bags", name: "Paper Bags" },
      { id: "corrugated-boxes", name: "Corrugated Boxes" },
      { id: "garment-boxes", name: "Garment Boxes" },
      { id: "envelope-packaging", name: "Envelope Packaging" },
      { id: "ziplock-bags", name: "Ziplock Bags" },
      { id: "hang-tag-string-seal", name: "Hang Tag String & Seal" },
      { id: "tissue-paper", name: "Tissue Paper" },
      { id: "stickers-labels", name: "Stickers & Labels" },
      { id: "packaging-inserts", name: "Packaging Inserts & Accessories" },
    ],
    commonFields: [
      { id: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g., 30x40cm" },
      { id: "material", label: "Material", type: "text", placeholder: "e.g., Kraft Paper, PP" },
      { id: "customization", label: "Customization Options", type: "multiselect", options: ["Logo Print", "Custom Size", "Color Options", "Embossing", "Foil Stamping"] },
    ],
  },
  {
    id: "apparel-home",
    name: "Apparel & Home Categories",
    icon: "Shirt",
    type: "product",
    subCategories: [
      { id: "ready-made-garments", name: "Ready-made Garments", fields: [
        { id: "garmentType", label: "Garment Type", type: "select", options: ["Tops", "Bottoms", "Dresses", "Outerwear", "Activewear", "Innerwear"] },
        { id: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex", "Kids"] },
      ]},
      { id: "footwear", name: "Footwear" },
      { id: "home-textiles", name: "Home Textiles" },
    ],
    commonFields: [
      { id: "fabric", label: "Fabric", type: "text", placeholder: "e.g., 100% Cotton Jersey" },
      { id: "sizes", label: "Size Range", type: "text", placeholder: "e.g., XS-3XL" },
      { id: "colors", label: "Colors Available", type: "text", placeholder: "e.g., 10+ colors" },
    ],
  },
  {
    id: "machinery-equipment",
    name: "Machinery & Equipment",
    icon: "Cog",
    type: "product",
    subCategories: [
      { id: "clothing-machinery", name: "Clothing Machinery" },
      { id: "packaging-machinery", name: "Packaging Machinery" },
      { id: "printing-machinery", name: "Printing Machinery" },
      { id: "gym-equipment", name: "Gym Equipment" },
      { id: "mannequins", name: "Mannequins" },
    ],
    commonFields: [
      { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Juki, Brother" },
      { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used"] },
      { id: "warranty", label: "Warranty", type: "text", placeholder: "e.g., 1 year" },
      { id: "power", label: "Power Requirements", type: "text", placeholder: "e.g., 220V, 50Hz" },
    ],
  },
  {
    id: "chemicals-dyes",
    name: "Chemicals & Dyes",
    icon: "Flask",
    type: "product",
    subCategories: [
      { id: "textile-chemicals", name: "Textile Chemicals" },
      { id: "dyes", name: "Dyes" },
      { id: "washing-finishing-chemicals", name: "Washing & Finishing Chemicals" },
    ],
    commonFields: [
      { id: "chemicalType", label: "Chemical Type", type: "text", placeholder: "e.g., Softener, Fixer" },
      { id: "application", label: "Application", type: "text", placeholder: "e.g., Pre-treatment, Finishing" },
      { id: "packSize", label: "Pack Size", type: "text", placeholder: "e.g., 25kg drum" },
    ],
  },
  {
    id: "printing-manufacturing",
    name: "Printing & Manufacturing Services",
    icon: "Printer",
    type: "service",
    subCategories: [
      { id: "printing-services", name: "Printing Services", fields: [
        { id: "printTypes", label: "Print Types", type: "multiselect", options: ["Screen Print", "DTG", "Sublimation", "Heat Transfer", "Discharge", "Foil"] },
      ]},
      { id: "embroidery-services", name: "Embroidery Services", fields: [
        { id: "machineHeads", label: "Machine Heads", type: "number", placeholder: "e.g., 12" },
        { id: "maxColors", label: "Max Colors", type: "number", placeholder: "e.g., 15" },
      ]},
      { id: "fabric-dyeing", name: "Fabric Dyeing" },
      { id: "processing-finishing", name: "Processing & Finishing" },
    ],
    commonFields: [
      { id: "capacity", label: "Daily Capacity", type: "text", placeholder: "e.g., 5000 pcs/day" },
      { id: "minOrder", label: "Minimum Order", type: "text", placeholder: "e.g., 100 pcs" },
    ],
  },
  {
    id: "service-providers",
    name: "Service Providers (Manufacturing & Fashion Ops)",
    icon: "Wrench",
    type: "service",
    subCategories: [
      { id: "stitching-garmenting", name: "Stitching / Garmenting" },
      { id: "cutting", name: "Cutting" },
      { id: "packaging", name: "Packaging" },
      { id: "quality-check", name: "Quality Check (QC)" },
      { id: "pattern-making-cad", name: "Pattern Making / CAD" },
      { id: "tech-pack-development", name: "Tech Pack Development" },
      { id: "fashion-designing", name: "Fashion Designing" },
      { id: "fabric-sourcing", name: "Fabric Sourcing" },
      { id: "trims-accessories-sourcing", name: "Trims & Accessories Sourcing" },
    ],
    commonFields: [
      { id: "capacity", label: "Monthly Capacity", type: "text", placeholder: "e.g., 50,000 pcs" },
      { id: "specialization", label: "Specialization", type: "text", placeholder: "e.g., Woven Shirts, Knit T-shirts" },
      { id: "certifications", label: "Certifications", type: "multiselect", options: ["SEDEX", "BSCI", "WRAP", "GOTS", "ISO 9001"] },
    ],
  },
  {
    id: "logistics-supply-chain",
    name: "Logistics & Supply Chain",
    icon: "Truck",
    type: "service",
    subCategories: [
      { id: "logistics-transportation", name: "Logistics & Transportation" },
      { id: "warehousing", name: "Warehousing" },
      { id: "import-export-handling", name: "Import / Export Handling" },
    ],
    commonFields: [
      { id: "coverage", label: "Coverage Area", type: "text", placeholder: "e.g., PAN India, International" },
      { id: "services", label: "Services Offered", type: "multiselect", options: ["Door-to-Door", "Customs Clearance", "Warehousing", "Last Mile Delivery", "Cold Storage"] },
    ],
  },
  {
    id: "it-software-saas",
    name: "IT, Software & SaaS",
    icon: "Monitor",
    type: "service",
    subCategories: [
      { id: "app-development", name: "App Development" },
      { id: "erp-saas-software", name: "ERP / SaaS Software" },
      { id: "crm-automation", name: "CRM & Automation" },
      { id: "accounting-billing-software", name: "Accounting & Billing Software" },
      { id: "b2b-directory-listings", name: "B2B Directory Listings" },
    ],
    commonFields: [
      { id: "platforms", label: "Platforms", type: "multiselect", options: ["Web", "iOS", "Android", "Desktop"] },
      { id: "techStack", label: "Tech Stack", type: "text", placeholder: "e.g., React, Node.js" },
      { id: "pricing", label: "Pricing Model", type: "select", options: ["One-time", "Monthly Subscription", "Annual License", "Pay-per-use"] },
    ],
  },
  {
    id: "finance-compliance",
    name: "Finance & Compliance Services",
    icon: "Calculator",
    type: "service",
    subCategories: [
      { id: "accounting-services", name: "Accounting Services" },
      { id: "gst-filing", name: "GST Filing" },
      { id: "income-tax-filing", name: "Income Tax Filing" },
      { id: "business-registration", name: "Business Registration" },
      { id: "payroll-pf-esic", name: "Payroll & PF / ESIC" },
      { id: "budgeting-forecasting", name: "Budgeting & Forecasting" },
      { id: "fundraising-support", name: "Fundraising Support" },
      { id: "loan-advisory", name: "Loan Advisory" },
      { id: "inventory-valuation", name: "Inventory Valuation" },
      { id: "import-export-compliance", name: "Import / Export Compliance" },
      { id: "costing-consultation", name: "Costing Consultation" },
      { id: "audit-support", name: "Audit Support" },
      { id: "financial-sop-setup", name: "Financial SOP Setup" },
    ],
    commonFields: [
      { id: "clientTypes", label: "Client Types", type: "multiselect", options: ["Startups", "SMEs", "Enterprises", "Manufacturers", "Exporters"] },
      { id: "software", label: "Software Used", type: "text", placeholder: "e.g., Tally, Zoho Books" },
    ],
  },
  {
    id: "marketing-pr-photography",
    name: "Marketing, PR & Photography",
    icon: "Camera",
    type: "service",
    subCategories: [
      { id: "brand-consulting", name: "Brand Consulting" },
      { id: "marketing-services", name: "Marketing Services" },
      { id: "ecommerce-services", name: "E-commerce Services" },
      { id: "marketplace-onboarding", name: "Marketplace Onboarding" },
      { id: "brand-store-setup", name: "Brand Store Setup" },
      { id: "social-media-marketing", name: "Social Media Marketing" },
      { id: "performance-marketing", name: "Performance Marketing" },
      { id: "influencer-collaborations", name: "Influencer Collaborations" },
      { id: "public-relations", name: "Public Relations (PR)" },
      { id: "content-creation", name: "Content Creation" },
      { id: "catalogue-listing", name: "Catalogue & Listing" },
      { id: "seo-blogging", name: "SEO & Blogging" },
      { id: "email-marketing", name: "Email Marketing" },
      { id: "sms-whatsapp-campaigns", name: "SMS / WhatsApp Campaigns" },
      { id: "photography-videography", name: "Photography & Videography" },
    ],
    commonFields: [
      { id: "portfolio", label: "Portfolio Link", type: "text", placeholder: "e.g., https://behance.net/..." },
      { id: "clientBrands", label: "Brands Worked With", type: "text", placeholder: "e.g., Zara, H&M (optional)" },
    ],
  },
  {
    id: "freelancers-job-workers",
    name: "Freelancers & Job Workers",
    icon: "User",
    type: "freelancer",
    subCategories: [
      { id: "fashion-designing", name: "Fashion Designing" },
      { id: "tech-pack-creation", name: "Tech Pack Creation" },
      { id: "fabric-trim-sourcing", name: "Fabric & Trim Sourcing" },
      { id: "marketing-strategy", name: "Marketing Strategy" },
      { id: "ecommerce-operations", name: "E-commerce Operations" },
      { id: "performance-influencer-marketing", name: "Performance & Influencer Marketing" },
      { id: "pr-media", name: "PR & Media" },
      { id: "software-crm-support", name: "Software & CRM Support" },
      { id: "accounting-bookkeeping", name: "Accounting & Bookkeeping" },
      { id: "legal-compliance", name: "Legal & Compliance" },
      { id: "packaging-design-procurement", name: "Packaging Design & Procurement" },
      { id: "photography-videography", name: "Photography & Videography" },
      { id: "content-creation-cataloging", name: "Content Creation & Cataloging" },
      { id: "model-coordination-styling", name: "Model Coordination & Styling" },
      { id: "reels-campaign-shoots", name: "Reels & Campaign Shoots" },
      { id: "warehouse-logistics-management", name: "Warehouse & Logistics Management" },
      { id: "label-tag-customisation", name: "Label & Tag Customisation" },
      { id: "product-sampling", name: "Product Sampling" },
      { id: "trend-forecasting", name: "Trend Forecasting" },
      { id: "brand-strategy-consulting", name: "Brand Strategy Consulting" },
      { id: "ui-ux-website-development", name: "UI/UX & Website Development" },
      { id: "seo-copywriting", name: "SEO & Copywriting" },
      { id: "b2b-sales-enablement", name: "B2B Sales Enablement" },
    ],
    commonFields: [
      { id: "skills", label: "Key Skills", type: "text", placeholder: "e.g., Adobe Illustrator, CLO 3D" },
      { id: "portfolio", label: "Portfolio / Sample Work", type: "text", placeholder: "e.g., https://..." },
      { id: "languages", label: "Languages", type: "text", placeholder: "e.g., English, Hindi" },
    ],
  },
];

// Helper function to get category by ID
export const getCategoryById = (id: string): SellerCategory | undefined => {
  return sellerCategories.find((cat) => cat.id === id);
};

// Helper function to get subcategory
export const getSubCategoryById = (categoryId: string, subCategoryId: string): SubCategory | undefined => {
  const category = getCategoryById(categoryId);
  return category?.subCategories.find((sub) => sub.id === subCategoryId);
};

// Get all fields for a category + subcategory combination
export const getFieldsForCategory = (categoryId: string, subCategoryId?: string): FormField[] => {
  const category = getCategoryById(categoryId);
  if (!category) return [];

  const baseFields = category.type === "product" 
    ? productCommonFields 
    : category.type === "service" 
    ? serviceCommonFields 
    : freelancerCommonFields;

  const categoryFields = category.commonFields || [];
  
  let subCategoryFields: FormField[] = [];
  if (subCategoryId) {
    const subCategory = getSubCategoryById(categoryId, subCategoryId);
    subCategoryFields = subCategory?.fields || [];
  }

  return [...subCategoryFields, ...categoryFields, ...baseFields];
};
