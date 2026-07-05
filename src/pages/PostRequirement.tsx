import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { createRfq } from "@/lib/queries/rfqs";
import BuyerShell from "@/components/buyer/BuyerShell";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import CosoraLogo from "@/components/CosoraLogo";
import {
  Zap, FileText, ArrowLeft, ChevronRight, Sparkles, Clock, CheckCircle2,
  Check, X, Mic, MicOff, Image as ImageIcon, Video, FileUp, Plus, ChevronDown, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// CATEGORIES ("All Category" grid — matches the reference)
//
// Uses the SAME local preference thumbnails as the registration
// Interest-Preference screen (src/assets/Buyer/Preference/*.png), so the
// imagery is consistent across the app. The four categories without a
// provided asset (cosmetics/designer/marketing/photography) keep an
// Unsplash image, which also serves as a fallback if an asset is missing.
// ─────────────────────────────────────────────────────────────

const prefFiles = import.meta.glob("../assets/Buyer/Preference/*.png", { eager: true, import: "default" }) as Record<string, string>;
const prefImg = (basename: string): string | undefined =>
  Object.entries(prefFiles).find(([p]) => p.split("/").pop() === basename)?.[1];

// Category id → local preference asset filename (curly apostrophes / spacing
// match the actual files on disk).
const PREF_FILE_BY_ID: Record<string, string> = {
  fabrics: "fabrics.png",
  womens: "Women’s clothing.png",
  mens: "Men’s Clothing.png",
  unisex: "Unisex Clothing.png",
  kidswear: "Kidswear.png",
  accessories: "Accessories.png",
  raw: "Raw Materials.png",
  trims: "Trims & Accessories.png",
  labels: "Labels & Tags.png",
  packaging: "Packaging.png",
  software: "IT &  Software.png",
  freelancer: "Freelance.png",
  exporter: "Exporter.png",
};

const CATEGORIES = [
  { id: "fabrics", name: "Fabrics", img: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=200&h=200&fit=crop" },
  { id: "womens", name: "Women's clothing", img: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=200&h=200&fit=crop" },
  { id: "mens", name: "Men's Clothing", img: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=200&h=200&fit=crop" },
  { id: "cosmetics", name: "Cosmetics", img: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200&h=200&fit=crop" },
  { id: "unisex", name: "Unisex Clothing", img: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop" },
  { id: "kidswear", name: "Kidswear", img: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=200&h=200&fit=crop" },
  { id: "accessories", name: "Accessories", img: "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=200&h=200&fit=crop" },
  { id: "labels", name: "Labels & Tags", img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=200&h=200&fit=crop" },
  { id: "software", name: "IT & Software", img: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200&h=200&fit=crop" },
  { id: "raw", name: "Raw Materials", img: "https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=200&h=200&fit=crop" },
  { id: "packaging", name: "Packaging", img: "https://images.unsplash.com/photo-1607166452427-7e4477c2cc4e?w=200&h=200&fit=crop" },
  { id: "trims", name: "Trims & Accessories", img: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=200&h=200&fit=crop" },
  { id: "designer", name: "Fashion Designer", img: "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=200&h=200&fit=crop" },
  { id: "marketing", name: "Marketing PR", img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200&h=200&fit=crop" },
  { id: "freelancer", name: "Freelancer", img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=200&h=200&fit=crop" },
  { id: "exporter", name: "Exporter", img: "https://images.unsplash.com/photo-1494412574643-ff11b0a5eb19?w=200&h=200&fit=crop" },
  { id: "photography", name: "Photography", img: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=200&h=200&fit=crop" },
].map((c) => ({ ...c, img: prefImg(PREF_FILE_BY_ID[c.id]) ?? c.img }));

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

type FieldType = "text" | "textarea" | "description" | "select" | "chips" | "radio" | "priceRange" | "files";

interface Field {
  key: string;
  label: string;                // "" to hide (section title carries meaning)
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  half?: boolean;               // pair with an adjacent half field in a 2-col row
}

interface Section {
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

const SCHEMAS: Record<string, Section[]> = {
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

type Step = "main" | "category" | "form" | "success";

// Minimal typing for the Web Speech API (not in lib.dom for all TS targets).
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecCtor = new () => SpeechRec;

// ─────────────────────────────────────────────────────────────
// Reusable bits
// ─────────────────────────────────────────────────────────────

function SectionCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-[#ef4d62]/10 text-[#ef4d62] text-[11px] font-bold flex items-center justify-center">{n}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors";

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
        active ? "border-[#ef4d62] bg-[#ef4d62] text-white" : "border-gray-200 text-gray-700 hover:border-[#ef4d62]/40"
      )}
    >
      {label}
    </button>
  );
}

// Group consecutive half-width fields into 2-col rows.
function toRows(fields: Field[]): Field[][] {
  const rows: Field[][] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.half && fields[i + 1]?.half) { rows.push([f, fields[i + 1]]); i += 2; }
    else { rows.push([f]); i += 1; }
  }
  return rows;
}

type FormValues = Record<string, string | string[]>;

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

const PostRequirement = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);

  const [step, setStep] = useState<Step>("main");
  const [quickOpen, setQuickOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [openSelect, setOpenSelect] = useState<string | null>(null);

  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<File[]>([]);

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? null;
  const sections = categoryId ? (SCHEMAS[categoryId] ?? SCHEMAS.womens) : [];

  // Reset the form whenever the chosen category changes (fields differ per category).
  useEffect(() => {
    setValues({});
    setFiles([]);
    setOpenSelect(null);
  }, [categoryId]);

  const sVal = (k: string) => (values[k] as string) ?? "";
  const aVal = (k: string) => (Array.isArray(values[k]) ? (values[k] as string[]) : []);
  const setVal = (k: string, v: string | string[]) => setValues((prev) => ({ ...prev, [k]: v }));
  const toggleArr = (k: string, v: string) =>
    setValues((prev) => {
      const cur = Array.isArray(prev[k]) ? (prev[k] as string[]) : [];
      return { ...prev, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  // ── Voice to text (Web Speech API, graceful fallback) ──
  const toggleVoice = () => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input isn't supported in this browser"); return; }
    if (recording) { recognitionRef.current?.stop(); return; }

    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => { setRecording(true); toast.info("Listening... speak now"); };
    rec.onerror = () => { setRecording(false); toast.error("Couldn't capture audio"); };
    rec.onend = () => setRecording(false);
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setValues((prev) => {
        const cur = (prev.description as string) ?? "";
        return { ...prev, description: (cur ? cur + " " : "") + text };
      });
      toast.success("Added voice description");
    };
    recognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files as FileList)].slice(0, 5));
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    for (const section of sections) {
      for (const f of section.fields) {
        if (!f.required) continue;
        const val = values[f.key];
        const empty = Array.isArray(val) ? val.length === 0 : !String(val ?? "").trim();
        if (empty) { toast.error(`Please fill in "${f.label || section.title}"`); return; }
      }
    }

    if (!user) {
      toast.error("Sign in as a buyer to submit", { description: "Use the dev switcher (bottom-left) to sign in as Demo Buyer." });
      return;
    }

    // Best-effort extraction of a title / quantity / budget from the
    // category-specific values (field keys differ per category schema).
    const num = (v: unknown) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };
    const findVal = (subs: string[]): string | undefined => {
      for (const k of Object.keys(values)) {
        if (subs.some((s) => k.toLowerCase().includes(s))) {
          const val = values[k];
          if (val && !Array.isArray(val)) return String(val);
        }
      }
      return undefined;
    };
    const productName = findVal(["producttype", "apparel", "type", "item", "name"]) || category?.name || "Requirement";
    const quantity = num(findVal(["quantity", "qty", "units", "moq", "order"]));
    const budgetMin = num(findVal(["budgetmin", "minprice", "pricemin", "targetmin"]));
    const budgetMax = num(findVal(["budgetmax", "maxprice", "pricemax", "budget", "targetprice", "price"]));
    const description = (values.description as string) || "";
    const title = `${category?.name ?? "General"} — ${productName}`.slice(0, 120);

    try {
      await createRfq(user.id, { title, productName, quantity, budgetMin, budgetMax, description });
      queryClient.invalidateQueries({ queryKey: ["rfqs"] });
    } catch (e) {
      toast.error("Couldn't submit your requirement", { description: e instanceof Error ? e.message : String(e) });
      return;
    }
    setStep("success");
  };

  // Success -> redirect to My Previous Quotes
  useEffect(() => {
    if (step !== "success") return;
    const t = window.setTimeout(() => navigate("/requirement/my-quotes"), 2200);
    return () => window.clearTimeout(t);
  }, [step, navigate]);

  // ── Field renderer ──
  const renderField = (f: Field) => {
    switch (f.type) {
      case "text":
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-[#ef4d62]"> *</span>}</label>}
            <input className={inputCls} placeholder={f.placeholder} value={sVal(f.key)} onChange={(e) => setVal(f.key, e.target.value)} />
          </div>
        );

      case "textarea":
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}</label>}
            <textarea rows={3} className={cn(inputCls, "resize-none")} placeholder={f.placeholder} value={sVal(f.key)} onChange={(e) => setVal(f.key, e.target.value)} />
          </div>
        );

      case "description":
        return (
          <div key={f.key}>
            <div className="relative">
              <textarea
                rows={4}
                className={cn(inputCls, "resize-none pr-12")}
                placeholder={f.placeholder}
                value={sVal("description")}
                onChange={(e) => setVal("description", e.target.value)}
              />
              <button
                onClick={toggleVoice}
                aria-label="Voice to text"
                className={cn("absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors", recording ? "bg-[#ef4d62] animate-pulse" : "bg-[#ef4d62] hover:bg-[#ef4d62]/90")}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 inline-flex items-center gap-1"><Mic className="w-3 h-3" /> Tap mic button to add voice description</p>
          </div>
        );

      case "select": {
        const open = openSelect === f.key;
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-[#ef4d62]"> *</span>}</label>}
            <div className="relative">
              <button type="button" onClick={() => setOpenSelect(open ? null : f.key)} className={cn(inputCls, "flex items-center justify-between text-left")}>
                <span className={sVal(f.key) ? "text-gray-900" : "text-gray-400"}>{sVal(f.key) || f.placeholder || "Select"}</span>
                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform shrink-0", open && "rotate-180")} />
              </button>
              {open && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1">
                  {(f.options ?? []).map((opt) => (
                    <button key={opt} type="button" onClick={() => { setVal(f.key, opt); setOpenSelect(null); }} className="w-full text-left px-3.5 py-2 text-sm hover:bg-gray-50">{opt}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "chips":
        return (
          <div key={f.key}>
            {f.label && <p className="text-xs text-gray-500 mb-2">{f.label}</p>}
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map((opt) => <Chip key={opt} label={opt} active={aVal(f.key).includes(opt)} onClick={() => toggleArr(f.key, opt)} />)}
            </div>
          </div>
        );

      case "radio":
        return (
          <div key={f.key} className="grid grid-cols-2 gap-2.5">
            {(f.options ?? []).map((opt) => {
              const active = sVal(f.key) === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setVal(f.key, active ? "" : opt)}
                  className={cn("flex items-center gap-2 rounded-xl border p-3 text-left transition-all active:scale-[0.98]", active ? "border-[#ef4d62] bg-[#ef4d62]/5" : "border-gray-200 hover:border-[#ef4d62]/40")}
                >
                  <span className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", active ? "border-[#ef4d62]" : "border-gray-300")}>
                    {active && <span className="w-2 h-2 rounded-full bg-[#ef4d62]" />}
                  </span>
                  <span className="text-xs font-medium text-gray-800">{opt}</span>
                </button>
              );
            })}
          </div>
        );

      case "priceRange":
        return (
          <div key={f.key}>
            <p className="text-xs text-gray-500 mb-1.5">{f.label}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                <input className={cn(inputCls, "pl-7")} placeholder="Min" value={sVal("budgetMin")} onChange={(e) => setVal("budgetMin", e.target.value)} />
              </div>
              <span className="text-gray-400">-</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                <input className={cn(inputCls, "pl-7")} placeholder="Max" value={sVal("budgetMax")} onChange={(e) => setVal("budgetMax", e.target.value)} />
              </div>
            </div>
          </div>
        );

      case "files":
        return (
          <div key={f.key}>
            <input type="file" ref={fileInputRef} onChange={onFiles} accept="image/*,video/*,.pdf" multiple className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-gray-300 p-5 text-center hover:border-[#ef4d62]/50 transition-colors">
              <div className="flex justify-center gap-3 mb-2">
                {[ImageIcon, Video, FileUp].map((Ic, i) => (
                  <span key={i} className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500"><Ic className="w-4 h-4" /></span>
                ))}
              </div>
              <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700"><Plus className="w-3.5 h-3.5" /> Add photos, videos or PDF</p>
              <p className="text-[11px] text-gray-400 mt-1">Upload designs, inspiration images, PDFs, videos</p>
            </button>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((file, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-700">
                    <FileUp className="w-3 h-3" /> <span className="truncate max-w-[120px]">{file.name}</span>
                    <button onClick={() => removeFile(i)} aria-label="Remove"><X className="w-3 h-3 text-gray-400 hover:text-[#ef4d62]" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ── SUCCESS (full-screen coral, per reference) ──
  if (step === "success") {
    return (
      <div className="fixed inset-0 z-[80] bg-[#ef4d62] flex flex-col items-center justify-center text-center px-8">
        <CosoraLogo height={38} variant="white" className="mb-8" />
        <motion.div
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
          className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
            <Check className="w-9 h-9 text-[#ef4d62]" strokeWidth={3} />
          </div>
        </motion.div>
        <p className="text-white text-lg font-semibold max-w-xs">Your requirement has been submitted successfully</p>
        <button onClick={() => navigate("/requirement/my-quotes")} className="mt-8 text-white/80 text-sm underline underline-offset-4">
          View my quotes now
        </button>
      </div>
    );
  }

  return (
    <BuyerShell>
      <div className="max-w-2xl mx-auto px-4 pt-3 pb-28">
        <AnimatePresence mode="wait">
          {/* ─── HUB ─── */}
          {step === "main" && (
            <motion.div key="main" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -12 }}>
              <div className="text-center mb-5">
                <h1 className="text-xl font-bold text-gray-900">Post Your Requirement</h1>
                <p className="text-sm text-gray-500 mt-0.5">Get quotes from verified manufacturers</p>
              </div>

              {/* Quick Quote */}
              <button
                onClick={() => setQuickOpen(true)}
                className="w-full text-left rounded-2xl border-2 border-[#ef4d62]/30 bg-[#ef4d62]/5 p-4 mb-4 hover:border-[#ef4d62]/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-[#ef4d62]/15 flex items-center justify-center text-[#ef4d62] shrink-0">
                    <Zap className="w-5 h-5 fill-[#ef4d62]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-bold text-gray-900">Quick Quote</h3>
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase bg-[#ef4d62]/10 text-[#ef4d62] px-1.5 py-0.5 rounded"><Sparkles className="w-2.5 h-2.5" /> Fast</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Just upload an image + quantity. Get quotes in minutes!</p>
                    <p className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-2"><Clock className="w-3 h-3" /> Takes 30 seconds</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Create New Requirement */}
              <button
                onClick={() => setStep("category")}
                className="w-full text-left rounded-2xl border border-gray-200 bg-white p-4 mb-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900">Create New Requirement</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Detailed specifications for precise quotes</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Category-specific fields</span>
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Fabric, Specs, Quantity</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </button>

              <button
                onClick={() => navigate("/requirement/my-quotes")}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                <FileText className="w-4 h-4" /> My Previous Quotes
              </button>
            </motion.div>
          )}

          {/* ─── CATEGORY SELECT ─── */}
          {step === "category" && (
            <motion.div key="category" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }}>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep("main")} aria-label="Back" className="-ml-1 p-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Request Quote from Sellers</h1>
                  <p className="text-xs text-gray-500">Share your requirement and receive multiple quotes from relevant sellers.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Select one Category</h2>
                <div className="grid grid-cols-4 gap-x-3 gap-y-4">
                  {CATEGORIES.map((cat) => {
                    const active = cat.id === categoryId;
                    return (
                      <button key={cat.id} onClick={() => setCategoryId(cat.id)} className="text-center">
                        <div className={cn("relative aspect-square rounded-full overflow-hidden mb-1.5 ring-2 transition-all", active ? "ring-[#ef4d62]" : "ring-transparent")}>
                          <img src={cat.img} alt={cat.name} className="w-full h-full object-cover" loading="lazy" />
                          {active && (
                            <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                              <span className="w-6 h-6 rounded-full bg-[#ef4d62] flex items-center justify-center"><Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /></span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-600 font-medium leading-tight line-clamp-2">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => categoryId && setStep("form")}
                disabled={!categoryId}
                className={cn("mt-4 w-full py-3 rounded-xl text-sm font-bold transition-colors", categoryId ? "bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed")}
              >
                Save
              </button>
            </motion.div>
          )}

          {/* ─── FORM (schema-driven, per category) ─── */}
          {step === "form" && category && (
            <motion.div key="form" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("category")} aria-label="Back" className="-ml-1 p-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">Post Your Requirement</h1>
                  <p className="text-xs text-gray-500">Fill in the details below</p>
                </div>
              </div>

              {/* Category card */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-3">
                <img src={category.img} alt={category.name} className="w-11 h-11 rounded-full object-cover" />
                <div className="flex-1">
                  <p className="text-[11px] text-gray-400">Category</p>
                  <p className="text-sm font-bold text-gray-900">{category.name}</p>
                </div>
                <button onClick={() => setStep("category")} className="text-xs font-semibold text-[#ef4d62] hover:underline">Change</button>
              </div>

              {/* Numbered sections for this category */}
              {sections.map((section, si) => (
                <SectionCard key={section.title} n={si + 1} title={section.title}>
                  <div className="space-y-3">
                    {toRows(section.fields).map((row, ri) =>
                      row.length === 2 ? (
                        <div key={ri} className="grid grid-cols-2 gap-3">
                          {row.map(renderField)}
                        </div>
                      ) : (
                        renderField(row[0])
                      )
                    )}
                  </div>
                </SectionCard>
              ))}

              {/* Deadline note */}
              <div className="rounded-xl bg-[#ef4d62]/5 border border-[#ef4d62]/20 px-3.5 py-2.5 flex items-start gap-2">
                <Clock className="w-4 h-4 text-[#ef4d62] mt-0.5 shrink-0" />
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Every quote has an automatic <span className="font-semibold text-gray-800">7-day deadline</span>. Once it's reached, you'll get an option to extend it.
                </p>
              </div>

              {/* Submit */}
              <button onClick={submit} className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white py-3.5 text-sm font-bold transition-colors active:scale-[0.99]">
                <Send className="w-4 h-4" /> Submit Quote Request
              </button>
              <p className="text-[11px] text-center text-gray-400">
                Your request will be sent to verified manufacturers. Expect quotes within 24-48 hours.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <QuickRfqModal isOpen={quickOpen} onClose={() => setQuickOpen(false)} />
    </BuyerShell>
  );
};

export default PostRequirement;
