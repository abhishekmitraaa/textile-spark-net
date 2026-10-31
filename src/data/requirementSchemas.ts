/**
 * The requirement form's category questions (moved from pages/PostRequirement.tsx, 2026-10-31, Ranking F3).
 *
 * Since F3 these are the fallback: the form reads the same questions from public.attribute_definitions
 * (form = 'requirement'), which super admins edit in Cosora-Admin › Attributes, and the migration that
 * created that table was seeded from this file (scripts/ranking/f3-seed.mjs). Keep the two in step when
 * a question is added here.
 */
// ─────────────────────────────────────────────────────────────

/**
 * Taxonomy parent id -> which of this file's question sets to ask.
 *
 * Deliberately NOT the same thing as category_id. These schemas decide which
 * FORM FIELDS a buyer sees; category_id comes from the picker's own selection
 * and never from this map. Keeping them separate is the point — a wrong entry
 * here shows someone a slightly-off question, it cannot mis-file the RFQ.
 *
 * The four taxonomy parents with no bespoke schema (machinery-equipment,
 * chemicals-dyes, printing-manufacturing, finance-compliance) fall through to
 * the generic set rather than getting invented questions.
 */
export const SCHEMA_BY_TAXONOMY: Record<string, string> = {
  "apparel-home": "womens",
  "raw-materials": "fabrics",
  "cosmetics-beauty": "cosmetics",
  "fashion-accessories": "accessories",
  "labels-tags": "labels",
  "packaging": "packaging",
  "trims-accessories": "trims",
  "it-software-saas": "software",
  "marketing-pr-photography": "marketing",
  "freelancers-job-workers": "freelancer",
  "logistics-supply-chain": "exporter",
  "service-providers": "designer",
  "others-custom": "custom",
};

// ─────────────────────────────────────────────────────────────
// SHARED OPTION LISTS
// ─────────────────────────────────────────────────────────────

const COLORS = ["Black", "White", "Navy", "Grey", "Red", "Blue", "Green", "Beige", "Brown", "Pink"];
const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Custom"];
const KID_AGES = ["0-2 Y", "2-4 Y", "4-6 Y", "6-8 Y", "8-10 Y", "10-12 Y", "12-14 Y", "Custom"];
const FABRIC_TYPES = ["Cotton", "Silk", "Linen", "Denim", "Polyester", "Rayon", "Wool", "Blend", "Organic Cotton", "Tencel"];
const PRINTING = ["Screen Printing", "Sublimation", "DTG (Direct to Garment)", "Embroidery", "Heat Transfer", "None"];
const FIT_TYPES = ["Slim Fit", "Regular Fit", "Relaxed", "Oversized", "Custom"];

const APPAREL_TYPES = ["T-Shirt", "Polo", "Formal Shirt", "Casual Shirt", "Dress", "Kurta", "Trousers", "Jeans", "Co-ord Set", "Jacket", "Custom"];
const KID_APPAREL_TYPES = ["T-Shirt", "Frock", "Romper", "Shorts Set", "School Uniform", "Nightwear", "Winter Wear", "Ethnic Wear", "Custom"];

const PATTERNS = ["Solid", "Printed", "Yarn Dyed", "Striped", "Checked", "Jacquard"];
const WEAVE = ["Woven", "Knit", "Non-woven"];
const FABRIC_FINISH = ["Mercerized", "Bio-washed", "Enzyme-washed", "Sanforized", "Calendered", "Raw / Greige"];
const TEXTILE_CERTS = ["GOTS", "OEKO-TEX", "GRS (Recycled)", "BCI Cotton", "None"];

const COSMETIC_TYPES = ["Lipstick", "Foundation", "Serum", "Face Cream", "Shampoo", "Body Lotion", "Sunscreen", "Kajal / Eyeliner", "Nail Polish", "Perfume", "Custom"];
const FORMULATIONS = ["Cream", "Gel", "Liquid", "Powder", "Balm", "Serum", "Lotion", "Stick"];
const CONTAINER_TYPES = ["Bottle", "Jar", "Tube", "Pump", "Sachet", "Compact", "Roll-on"];
const COSMETIC_CERTS = ["FDA Approved", "BIS Certified", "Cruelty-Free", "Vegan", "Dermatologically Tested", "Organic"];

const ACCESSORY_TYPES = ["Handbags", "Belts", "Caps & Hats", "Scarves & Stoles", "Wallets", "Jewellery", "Sunglasses", "Watches", "Custom"];
const ACCESSORY_MATERIALS = ["Genuine Leather", "Faux Leather", "Fabric", "Metal", "Beads", "Plastic", "Wood", "Mixed"];

const LABEL_TYPES = ["Woven Label", "Printed Label", "Hang Tag", "Care Label", "Size Label", "Heat Transfer Label", "Leather Patch"];
const LABEL_MATERIALS = ["Satin", "Damask", "Taffeta", "Cotton", "Paper", "PVC / Rubber", "Faux Leather"];
const LABEL_FOLDS = ["Straight Cut", "End Fold", "Center Fold", "Manhattan Fold", "Loop Fold"];

const SOFTWARE_TYPES = ["Website Development", "Mobile App", "E-commerce Store", "UI/UX Design", "ERP / CRM", "Custom Software", "Maintenance / Support"];
const PLATFORMS = ["Web", "iOS", "Android", "Cross-platform", "Desktop"];
const TIMELINES = ["< 2 weeks", "2-4 weeks", "1-2 months", "3-6 months", "6+ months"];

const RAW_TYPES = ["Yarn", "Fiber", "Dyes & Pigments", "Chemicals", "Grey Fabric", "Cotton Bales", "Threads", "Custom"];

const PACKAGING_TYPES = ["Poly Bags", "Corrugated Boxes", "Pouches", "Cartons", "Gift Boxes", "Tissue Paper", "Tapes & Fillers"];
const PACKAGING_MATERIALS = ["Kraft Paper", "Corrugated", "Plastic / LDPE", "Biodegradable", "Cardboard", "Jute"];
const PACKAGING_PRINT = ["Custom Printed", "Plain / Unprinted", "Single Color", "Full Color"];
const ECO_OPTIONS = ["Recyclable", "Biodegradable", "Compostable", "Reusable", "FSC Certified"];

const TRIM_TYPES = ["Buttons", "Zippers", "Elastic", "Lace", "Ribbon", "Hooks & Eyes", "Beads", "Sequins", "Drawcords", "Velcro"];
const TRIM_MATERIALS = ["Metal", "Plastic", "Wood", "Fabric", "Resin", "Nylon"];

const DESIGNER_SERVICES = ["Collection Design", "Tech Pack Creation", "Pattern Making", "Fashion Sketching", "Trend Consultation", "Sample Development"];
const DESIGN_STYLES = ["Casual", "Formal", "Ethnic", "Streetwear", "Luxury", "Sustainable", "Athleisure"];

const MARKETING_SERVICES = ["Social Media Management", "Influencer Marketing", "PR Campaign", "Branding & Identity", "SEO / SEM", "Content Creation", "Ad Campaign"];
const CHANNELS = ["Instagram", "Facebook", "YouTube", "LinkedIn", "Print Media", "Google Ads", "Email"];
const CAMPAIGN_DURATION = ["One-time", "1 month", "3 months", "6 months", "Ongoing"];

const FREELANCE_SKILLS = ["Content Writing", "Graphic Design", "Video Editing", "Data Entry", "Translation", "Virtual Assistant", "Web Development", "Voice Over"];
const EXPERTISE = ["Entry Level", "Intermediate", "Expert"];

const INCOTERMS = ["EXW", "FOB", "CIF", "CFR", "DDP", "FCA"];

const PHOTO_TYPES = ["Product Photography", "Fashion / Editorial", "Lookbook", "E-commerce Catalog", "Campaign", "Model Shoot", "Video Shoot"];
const PHOTO_LOCATION = ["Studio", "On-location", "Outdoor", "Client Location"];
const MODELS_NEEDED = ["Not required", "1 Model", "2-3 Models", "4+ Models"];

// ─────────────────────────────────────────────────────────────
// FORM SCHEMA (per-category fields)
// ─────────────────────────────────────────────────────────────

export type FieldType = "text" | "textarea" | "description" | "select" | "chips" | "radio" | "priceRange" | "files";

export interface Field {
  key: string;
  label: string;                // "" to hide (section title carries meaning)
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  half?: boolean;               // pair with an adjacent half field in a 2-col row
}

export interface Section {
  title: string;
  fields: Field[];
}

// Reusable field builders
const desc = (placeholder = "Describe your requirements in detail (material, finish, packaging, compliance needs...)"): Field =>
  ({ key: "description", label: "", type: "description", placeholder });
const filesField = (label = "Attachments (Optional)"): Field => ({ key: "files", label, type: "files" });
const budget = (label: string): Field => ({ key: "budget", label, type: "priceRange" });
const quantity = (placeholder: string): Field => ({ key: "quantity", label: "Quantity", type: "text", placeholder, required: true });

// Apparel base (women/men/unisex/kids share the shape; sizes + type vary)
function apparelSchema(garmentTypes: string[], sizeField: Field, opts?: { fit?: boolean }): Section[] {
  return [
    { title: "Product Details", fields: [
      { key: "productType", label: "Product Type", type: "select", options: garmentTypes, placeholder: "Select type", required: true },
      { key: "productName", label: "Product Name", type: "text", placeholder: "e.g., 100% Cotton Polo" },
      ...(opts?.fit ? [{ key: "fit", label: "Fit Type", type: "select" as FieldType, options: FIT_TYPES, placeholder: "Select fit" }] : []),
    ]},
    { title: "Colors & Sizes", fields: [
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
      sizeField,
    ]},
    { title: "Fabric Specifications", fields: [
      { key: "fabric", label: "Fabric Type", type: "select", options: FABRIC_TYPES, placeholder: "Select", half: true },
      { key: "gsm", label: "GSM", type: "text", placeholder: "e.g., 180-200", half: true },
    ]},
    { title: "Printing / Embellishment", fields: [{ key: "printing", label: "", type: "radio", options: PRINTING }] },
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 500 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ];
}

const adultSizes: Field = { key: "sizes", label: "Sizes (select multiple)", type: "chips", options: SIZES };

export const SCHEMAS: Record<string, Section[]> = {
  // ── Apparel ──
  womens: apparelSchema(APPAREL_TYPES, adultSizes, { fit: true }),
  mens: apparelSchema(APPAREL_TYPES, adultSizes, { fit: true }),
  unisex: apparelSchema(APPAREL_TYPES, adultSizes),
  kidswear: apparelSchema(KID_APPAREL_TYPES, { key: "sizes", label: "Age Group (select multiple)", type: "chips", options: KID_AGES }),

  // ── Fabrics ──
  fabrics: [
    { title: "Fabric Details", fields: [
      { key: "productType", label: "Fabric Type", type: "select", options: FABRIC_TYPES, placeholder: "Select", required: true, half: true },
      { key: "weave", label: "Construction", type: "select", options: WEAVE, placeholder: "Select", half: true },
      { key: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Cotton", half: true },
      { key: "gsm", label: "GSM", type: "text", placeholder: "e.g., 180 GSM", half: true },
    ]},
    { title: "Color & Pattern", fields: [
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
      { key: "pattern", label: "Pattern (select multiple)", type: "chips", options: PATTERNS },
    ]},
    { title: "Width & Finish", fields: [
      { key: "width", label: "Width", type: "text", placeholder: "e.g., 44 inches", half: true },
      { key: "finish", label: "Finish", type: "select", options: FABRIC_FINISH, placeholder: "Select", half: true },
    ]},
    { title: "Certifications", fields: [{ key: "certifications", label: "Required certifications (select multiple)", type: "chips", options: TEXTILE_CERTS }] },
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 1000 meters"), budget("Price Range (per meter)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Cosmetics ──
  cosmetics: [
    { title: "Product Details", fields: [
      { key: "productType", label: "Product Type", type: "select", options: COSMETIC_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Product Name", type: "text", placeholder: "e.g., Matte Liquid Lipstick" },
    ]},
    { title: "Formulation", fields: [
      { key: "formulation", label: "Form", type: "select", options: FORMULATIONS, placeholder: "Select", half: true },
      { key: "shade", label: "Shade / Variant", type: "text", placeholder: "e.g., Ruby Red", half: true },
      { key: "ingredients", label: "Key Ingredients", type: "text", placeholder: "e.g., Vitamin C, Hyaluronic Acid" },
    ]},
    { title: "Packaging & Volume", fields: [
      { key: "container", label: "Container Type", type: "select", options: CONTAINER_TYPES, placeholder: "Select", half: true },
      { key: "volume", label: "Net Volume / Weight", type: "text", placeholder: "e.g., 50ml / 100g", half: true },
    ]},
    { title: "Compliance & Certifications", fields: [{ key: "certifications", label: "Required (select multiple)", type: "chips", options: COSMETIC_CERTS }] },
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 1000 units"), budget("Price Range (per unit)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Accessories ──
  accessories: [
    { title: "Product Details", fields: [
      { key: "productType", label: "Accessory Type", type: "select", options: ACCESSORY_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Product Name", type: "text", placeholder: "e.g., Structured Tote Bag" },
    ]},
    { title: "Material & Size", fields: [
      { key: "material", label: "Material", type: "select", options: ACCESSORY_MATERIALS, placeholder: "Select", half: true },
      { key: "dimensions", label: "Size / Dimensions", type: "text", placeholder: "e.g., 30 x 25 cm", half: true },
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
    ]},
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 300 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Labels & Tags ──
  labels: [
    { title: "Product Details", fields: [
      { key: "productType", label: "Label Type", type: "select", options: LABEL_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Name / Reference", type: "text", placeholder: "e.g., Woven Brand Label" },
    ]},
    { title: "Material & Print", fields: [
      { key: "material", label: "Material", type: "select", options: LABEL_MATERIALS, placeholder: "Select", half: true },
      { key: "fold", label: "Fold / Finishing", type: "select", options: LABEL_FOLDS, placeholder: "Select", half: true },
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
      { key: "method", label: "Printing / Weaving Method", type: "text", placeholder: "e.g., Damask woven, Offset print" },
    ]},
    { title: "Dimensions", fields: [{ key: "dimensions", label: "Size", type: "text", placeholder: "e.g., 2cm x 5cm" }] },
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 5000 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── IT & Software (service) ──
  software: [
    { title: "Project Details", fields: [
      { key: "productType", label: "Service Type", type: "select", options: SOFTWARE_TYPES, placeholder: "Select service", required: true },
      { key: "productName", label: "Project Title", type: "text", placeholder: "e.g., D2C fashion storefront" },
    ]},
    { title: "Requirements", fields: [
      { key: "platform", label: "Platform (select multiple)", type: "chips", options: PLATFORMS },
      { key: "techStack", label: "Tech Preferences", type: "text", placeholder: "e.g., React, Node, Flutter" },
    ]},
    { title: "Scope & Timeline", fields: [
      { key: "scope", label: "Project Scope", type: "textarea", placeholder: "Key features, pages, integrations..." },
      { key: "timeline", label: "Expected Timeline", type: "select", options: TIMELINES, placeholder: "Select" },
    ]},
    { title: "Description", fields: [desc("Add any additional context, goals or references...")] },
    { title: "Budget", fields: [budget("Project Budget")] },
    { title: "Attachments (Optional)", fields: [filesField("Brief, wireframes, references (Optional)")] },
  ],

  // ── Raw Materials ──
  raw: [
    { title: "Material Details", fields: [
      { key: "productType", label: "Material Type", type: "select", options: RAW_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Material Name / Specification", type: "text", placeholder: "e.g., 30s Combed Cotton Yarn" },
    ]},
    { title: "Specifications", fields: [
      { key: "composition", label: "Composition / Grade", type: "text", placeholder: "e.g., 100% Cotton, Grade A", half: true },
      { key: "purity", label: "Quality / Purity", type: "text", placeholder: "e.g., Ring-spun, 99% purity", half: true },
      { key: "colors", label: "Colors / Shades (if applicable)", type: "chips", options: COLORS },
    ]},
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 500 kg / 2 tons"), budget("Price Range (per kg)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Packaging ──
  packaging: [
    { title: "Product Details", fields: [
      { key: "productType", label: "Packaging Type", type: "select", options: PACKAGING_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Product Name", type: "text", placeholder: "e.g., Custom Printed Mailer Box" },
    ]},
    { title: "Material & Size", fields: [
      { key: "material", label: "Material", type: "select", options: PACKAGING_MATERIALS, placeholder: "Select", half: true },
      { key: "dimensions", label: "Size (L x W x H)", type: "text", placeholder: "e.g., 30 x 20 x 8 cm", half: true },
    ]},
    { title: "Printing & Branding", fields: [
      { key: "printing", label: "Printing", type: "select", options: PACKAGING_PRINT, placeholder: "Select", half: true },
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
    ]},
    { title: "Eco Options", fields: [{ key: "ecoOptions", label: "Sustainability (select multiple)", type: "chips", options: ECO_OPTIONS }] },
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 2000 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Trims & Accessories ──
  trims: [
    { title: "Product Details", fields: [
      { key: "productType", label: "Trim Type", type: "select", options: TRIM_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Name / Reference", type: "text", placeholder: "e.g., 18mm Metal Zipper" },
    ]},
    { title: "Material & Spec", fields: [
      { key: "material", label: "Material", type: "select", options: TRIM_MATERIALS, placeholder: "Select", half: true },
      { key: "dimensions", label: "Size / Specification", type: "text", placeholder: "e.g., 20mm", half: true },
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
    ]},
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 10000 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Fashion Designer (service) ──
  designer: [
    { title: "Service Details", fields: [
      { key: "productType", label: "Service Needed", type: "select", options: DESIGNER_SERVICES, placeholder: "Select service", required: true },
      { key: "productName", label: "Project Title", type: "text", placeholder: "e.g., SS26 Womenswear capsule" },
    ]},
    { title: "Style & Scope", fields: [
      { key: "garment", label: "Apparel Category", type: "text", placeholder: "e.g., Womenswear, Kidswear", half: true },
      { key: "style", label: "Style / Aesthetic", type: "select", options: DESIGN_STYLES, placeholder: "Select", half: true },
      { key: "deliverables", label: "Expected Deliverables", type: "text", placeholder: "e.g., 10 sketches + tech pack" },
    ]},
    { title: "Timeline", fields: [{ key: "timeline", label: "Expected Timeline", type: "select", options: TIMELINES, placeholder: "Select" }] },
    { title: "Description", fields: [desc("Describe the vision, mood, and requirements...")] },
    { title: "Budget", fields: [budget("Project Budget")] },
    { title: "Attachments (Optional)", fields: [filesField("References / Mood Board (Optional)")] },
  ],

  // ── Marketing PR (service) ──
  marketing: [
    { title: "Service Details", fields: [
      { key: "productType", label: "Service Needed", type: "select", options: MARKETING_SERVICES, placeholder: "Select service", required: true },
      { key: "productName", label: "Campaign Title", type: "text", placeholder: "e.g., Festive launch campaign" },
    ]},
    { title: "Scope", fields: [
      { key: "channels", label: "Channels (select multiple)", type: "chips", options: CHANNELS },
      { key: "audience", label: "Target Audience", type: "text", placeholder: "e.g., Women 18-35, metro cities" },
      { key: "duration", label: "Campaign Duration", type: "select", options: CAMPAIGN_DURATION, placeholder: "Select" },
    ]},
    { title: "Description", fields: [desc("Describe goals, KPIs, and deliverables...")] },
    { title: "Budget", fields: [budget("Campaign Budget")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Freelancer (service) ──
  freelancer: [
    { title: "Project Details", fields: [
      { key: "productType", label: "Skill Needed", type: "select", options: FREELANCE_SKILLS, placeholder: "Select skill", required: true },
      { key: "productName", label: "Project Title", type: "text", placeholder: "e.g., Product description writing" },
    ]},
    { title: "Scope", fields: [
      { key: "expertise", label: "Expertise Level", type: "select", options: EXPERTISE, placeholder: "Select", half: true },
      { key: "timeline", label: "Timeline", type: "select", options: TIMELINES, placeholder: "Select", half: true },
      { key: "scope", label: "Work Scope / Deliverables", type: "textarea", placeholder: "Describe the deliverables and expectations..." },
    ]},
    { title: "Description", fields: [desc("Add any additional context...")] },
    { title: "Budget", fields: [budget("Project Budget")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Exporter (service) ──
  exporter: [
    { title: "Requirement Details", fields: [
      { key: "productType", label: "Product to Export", type: "text", placeholder: "e.g., Cotton T-shirts", required: true },
      { key: "destination", label: "Destination Country", type: "text", placeholder: "e.g., USA, UAE, Germany" },
    ]},
    { title: "Logistics", fields: [
      { key: "incoterms", label: "Incoterms", type: "select", options: INCOTERMS, placeholder: "Select", half: true },
      { key: "port", label: "Preferred Port", type: "text", placeholder: "e.g., Nhava Sheva", half: true },
      { key: "documentation", label: "Documentation / Compliance", type: "text", placeholder: "e.g., COO, Phytosanitary, GSP" },
    ]},
    { title: "Description", fields: [desc("Describe packaging, timelines and requirements...")] },
    { title: "Volume & Budget", fields: [quantity("e.g., 1 x 20ft container / 5000 units"), budget("Budget")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Others (custom), 2026-10-17: clothing that fits no category; sent to every seller ──
  custom: [
    { title: "What you need made", fields: [
      { key: "productName", label: "What is it?", type: "text", placeholder: "e.g., Stage costume with a detachable cape", required: true },
      { key: "productType", label: "Kind of item", type: "select", options: ["Garment", "Costume", "Uniform", "Accessory", "Home textile", "Other"], placeholder: "Select" },
    ]},
    { title: "Colors & Sizes", fields: [
      { key: "colors", label: "Colors (select multiple)", type: "chips", options: COLORS },
      adultSizes,
    ]},
    { title: "Material", fields: [
      { key: "fabric", label: "Fabric / material", type: "text", placeholder: "e.g., Satin with net lining", half: true },
      { key: "gsm", label: "GSM", type: "text", placeholder: "e.g., 180-200", half: true },
    ]},
    { title: "Description", fields: [desc("Describe the design, measurements, finish and anything a seller must know. Reference pictures help.")] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 50 pieces"), budget("Price Range (per piece)")] },
    { title: "Attachments (Optional)", fields: [filesField("Reference pictures (Optional)")] },
  ],

  // ── Generic: a category without questions of its own ──
  generic: [
    { title: "What you need", fields: [
      { key: "productName", label: "Product or service", type: "text", placeholder: "e.g., Industrial lockstitch machines", required: true },
    ]},
    { title: "Description", fields: [desc()] },
    { title: "Quantity & Budget", fields: [quantity("e.g., 10 units"), budget("Budget")] },
    { title: "Attachments (Optional)", fields: [filesField()] },
  ],

  // ── Photography (service) ──
  photography: [
    { title: "Service Details", fields: [
      { key: "productType", label: "Shoot Type", type: "select", options: PHOTO_TYPES, placeholder: "Select type", required: true },
      { key: "productName", label: "Project Title", type: "text", placeholder: "e.g., Summer catalog shoot" },
    ]},
    { title: "Shoot Details", fields: [
      { key: "count", label: "No. of Products / Looks", type: "text", placeholder: "e.g., 25 products", half: true },
      { key: "location", label: "Location", type: "select", options: PHOTO_LOCATION, placeholder: "Select", half: true },
      { key: "models", label: "Models Needed", type: "select", options: MODELS_NEEDED, placeholder: "Select" },
    ]},
    { title: "Deliverables", fields: [
      { key: "deliverables", label: "Edited Images / Deliverables", type: "text", placeholder: "e.g., 50 retouched images", half: true },
      { key: "timeline", label: "Timeline", type: "select", options: TIMELINES, placeholder: "Select", half: true },
    ]},
    { title: "Description", fields: [desc("Describe the style, references and requirements...")] },
    { title: "Budget", fields: [budget("Project Budget")] },
    { title: "Attachments (Optional)", fields: [filesField("References (Optional)")] },
  ],
};

/** The question sets for a category picked on the requirement form (the generic set when none is bespoke). */
export function schemaForCategory(categoryId: string | undefined, schemas: Record<string, Section[]> = SCHEMAS): Section[] {
  if (!categoryId) return schemas.generic ?? SCHEMAS.generic;
  return schemas[SCHEMA_BY_TAXONOMY[categoryId] ?? ""] ?? schemas.generic ?? SCHEMAS.generic;
}
