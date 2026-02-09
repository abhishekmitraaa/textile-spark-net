// Seller Categories Data Structure for Cosora B2B Marketplace

export type FieldType = "text" | "number" | "select" | "multiselect" | "textarea" | "checkbox" | "size-selector" | "color-picker";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
  unit?: string;
  fullWidth?: boolean;
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

// Size options for different garment types
const standardSizes = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "Free Size"];
const pantWaistSizes = ["28", "30", "32", "34", "36", "38", "40", "42", "44", "46"];
const pantLengths = ["28", "30", "32", "34", "36", "38", "40"];
const kidsSizes = ["0-3M", "3-6M", "6-12M", "1-2Y", "2-3Y", "3-4Y", "4-5Y", "5-6Y", "6-7Y", "7-8Y", "8-10Y", "10-12Y", "12-14Y"];

export const sellerCategories: SellerCategory[] = [
  {
    id: "fashion-accessories",
    name: "Fashion Accessories (Unisex)",
    icon: "Gem",
    type: "product",
    subCategories: [
      { 
        id: "bags", 
        name: "Bags",
        fields: [
          { id: "bagType", label: "Bag Type", type: "select", options: ["Tote", "Backpack", "Clutch", "Sling", "Messenger", "Duffle", "Laptop Bag", "Travel Bag", "Handbag", "Wallet"], required: true },
          { id: "material", label: "Material", type: "select", options: ["Genuine Leather", "Faux Leather", "Canvas", "Nylon", "Cotton", "Jute", "Polyester"], required: true },
          { id: "dimensions", label: "Dimensions (LxWxH)", type: "text", placeholder: "e.g., 40x30x15 cm" },
          { id: "closure", label: "Closure Type", type: "select", options: ["Zipper", "Magnetic", "Buckle", "Drawstring", "Flap", "Open"] },
          { id: "compartments", label: "No. of Compartments", type: "number", placeholder: "e.g., 3" },
          { id: "colors", label: "Available Colors", type: "multiselect", options: ["Black", "Brown", "Tan", "Navy", "Grey", "Beige", "White", "Red", "Pink", "Green"], fullWidth: true },
        ]
      },
      { 
        id: "belts", 
        name: "Belts",
        fields: [
          { id: "material", label: "Material", type: "select", options: ["Genuine Leather", "Faux Leather", "Canvas", "Fabric", "Braided"], required: true },
          { id: "buckleType", label: "Buckle Type", type: "select", options: ["Pin Buckle", "Auto Lock", "Plate Buckle", "Box Frame", "Slide Buckle"], required: true },
          { id: "width", label: "Width (mm)", type: "select", options: ["25", "30", "35", "40", "45"] },
          { id: "sizes", label: "Available Sizes", type: "size-selector", options: ["28", "30", "32", "34", "36", "38", "40", "42", "44", "Free Size"] },
          { id: "colors", label: "Available Colors", type: "multiselect", options: ["Black", "Brown", "Tan", "Cognac", "Navy", "Burgundy"] },
        ]
      },
      { id: "caps-hats", name: "Caps & Hats", fields: [
        { id: "type", label: "Type", type: "select", options: ["Baseball Cap", "Beanie", "Fedora", "Bucket Hat", "Visor", "Snapback", "Trucker", "Sun Hat"] },
        { id: "material", label: "Material", type: "select", options: ["Cotton", "Polyester", "Wool", "Acrylic", "Straw", "Denim"] },
        { id: "sizes", label: "Sizes", type: "size-selector", options: ["S", "M", "L", "XL", "Free Size"] },
        { id: "colors", label: "Colors", type: "multiselect", options: ["Black", "White", "Navy", "Grey", "Beige", "Red", "Blue", "Green"] },
      ]},
      { id: "scarves-stoles", name: "Scarves & Stoles", fields: [
        { id: "material", label: "Material", type: "select", options: ["Silk", "Wool", "Cashmere", "Cotton", "Linen", "Chiffon", "Pashmina"] },
        { id: "dimensions", label: "Dimensions", type: "text", placeholder: "e.g., 180x60 cm" },
        { id: "pattern", label: "Pattern", type: "multiselect", options: ["Solid", "Printed", "Embroidered", "Woven", "Striped", "Checked"] },
      ]},
      { id: "sunglasses", name: "Sunglasses", fields: [
        { id: "frameType", label: "Frame Type", type: "select", options: ["Aviator", "Wayfarer", "Round", "Square", "Cat Eye", "Rectangular", "Oversized"] },
        { id: "frameMaterial", label: "Frame Material", type: "select", options: ["Metal", "Plastic", "Acetate", "Titanium", "TR90"] },
        { id: "lensType", label: "Lens Type", type: "select", options: ["Polarized", "UV Protected", "Gradient", "Mirrored", "Photochromic"] },
        { id: "colors", label: "Frame Colors", type: "multiselect", options: ["Black", "Gold", "Silver", "Tortoise", "Brown", "White", "Transparent"] },
      ]},
      { id: "watches", name: "Watches", fields: [
        { id: "watchType", label: "Type", type: "select", options: ["Analog", "Digital", "Smart Watch", "Chronograph", "Automatic", "Quartz"] },
        { id: "strapMaterial", label: "Strap Material", type: "select", options: ["Leather", "Metal", "Silicone", "Nylon", "Fabric", "Ceramic"] },
        { id: "caseDiameter", label: "Case Diameter (mm)", type: "select", options: ["34", "36", "38", "40", "42", "44", "46"] },
        { id: "waterResistance", label: "Water Resistance", type: "select", options: ["30m", "50m", "100m", "200m", "None"] },
      ]},
      { id: "jewellery", name: "Jewellery", fields: [
        { id: "jewelleryType", label: "Type", type: "select", options: ["Necklace", "Earrings", "Bracelet", "Ring", "Anklet", "Brooch", "Set"] },
        { id: "material", label: "Material", type: "multiselect", options: ["Gold Plated", "Silver", "Sterling Silver", "Oxidized", "Brass", "Copper", "Artificial", "Stone"] },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Daily Wear", "Party", "Wedding", "Festive", "Office", "Traditional"] },
      ]},
      { id: "socks", name: "Socks", fields: [
        { id: "sockType", label: "Type", type: "select", options: ["Ankle", "No-show", "Crew", "Knee-high", "Compression", "Sports"] },
        { id: "material", label: "Material", type: "select", options: ["Cotton", "Wool", "Bamboo", "Polyester Blend", "Nylon"] },
        { id: "sizes", label: "Sizes", type: "size-selector", options: ["Free Size", "S", "M", "L", "XL"] },
        { id: "packOf", label: "Pack Of", type: "select", options: ["1", "3", "5", "6", "12"] },
      ]},
      { id: "gloves", name: "Gloves", fields: [
        { id: "gloveType", label: "Type", type: "select", options: ["Winter", "Driving", "Fashion", "Work", "Sports", "Touch Screen"] },
        { id: "material", label: "Material", type: "select", options: ["Leather", "Wool", "Cotton", "Fleece", "Synthetic"] },
        { id: "sizes", label: "Sizes", type: "size-selector", options: ["S", "M", "L", "XL", "Free Size"] },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "raw-materials",
    name: "Raw Materials – Fabrics & Inputs",
    icon: "Layers",
    type: "product",
    subCategories: [
      { id: "knitted-fabrics", name: "Knitted Fabrics", fields: [
        { id: "knitType", label: "Knit Type", type: "select", options: ["Single Jersey", "Double Jersey", "Interlock", "Rib", "Pique", "Fleece", "Terry"], required: true },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Cotton, 95% Cotton 5% Spandex", required: true },
        { id: "gsm", label: "GSM", type: "number", placeholder: "e.g., 180", required: true },
        { id: "width", label: "Width (inches)", type: "select", options: ["36", "44", "48", "58", "60", "64", "72", "Open Width"] },
        { id: "finish", label: "Finish", type: "multiselect", options: ["Bio-washed", "Enzyme", "Peach", "Brushed", "Suede", "Normal"] },
        { id: "dyeType", label: "Dye Type", type: "select", options: ["Yarn Dyed", "Piece Dyed", "RFD", "AOP", "Solid", "Melange"] },
        { id: "shrinkage", label: "Shrinkage %", type: "text", placeholder: "e.g., 3-5%" },
        { id: "colors", label: "Available Colors", type: "text", placeholder: "e.g., 50+ colors or specify" },
      ]},
      { id: "woven-fabrics", name: "Woven Fabrics", fields: [
        { id: "weaveType", label: "Weave Type", type: "select", options: ["Plain", "Twill", "Satin", "Dobby", "Jacquard", "Oxford", "Poplin", "Chambray"], required: true },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Cotton", required: true },
        { id: "threadCount", label: "Thread Count", type: "number", placeholder: "e.g., 200" },
        { id: "weight", label: "Weight (GSM)", type: "number", placeholder: "e.g., 120" },
        { id: "width", label: "Width (inches)", type: "select", options: ["36", "44", "48", "58", "60"] },
        { id: "construction", label: "Construction", type: "text", placeholder: "e.g., 60x60/90x88" },
        { id: "finish", label: "Finish", type: "multiselect", options: ["Normal", "Mercerized", "Sanforized", "Wrinkle-free", "Water-repellent"] },
      ]},
      { id: "denim", name: "Denim", fields: [
        { id: "denimType", label: "Denim Type", type: "select", options: ["Raw/Rigid", "Stretch", "Super Stretch", "Selvedge", "Colored", "Coated"], required: true },
        { id: "oz", label: "Oz Weight", type: "select", options: ["6", "7", "8", "9", "10", "11", "12", "13", "14", "15+"], required: true },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 98% Cotton 2% Lycra" },
        { id: "stretch", label: "Stretch %", type: "number", placeholder: "e.g., 15" },
        { id: "width", label: "Width (inches)", type: "select", options: ["52", "54", "56", "58", "60", "62"] },
        { id: "wash", label: "Wash Type", type: "multiselect", options: ["Raw", "Rinse", "Stone Wash", "Acid Wash", "Enzyme", "Vintage", "Damaged"] },
      ]},
      { id: "terry-fleece", name: "Terry & Fleece", fields: [
        { id: "type", label: "Type", type: "select", options: ["French Terry", "Polar Fleece", "Anti-pill Fleece", "Sherpa", "Loop Terry", "Brushed Terry"], required: true },
        { id: "gsm", label: "GSM", type: "number", placeholder: "e.g., 280", required: true },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 80% Cotton 20% Poly" },
        { id: "width", label: "Width (inches)", type: "number", placeholder: "e.g., 60" },
      ]},
      { id: "sustainable-fabrics", name: "Sustainable Fabrics", fields: [
        { id: "certification", label: "Certification", type: "multiselect", options: ["GOTS", "OEKO-TEX", "BCI", "GRS", "OCS", "FSC", "Bluesign"], required: true, fullWidth: true },
        { id: "materialType", label: "Material Type", type: "select", options: ["Organic Cotton", "Recycled Polyester", "Tencel/Lyocell", "Hemp", "Bamboo", "Linen", "Recycled Nylon"] },
        { id: "gsm", label: "GSM", type: "number", placeholder: "e.g., 180" },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Organic Cotton" },
      ]},
      { id: "yarns", name: "Yarns", fields: [
        { id: "yarnType", label: "Yarn Type", type: "select", options: ["Carded", "Combed", "Ring Spun", "Open End", "Slub", "Melange"], required: true },
        { id: "count", label: "Yarn Count", type: "text", placeholder: "e.g., 30s, 40s, 2/30s", required: true },
        { id: "ply", label: "Ply", type: "select", options: ["Single", "2-ply", "3-ply", "Multi-ply"] },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 100% Cotton" },
        { id: "twist", label: "Twist Direction", type: "select", options: ["S Twist", "Z Twist"] },
      ]},
      { id: "threads", name: "Threads", fields: [
        { id: "threadType", label: "Thread Type", type: "select", options: ["Spun Polyester", "Core Spun", "Filament", "Cotton", "Nylon", "Silk"] },
        { id: "ticketNo", label: "Ticket Number", type: "select", options: ["20", "40", "60", "80", "120", "150"] },
        { id: "cones", label: "Cone Size (m)", type: "select", options: ["500", "1000", "2000", "5000", "10000"] },
      ]},
      { id: "linings-interlinings", name: "Linings & Interlinings", fields: [
        { id: "type", label: "Type", type: "select", options: ["Fusible", "Non-fusible", "Woven", "Non-woven", "Knit"] },
        { id: "weight", label: "Weight (GSM)", type: "number", placeholder: "e.g., 40" },
        { id: "color", label: "Color", type: "select", options: ["White", "Black", "Charcoal", "Natural"] },
      ]},
      { id: "laces-nets", name: "Laces & Nets", fields: [
        { id: "type", label: "Type", type: "select", options: ["Cotton Lace", "Nylon Lace", "Guipure", "Chantilly", "Net Fabric", "Tulle"] },
        { id: "width", label: "Width (inches)", type: "text", placeholder: "e.g., 3 inches or full width" },
      ]},
      { id: "tapes-cords", name: "Tapes & Cords", fields: [
        { id: "type", label: "Type", type: "select", options: ["Twill Tape", "Herringbone Tape", "Grosgrain", "Cotton Cord", "Polyester Cord", "Drawstring"] },
        { id: "width", label: "Width/Diameter", type: "text", placeholder: "e.g., 10mm" },
      ]},
      { id: "elastics", name: "Elastics", fields: [
        { id: "elasticType", label: "Type", type: "select", options: ["Braided", "Woven", "Knitted", "Jacquard", "Printed", "Foldover"] },
        { id: "width", label: "Width (mm)", type: "select", options: ["6", "10", "15", "20", "25", "30", "35", "40", "50"] },
        { id: "stretch", label: "Stretch Ratio", type: "text", placeholder: "e.g., 1:3" },
      ]},
      { id: "dyes", name: "Dyes", fields: [
        { id: "dyeClass", label: "Dye Class", type: "select", options: ["Reactive", "Disperse", "Acid", "Direct", "Vat", "Pigment", "Sulphur"] },
        { id: "shade", label: "Shade Range", type: "text", placeholder: "e.g., Full shade range" },
      ]},
      { id: "chemicals", name: "Chemicals", fields: [
        { id: "chemicalType", label: "Type", type: "select", options: ["Pre-treatment", "Dyeing Auxiliary", "Finishing", "Softener", "Binder", "Thickener"] },
        { id: "application", label: "Application", type: "text", placeholder: "e.g., Fabric softening" },
      ]},
      { id: "finishes", name: "Finishes", fields: [
        { id: "finishType", label: "Finish Type", type: "multiselect", options: ["Water Repellent", "Fire Retardant", "Anti-microbial", "UV Protection", "Wrinkle-free", "Stain Resistant"] },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "trims-accessories",
    name: "Trims & Accessories",
    icon: "Scissors",
    type: "product",
    subCategories: [
      { id: "buttons", name: "Buttons", fields: [
        { id: "buttonType", label: "Button Type", type: "select", options: ["2-hole", "4-hole", "Shank", "Snap", "Toggle", "Horn", "Metal", "Coconut", "Pearl"], required: true },
        { id: "material", label: "Material", type: "select", options: ["Polyester", "Metal", "Wood", "Shell", "Coconut", "Horn", "Corozo"], required: true },
        { id: "size", label: "Size (ligne/mm)", type: "text", placeholder: "e.g., 24L / 15mm" },
        { id: "finish", label: "Finish", type: "select", options: ["Polished", "Matte", "Antique", "Brushed", "Lacquered"] },
        { id: "colors", label: "Colors Available", type: "text", placeholder: "e.g., 20+ colors" },
      ]},
      { id: "zippers", name: "Zippers", fields: [
        { id: "zipperType", label: "Zipper Type", type: "select", options: ["Metal", "Nylon Coil", "Vislon/Plastic", "Invisible", "Water-resistant", "Two-way"], required: true },
        { id: "size", label: "Size (#)", type: "select", options: ["#3", "#4", "#5", "#7", "#8", "#10"] },
        { id: "length", label: "Length Range (cm)", type: "text", placeholder: "e.g., 10-80 cm" },
        { id: "endType", label: "End Type", type: "select", options: ["Closed End", "Open End", "Two-way Open", "Two-way Closed"] },
        { id: "sliderType", label: "Slider Type", type: "select", options: ["Auto Lock", "Non-lock", "Pin Lock", "Semi-auto"] },
      ]},
      { id: "hook-eye", name: "Hook & Eye", fields: [
        { id: "size", label: "Size", type: "select", options: ["0", "1", "2", "3", "4", "5"] },
        { id: "material", label: "Material", type: "select", options: ["Steel", "Brass", "Nylon Coated"] },
        { id: "finish", label: "Finish", type: "select", options: ["Nickel", "Black", "Antique Brass", "Gold"] },
      ]},
      { id: "velcro-tape", name: "Velcro Tape", fields: [
        { id: "type", label: "Type", type: "select", options: ["Sew-on", "Adhesive", "Heat-seal"] },
        { id: "width", label: "Width (mm)", type: "select", options: ["16", "20", "25", "30", "38", "50", "100"] },
        { id: "strength", label: "Strength", type: "select", options: ["Standard", "Heavy Duty", "Low Profile"] },
      ]},
      { id: "elastic", name: "Elastic", fields: [
        { id: "type", label: "Type", type: "select", options: ["Braided", "Woven", "Knitted", "Buttonhole", "Foldover", "Printed"] },
        { id: "width", label: "Width (mm)", type: "select", options: ["6", "10", "15", "20", "25", "30", "38", "50"] },
      ]},
      { id: "drawcords-toggles", name: "Drawcords & Toggles", fields: [
        { id: "cordType", label: "Cord Type", type: "select", options: ["Round", "Flat", "Reflective", "Braided"] },
        { id: "toggleType", label: "Toggle Type", type: "select", options: ["Barrel", "Spring", "Cord Lock", "Ball End", "Metal Tip"] },
        { id: "material", label: "Material", type: "select", options: ["Cotton", "Polyester", "Nylon", "Silicone"] },
      ]},
      { id: "eyelets-grommets", name: "Eyelets & Grommets", fields: [
        { id: "size", label: "Size (mm)", type: "select", options: ["4", "5", "6", "8", "10", "12", "14", "16", "20"] },
        { id: "material", label: "Material", type: "select", options: ["Brass", "Steel", "Aluminum", "Stainless Steel"] },
        { id: "finish", label: "Finish", type: "select", options: ["Nickel", "Antique Brass", "Black", "Gold", "Gun Metal"] },
      ]},
      { id: "labels", name: "Labels", fields: [
        { id: "labelType", label: "Label Type", type: "select", options: ["Woven", "Printed Satin", "Printed Cotton", "Leather Patch", "Rubber Patch"] },
        { id: "foldType", label: "Fold Type", type: "select", options: ["Flat", "Center Fold", "End Fold", "Loop Fold", "Miter Fold"] },
        { id: "size", label: "Size (mm)", type: "text", placeholder: "e.g., 30x60mm" },
      ]},
      { id: "lace-tapes", name: "Lace & Tapes", fields: [
        { id: "type", label: "Type", type: "select", options: ["Cotton Lace", "Nylon Lace", "Crochet", "Twill Tape", "Satin Ribbon"] },
        { id: "width", label: "Width (mm)", type: "text", placeholder: "e.g., 25mm" },
      ]},
      { id: "interlining", name: "Interlining", fields: [
        { id: "type", label: "Type", type: "select", options: ["Fusible", "Non-fusible", "Woven", "Non-woven", "Knit"] },
        { id: "weight", label: "Weight (GSM)", type: "select", options: ["20", "30", "40", "60", "80", "100"] },
        { id: "bonding", label: "Bonding Temperature", type: "text", placeholder: "e.g., 130-140°C" },
      ]},
      { id: "rivets-studs", name: "Rivets & Studs", fields: [
        { id: "type", label: "Type", type: "select", options: ["Jean Rivet", "Cap Rivet", "Dome Stud", "Pyramid Stud", "Spike Stud"] },
        { id: "size", label: "Size (mm)", type: "select", options: ["6", "7", "8", "9", "10", "12"] },
        { id: "finish", label: "Finish", type: "select", options: ["Nickel", "Antique Brass", "Black Nickel", "Copper", "Gun Metal"] },
      ]},
      { id: "cord-locks-stoppers", name: "Cord Locks & Stoppers", fields: [
        { id: "type", label: "Type", type: "select", options: ["Single Hole", "Double Hole", "Spring Loaded", "Toggle", "Push Button"] },
        { id: "material", label: "Material", type: "select", options: ["Plastic", "Metal", "Silicone"] },
      ]},
      { id: "patches", name: "Patches", fields: [
        { id: "type", label: "Type", type: "select", options: ["Woven", "Embroidered", "Leather", "PVC/Rubber", "Printed", "Sublimated"] },
        { id: "backing", label: "Backing", type: "select", options: ["Sew-on", "Iron-on", "Velcro", "Adhesive"] },
        { id: "shape", label: "Shape", type: "select", options: ["Rectangle", "Round", "Oval", "Custom Die Cut"] },
      ]},
      { id: "tassels-fringes", name: "Tassels & Fringes", fields: [
        { id: "type", label: "Type", type: "select", options: ["Thread Tassel", "Leather Tassel", "Beaded", "Bullion Fringe", "Chainette"] },
        { id: "length", label: "Length", type: "text", placeholder: "e.g., 5 inches" },
      ]},
    ],
    commonFields: [
      { id: "colors", label: "Colors Available", type: "text", placeholder: "e.g., 20+ colors or custom" },
    ],
  },
  {
    id: "labels-tags",
    name: "Labels & Tags",
    icon: "Tag",
    type: "product",
    subCategories: [
      { id: "woven-labels", name: "Woven Labels", fields: [
        { id: "weaveType", label: "Weave Type", type: "select", options: ["Damask", "Taffeta", "Satin"], required: true },
        { id: "foldType", label: "Fold Type", type: "select", options: ["Flat", "Center Fold", "End Fold", "Loop Fold", "Miter Fold", "Manhattan Fold"], required: true },
        { id: "size", label: "Size (mm)", type: "text", placeholder: "e.g., 25x50mm", required: true },
        { id: "backing", label: "Backing", type: "select", options: ["Plain", "Heat Seal", "Adhesive", "Iron-on"] },
        { id: "maxColors", label: "Max Colors", type: "number", placeholder: "e.g., 8" },
      ]},
      { id: "printed-labels", name: "Printed Labels", fields: [
        { id: "material", label: "Material", type: "select", options: ["Satin", "Cotton", "Nylon", "Polyester", "Tyvek"], required: true },
        { id: "printMethod", label: "Print Method", type: "select", options: ["Screen Print", "Digital Print", "Heat Transfer", "Flexo"] },
        { id: "foldType", label: "Fold Type", type: "select", options: ["Flat", "Center Fold", "End Fold", "Loop Fold"] },
        { id: "size", label: "Size (mm)", type: "text", placeholder: "e.g., 30x40mm" },
      ]},
      { id: "hang-tags", name: "Hang Tags", fields: [
        { id: "material", label: "Material", type: "select", options: ["Art Card", "Kraft Paper", "Recycled Paper", "Fabric", "Wood", "Acrylic"], required: true },
        { id: "gsm", label: "Paper GSM", type: "select", options: ["250", "300", "350", "400", "Custom"] },
        { id: "finish", label: "Finish", type: "multiselect", options: ["Matte", "Gloss", "Spot UV", "Foil Stamping", "Embossing", "Die Cut"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., 50x80mm" },
        { id: "hole", label: "Hole Type", type: "select", options: ["Round", "Slot", "Reinforced Eyelet", "None"] },
      ]},
      { id: "size-tags", name: "Size Tags", fields: [
        { id: "material", label: "Material", type: "select", options: ["Woven", "Printed Satin", "Paper", "PVC"] },
        { id: "shape", label: "Shape", type: "select", options: ["Rectangular", "Square", "Round", "Die-cut"] },
        { id: "sizeRange", label: "Size Range", type: "text", placeholder: "e.g., XS-5XL" },
      ]},
      { id: "care-labels", name: "Care Labels", fields: [
        { id: "material", label: "Material", type: "select", options: ["Satin", "Nylon", "Cotton", "Tyvek"], required: true },
        { id: "content", label: "Content Includes", type: "multiselect", options: ["Care Symbols", "Fiber Content", "Country of Origin", "RN Number", "Size"], fullWidth: true },
        { id: "foldType", label: "Fold Type", type: "select", options: ["Center Fold", "End Fold", "Straight Cut"] },
      ]},
      { id: "content-labels", name: "Content Labels", fields: [
        { id: "material", label: "Material", type: "select", options: ["Satin", "Nylon", "Cotton"] },
        { id: "languages", label: "Languages", type: "multiselect", options: ["English", "Spanish", "French", "German", "Chinese", "Japanese", "Arabic"] },
      ]},
      { id: "rfid-qr-labels", name: "RFID / QR Code Labels", fields: [
        { id: "technology", label: "Technology", type: "select", options: ["RFID UHF", "RFID HF", "NFC", "QR Code", "Barcode"], required: true },
        { id: "form", label: "Form Factor", type: "select", options: ["Label", "Hang Tag", "Woven Label", "Sticker"] },
        { id: "readRange", label: "Read Range", type: "text", placeholder: "e.g., Up to 10m for UHF" },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "packaging",
    name: "Packaging",
    icon: "Package",
    type: "product",
    subCategories: [
      { id: "polybags", name: "Polybags", fields: [
        { id: "material", label: "Material", type: "select", options: ["LDPE", "HDPE", "PP", "Biodegradable", "Recycled"], required: true },
        { id: "micron", label: "Micron", type: "select", options: ["25", "30", "40", "50", "60", "80", "100"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., 12x15 inches" },
        { id: "type", label: "Type", type: "select", options: ["Plain", "Printed", "Self-seal", "Zipper", "Hanger Hole"] },
      ]},
      { id: "paper-bags", name: "Paper Bags", fields: [
        { id: "paperType", label: "Paper Type", type: "select", options: ["Kraft", "Art Paper", "Recycled", "Laminated"], required: true },
        { id: "gsm", label: "GSM", type: "select", options: ["120", "150", "170", "200", "250"] },
        { id: "handle", label: "Handle Type", type: "select", options: ["Twisted Paper", "Flat Paper", "Cotton Rope", "Ribbon", "Die-cut"] },
        { id: "size", label: "Size (LxWxH)", type: "text", placeholder: "e.g., 30x10x40 cm" },
      ]},
      { id: "corrugated-boxes", name: "Corrugated Boxes", fields: [
        { id: "flute", label: "Flute Type", type: "select", options: ["A Flute", "B Flute", "C Flute", "E Flute", "BC Double Wall"], required: true },
        { id: "ply", label: "Ply", type: "select", options: ["3 Ply", "5 Ply", "7 Ply"] },
        { id: "burstStrength", label: "Bursting Strength (kg/cm²)", type: "number", placeholder: "e.g., 12" },
        { id: "size", label: "Size (LxWxH)", type: "text", placeholder: "e.g., 40x30x30 cm" },
      ]},
      { id: "garment-boxes", name: "Garment Boxes", fields: [
        { id: "material", label: "Material", type: "select", options: ["Rigid Board", "Corrugated", "Kraft", "Art Card"] },
        { id: "style", label: "Style", type: "select", options: ["Shirt Box", "Gift Box", "Magnetic Closure", "Drawer Box", "Sleeve Box"] },
        { id: "finish", label: "Finish", type: "multiselect", options: ["Matte Lamination", "Gloss Lamination", "Spot UV", "Foil", "Embossing"] },
      ]},
      { id: "envelope-packaging", name: "Envelope Packaging", fields: [
        { id: "material", label: "Material", type: "select", options: ["Paper", "Poly Mailer", "Bubble Mailer", "Kraft"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., A4, A5, Custom" },
        { id: "closure", label: "Closure", type: "select", options: ["Peel & Seal", "Gummed", "String & Button"] },
      ]},
      { id: "ziplock-bags", name: "Ziplock Bags", fields: [
        { id: "material", label: "Material", type: "select", options: ["LDPE", "PVC", "Eva", "Biodegradable"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., 15x20 cm" },
        { id: "features", label: "Features", type: "multiselect", options: ["Slider", "Double Zip", "Hang Hole", "Frosted", "Clear"] },
      ]},
      { id: "hang-tag-string-seal", name: "Hang Tag String & Seal", fields: [
        { id: "stringType", label: "String Type", type: "select", options: ["Cotton", "Polyester", "Jute", "Waxed", "Elastic"] },
        { id: "sealType", label: "Seal Type", type: "select", options: ["Bullet", "Square", "Custom Shape", "Metal", "Plastic"] },
        { id: "length", label: "String Length", type: "text", placeholder: "e.g., 8 inches" },
      ]},
      { id: "tissue-paper", name: "Tissue Paper", fields: [
        { id: "gsm", label: "GSM", type: "select", options: ["17", "20", "22", "24", "28"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., 50x70 cm" },
        { id: "type", label: "Type", type: "select", options: ["Solid Color", "Printed", "Acid-free", "MG/MF"] },
      ]},
      { id: "stickers-labels", name: "Stickers & Labels", fields: [
        { id: "material", label: "Material", type: "select", options: ["Paper", "Vinyl", "BOPP", "Polyester", "Kraft"] },
        { id: "adhesive", label: "Adhesive", type: "select", options: ["Permanent", "Removable", "Freezer Grade"] },
        { id: "finish", label: "Finish", type: "select", options: ["Matte", "Gloss", "Metallic", "Transparent"] },
      ]},
      { id: "packaging-inserts", name: "Packaging Inserts & Accessories", fields: [
        { id: "type", label: "Type", type: "select", options: ["Thank You Card", "Insert Card", "Foam Insert", "Paper Filler", "Ribbon", "Bow"] },
        { id: "material", label: "Material", type: "text", placeholder: "e.g., 300gsm Art Card" },
      ]},
    ],
    commonFields: [
      { id: "customization", label: "Customization Options", type: "multiselect", options: ["Logo Print", "Custom Size", "Color Options", "Embossing", "Foil Stamping"], fullWidth: true },
    ],
  },
  {
    id: "apparel-home",
    name: "Apparel & Home Categories",
    icon: "Shirt",
    type: "product",
    subCategories: [
      { id: "mens-tshirts", name: "Men's T-Shirts", fields: [
        { id: "fabric", label: "Fabric", type: "select", options: ["100% Cotton", "Cotton Blend", "Polyester", "Tri-Blend", "Organic Cotton", "Bamboo"], required: true },
        { id: "gsm", label: "GSM", type: "select", options: ["140", "160", "180", "200", "220", "240", "260"] },
        { id: "neckType", label: "Neck Type", type: "select", options: ["Round Neck", "V-Neck", "Polo Collar", "Henley", "Crew Neck"], required: true },
        { id: "sleeveType", label: "Sleeve Type", type: "select", options: ["Half Sleeve", "Full Sleeve", "Sleeveless", "3/4 Sleeve", "Raglan"], required: true },
        { id: "fit", label: "Fit Type", type: "select", options: ["Regular", "Slim", "Relaxed", "Oversized", "Muscle Fit"], required: true },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: standardSizes, required: true, fullWidth: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Formal", "Sports", "Party", "Beach", "Festive"], fullWidth: true },
        { id: "pattern", label: "Pattern", type: "multiselect", options: ["Solid", "Striped", "Printed", "Tie-Dye", "Color Block", "Graphic"] },
        { id: "washCare", label: "Wash Care", type: "multiselect", options: ["Machine Wash", "Hand Wash", "Dry Clean", "Do Not Bleach", "Tumble Dry Low"], fullWidth: true },
        { id: "colors", label: "Available Colors", type: "text", placeholder: "e.g., 15+ colors available" },
      ]},
      { id: "mens-shirts", name: "Men's Shirts", fields: [
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Linen", "Cotton-Linen", "Oxford", "Twill", "Poplin", "Chambray", "Denim"], required: true },
        { id: "collarType", label: "Collar Type", type: "select", options: ["Regular Collar", "Button Down", "Mandarin", "Spread Collar", "Cutaway", "Club Collar"], required: true },
        { id: "sleeveType", label: "Sleeve Type", type: "select", options: ["Full Sleeve", "Half Sleeve", "Rolled Up"], required: true },
        { id: "fit", label: "Fit Type", type: "select", options: ["Regular", "Slim", "Tailored", "Relaxed"], required: true },
        { id: "cuffType", label: "Cuff Type", type: "select", options: ["Button Cuff", "French Cuff", "Convertible"] },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: ["38", "39", "40", "41", "42", "43", "44", "46", "48"], required: true, fullWidth: true },
        { id: "pattern", label: "Pattern", type: "multiselect", options: ["Solid", "Striped", "Checked", "Printed", "Dobby", "Self Textured"] },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Formal", "Semi-formal", "Casual", "Party", "Wedding"], fullWidth: true },
        { id: "washCare", label: "Wash Care", type: "multiselect", options: ["Machine Wash", "Hand Wash", "Dry Clean", "Iron Medium"], fullWidth: true },
      ]},
      { id: "mens-pants", name: "Men's Pants/Trousers", fields: [
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Poly-Cotton", "Linen", "Wool Blend", "Polyester", "Lycra Blend"], required: true },
        { id: "style", label: "Style", type: "select", options: ["Formal Trousers", "Chinos", "Cargo", "Joggers", "Pleated", "Flat Front"], required: true },
        { id: "fit", label: "Fit Type", type: "select", options: ["Regular", "Slim", "Skinny", "Relaxed", "Tapered", "Straight"], required: true },
        { id: "rise", label: "Rise", type: "select", options: ["Low Rise", "Mid Rise", "High Rise"] },
        { id: "waistSizes", label: "Waist Sizes", type: "size-selector", options: pantWaistSizes, required: true, fullWidth: true },
        { id: "lengths", label: "Length Options", type: "size-selector", options: pantLengths, fullWidth: true },
        { id: "closure", label: "Closure", type: "select", options: ["Button & Zip", "Hook & Eye", "Elastic Waist", "Drawstring"] },
        { id: "pockets", label: "Pocket Style", type: "select", options: ["Slant", "On-seam", "Welt", "Cargo"] },
        { id: "washCare", label: "Wash Care", type: "multiselect", options: ["Machine Wash", "Dry Clean", "Iron Low"], fullWidth: true },
      ]},
      { id: "mens-jeans", name: "Men's Jeans", fields: [
        { id: "denimWeight", label: "Denim Weight (Oz)", type: "select", options: ["8", "10", "11", "12", "13", "14", "14+"], required: true },
        { id: "composition", label: "Composition", type: "text", placeholder: "e.g., 98% Cotton 2% Lycra", required: true },
        { id: "fit", label: "Fit Type", type: "select", options: ["Skinny", "Slim", "Regular", "Relaxed", "Bootcut", "Straight", "Tapered"], required: true },
        { id: "rise", label: "Rise", type: "select", options: ["Low Rise", "Mid Rise", "High Rise"] },
        { id: "wash", label: "Wash Type", type: "select", options: ["Raw/Dry", "Rinse", "Light Wash", "Medium Wash", "Dark Wash", "Distressed", "Acid Wash"] },
        { id: "waistSizes", label: "Waist Sizes", type: "size-selector", options: pantWaistSizes, required: true, fullWidth: true },
        { id: "lengths", label: "Length Options", type: "size-selector", options: pantLengths, fullWidth: true },
        { id: "stretch", label: "Stretch", type: "select", options: ["No Stretch", "Light Stretch", "Medium Stretch", "Super Stretch"] },
        { id: "features", label: "Features", type: "multiselect", options: ["Whiskering", "Fading", "Ripped", "Patched", "Raw Hem"], fullWidth: true },
      ]},
      { id: "womens-tops", name: "Women's Tops", fields: [
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Rayon", "Crepe", "Georgette", "Chiffon", "Polyester", "Linen"], required: true },
        { id: "topType", label: "Top Type", type: "select", options: ["T-Shirt", "Blouse", "Tunic", "Crop Top", "Tank Top", "Peplum", "Shirt"], required: true },
        { id: "neckType", label: "Neck Type", type: "select", options: ["Round", "V-Neck", "Square", "Boat Neck", "Off-Shoulder", "Halter", "Keyhole"], required: true },
        { id: "sleeveType", label: "Sleeve Type", type: "select", options: ["Sleeveless", "Cap Sleeve", "Short", "3/4th", "Full", "Bell Sleeve", "Puff"], required: true },
        { id: "fit", label: "Fit Type", type: "select", options: ["Regular", "Fitted", "Relaxed", "Boxy", "A-line"] },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: standardSizes, required: true, fullWidth: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Formal", "Party", "Festive", "Beach", "Work"], fullWidth: true },
        { id: "pattern", label: "Pattern", type: "multiselect", options: ["Solid", "Printed", "Striped", "Floral", "Embroidered", "Lace"] },
      ]},
      { id: "womens-dresses", name: "Women's Dresses", fields: [
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Silk", "Chiffon", "Georgette", "Crepe", "Satin", "Velvet", "Linen"], required: true },
        { id: "dressType", label: "Dress Type", type: "select", options: ["A-Line", "Bodycon", "Maxi", "Midi", "Mini", "Wrap", "Shirt Dress", "Gown"], required: true },
        { id: "neckType", label: "Neck Type", type: "select", options: ["Round", "V-Neck", "Square", "Sweetheart", "Off-Shoulder", "Halter", "High Neck"], required: true },
        { id: "sleeveType", label: "Sleeve Type", type: "select", options: ["Sleeveless", "Cap", "Short", "3/4th", "Full", "Bell", "Cold Shoulder"], required: true },
        { id: "length", label: "Length", type: "select", options: ["Mini (Above Knee)", "Midi (Below Knee)", "Maxi (Floor Length)", "Tea Length"], required: true },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: standardSizes, required: true, fullWidth: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Party", "Wedding", "Cocktail", "Beach", "Formal", "Festive"], fullWidth: true },
        { id: "closure", label: "Closure", type: "select", options: ["Zip", "Button", "Tie", "Pullover", "Hook"] },
      ]},
      { id: "womens-ethnic", name: "Women's Ethnic Wear", fields: [
        { id: "category", label: "Category", type: "select", options: ["Kurta", "Kurti", "Saree", "Lehenga", "Salwar Suit", "Anarkali", "Palazzo Set"], required: true },
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Silk", "Chanderi", "Georgette", "Chiffon", "Rayon", "Brocade", "Velvet"], required: true },
        { id: "work", label: "Work/Embellishment", type: "multiselect", options: ["Embroidered", "Printed", "Zari", "Sequin", "Mirror Work", "Block Print", "Bandhani", "Chikankari"], fullWidth: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Daily Wear", "Festive", "Wedding", "Party", "Office"], fullWidth: true },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: standardSizes, required: true, fullWidth: true },
        { id: "length", label: "Length", type: "select", options: ["Short", "Knee Length", "Calf Length", "Ankle Length", "Floor Length"] },
        { id: "setContains", label: "Set Contains", type: "multiselect", options: ["Kurta", "Bottom", "Dupatta"] },
      ]},
      { id: "kids-wear", name: "Kids Wear", fields: [
        { id: "ageGroup", label: "Age Group", type: "select", options: ["0-2 Years", "2-4 Years", "4-6 Years", "6-8 Years", "8-10 Years", "10-12 Years", "12-14 Years"], required: true },
        { id: "gender", label: "Gender", type: "select", options: ["Boys", "Girls", "Unisex"], required: true },
        { id: "garmentType", label: "Garment Type", type: "select", options: ["T-Shirt", "Shirt", "Dress", "Shorts", "Pants", "Set", "Romper", "Onesie"], required: true },
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Organic Cotton", "Poly-Cotton", "Fleece", "Denim"], required: true },
        { id: "sizes", label: "Available Sizes", type: "size-selector", options: kidsSizes, required: true, fullWidth: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Daily Wear", "Party", "Festive", "School", "Sports"], fullWidth: true },
        { id: "features", label: "Features", type: "multiselect", options: ["Easy Wash", "Skin Safe", "Durable", "Stretchable", "Anti-fade"], fullWidth: true },
      ]},
      { id: "footwear", name: "Footwear", fields: [
        { id: "footwearType", label: "Type", type: "select", options: ["Sneakers", "Formal Shoes", "Sandals", "Slippers", "Boots", "Loafers", "Heels", "Flats", "Sports Shoes"], required: true },
        { id: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex", "Kids"], required: true },
        { id: "upperMaterial", label: "Upper Material", type: "select", options: ["Leather", "Synthetic", "Canvas", "Mesh", "Suede", "PU"], required: true },
        { id: "soleMaterial", label: "Sole Material", type: "select", options: ["Rubber", "PU", "TPR", "EVA", "Leather", "Phylon"] },
        { id: "sizes", label: "UK Sizes Available", type: "text", placeholder: "e.g., UK 6-11", required: true },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Formal", "Sports", "Party", "Outdoor"], fullWidth: true },
        { id: "colors", label: "Colors Available", type: "text", placeholder: "e.g., Black, Brown, White, Navy" },
      ]},
      { id: "home-textiles", name: "Home Textiles", fields: [
        { id: "productType", label: "Product Type", type: "select", options: ["Bedsheet", "Duvet Cover", "Curtains", "Cushion Cover", "Towel", "Table Linen", "Blanket", "Rug"], required: true },
        { id: "fabric", label: "Fabric", type: "select", options: ["Cotton", "Cotton-Satin", "Poly-Cotton", "Linen", "Silk", "Velvet", "Microfiber"], required: true },
        { id: "threadCount", label: "Thread Count", type: "select", options: ["144 TC", "180 TC", "210 TC", "300 TC", "400 TC", "600 TC", "800+ TC"] },
        { id: "size", label: "Size", type: "text", placeholder: "e.g., King, Queen, Single or dimensions", required: true },
        { id: "setContains", label: "Set Contains", type: "text", placeholder: "e.g., 1 Bedsheet + 2 Pillow Covers" },
        { id: "pattern", label: "Pattern", type: "multiselect", options: ["Solid", "Striped", "Printed", "Embroidered", "Jacquard", "Geometric"], fullWidth: true },
        { id: "washCare", label: "Wash Care", type: "multiselect", options: ["Machine Wash", "Hand Wash", "Dry Clean", "Tumble Dry Low"], fullWidth: true },
      ]},
      { id: "ready-made-garments", name: "Other Ready-made Garments", fields: [
        { id: "garmentType", label: "Garment Type", type: "text", placeholder: "e.g., Jackets, Suits, Activewear", required: true },
        { id: "gender", label: "Gender", type: "select", options: ["Men", "Women", "Unisex", "Kids"] },
        { id: "fabric", label: "Fabric", type: "text", placeholder: "e.g., 100% Cotton Jersey", required: true },
        { id: "sizes", label: "Size Range", type: "text", placeholder: "e.g., XS-5XL", required: true },
        { id: "colors", label: "Colors Available", type: "text", placeholder: "e.g., 10+ colors" },
        { id: "occasion", label: "Occasion", type: "multiselect", options: ["Casual", "Formal", "Sports", "Party", "Work", "Outdoor"], fullWidth: true },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "machinery-equipment",
    name: "Machinery & Equipment",
    icon: "Cog",
    type: "service",
    subCategories: [
      { id: "sewing-machines", name: "Sewing Machines", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Single Needle Lockstitch", "Double Needle", "Overlock", "Flatlock", "Bartack", "Buttonhole", "Button Attach", "Feed Off Arm", "Post Bed"], required: true },
        { id: "brand", label: "Brand", type: "select", options: ["Juki", "Brother", "Jack", "Siruba", "Pegasus", "Kansai", "Typical", "Other"], required: true },
        { id: "model", label: "Model Number", type: "text", placeholder: "e.g., DDL-8700" },
        { id: "speed", label: "Max Speed (SPM)", type: "number", placeholder: "e.g., 5000" },
        { id: "drive", label: "Drive Type", type: "select", options: ["Clutch Motor", "Servo Motor", "Direct Drive"] },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
        { id: "warranty", label: "Warranty", type: "text", placeholder: "e.g., 1 Year" },
        { id: "power", label: "Power (Watts)", type: "number", placeholder: "e.g., 550" },
        { id: "voltage", label: "Voltage", type: "select", options: ["220V Single Phase", "380V Three Phase", "110V"] },
      ]},
      { id: "cutting-machines", name: "Cutting Machines", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Straight Knife", "Band Knife", "Round Knife", "Die Cutting", "Laser Cutting", "Automatic Spreading", "CNC Cutter"], required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Eastman, KURIS, Gerber" },
        { id: "cuttingHeight", label: "Cutting Height (inches)", type: "number", placeholder: "e.g., 6" },
        { id: "bladeSize", label: "Blade Size", type: "text", placeholder: "e.g., 8 inch" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
        { id: "power", label: "Power Requirements", type: "text", placeholder: "e.g., 220V, 50Hz" },
      ]},
      { id: "pressing-machines", name: "Pressing & Finishing Machines", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Steam Iron", "Vacuum Table", "Steam Press", "Fusing Machine", "Tunnel Finisher", "Form Finisher", "Shirt Press"], required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Naomoto, Veit, Silver Star" },
        { id: "steamCapacity", label: "Steam Capacity (kg/hr)", type: "number", placeholder: "e.g., 50" },
        { id: "tableDimensions", label: "Table Dimensions", type: "text", placeholder: "e.g., 120x50 cm" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
        { id: "power", label: "Power Requirements", type: "text", placeholder: "e.g., 3 Phase, 440V" },
      ]},
      { id: "embroidery-machines", name: "Embroidery Machines", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Single Head", "Multi Head (4)", "Multi Head (6)", "Multi Head (12)", "Multi Head (20+)", "Computerized"], required: true },
        { id: "brand", label: "Brand", type: "select", options: ["Tajima", "Barudan", "SWF", "ZSK", "Ricoma", "Happy", "Other"] },
        { id: "heads", label: "Number of Heads", type: "number", placeholder: "e.g., 6" },
        { id: "needles", label: "Needles per Head", type: "select", options: ["9", "12", "15", "18"] },
        { id: "maxSpeed", label: "Max Speed (SPM)", type: "number", placeholder: "e.g., 1000" },
        { id: "embroideryArea", label: "Max Embroidery Area", type: "text", placeholder: "e.g., 400x450 mm" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
      ]},
      { id: "printing-machines", name: "Printing Machines", fields: [
        { id: "printType", label: "Print Type", type: "select", options: ["Screen Printing", "DTG", "DTF", "Sublimation", "Heat Press", "Rotary", "Flatbed Digital"], required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Kornit, Epson, MHM" },
        { id: "printArea", label: "Print Area", type: "text", placeholder: "e.g., 40x50 cm" },
        { id: "colors", label: "Colors/Stations", type: "number", placeholder: "e.g., 8" },
        { id: "speed", label: "Prints per Hour", type: "number", placeholder: "e.g., 150" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
      ]},
      { id: "washing-machines", name: "Washing & Finishing Machines", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Sample Washer", "Industrial Washer", "Hydro Extractor", "Tumble Dryer", "Ozone Machine", "Laser Distressing"], required: true },
        { id: "capacity", label: "Capacity (kg)", type: "number", placeholder: "e.g., 50" },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Tonello, Jeanologia" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
      ]},
      { id: "packaging-machinery", name: "Packaging Machinery", fields: [
        { id: "machineType", label: "Machine Type", type: "select", options: ["Folding Machine", "Poly Packing", "Carton Sealer", "Strapping Machine", "Shrink Wrap", "Vacuum Packing"], required: true },
        { id: "speed", label: "Speed (pcs/hr)", type: "number", placeholder: "e.g., 500" },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Brand name" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
      ]},
      { id: "testing-equipment", name: "Testing & QC Equipment", fields: [
        { id: "equipmentType", label: "Equipment Type", type: "select", options: ["GSM Cutter", "Fabric Tensile Tester", "Pilling Tester", "Wash Fastness Tester", "Light Box", "Metal Detector", "Needle Detector"], required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., James Heal, SDL Atlas" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good"], required: true },
        { id: "calibration", label: "Calibration Status", type: "select", options: ["Calibrated", "Due for Calibration", "Not Applicable"] },
      ]},
      { id: "gym-equipment", name: "Gym Equipment", fields: [
        { id: "equipmentType", label: "Equipment Type", type: "select", options: ["Treadmill", "Elliptical", "Spin Bike", "Weight Bench", "Dumbbells", "Cable Machine", "Smith Machine", "Power Rack"], required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Life Fitness, Technogym" },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
        { id: "commercialGrade", label: "Commercial Grade", type: "select", options: ["Yes", "No"] },
        { id: "warranty", label: "Warranty", type: "text", placeholder: "e.g., 2 years" },
      ]},
      { id: "clothing-machinery", name: "Other Clothing Machinery", fields: [
        { id: "machineType", label: "Machine Type", type: "text", placeholder: "e.g., Fusing, Interlining", required: true },
        { id: "brand", label: "Brand", type: "text", placeholder: "e.g., Brand name", required: true },
        { id: "condition", label: "Condition", type: "select", options: ["New", "Refurbished", "Used - Good", "Used - Fair"], required: true },
        { id: "power", label: "Power Requirements", type: "text", placeholder: "e.g., 220V, 50Hz" },
        { id: "warranty", label: "Warranty", type: "text", placeholder: "e.g., 1 year" },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "chemicals-dyes",
    name: "Chemicals & Dyes",
    icon: "Flask",
    type: "product",
    subCategories: [
      { id: "textile-chemicals", name: "Textile Chemicals", fields: [
        { id: "chemicalType", label: "Chemical Type", type: "select", options: ["Pre-treatment", "Scouring Agent", "Bleaching Agent", "Mercerizing", "Desizing", "Wetting Agent", "Levelling Agent"], required: true },
        { id: "application", label: "Application Process", type: "multiselect", options: ["Dyeing", "Printing", "Finishing", "Washing", "Pre-treatment"], fullWidth: true },
        { id: "form", label: "Form", type: "select", options: ["Liquid", "Powder", "Paste", "Granules"] },
        { id: "packSize", label: "Pack Size", type: "text", placeholder: "e.g., 25kg drum, 200L barrel" },
        { id: "shelfLife", label: "Shelf Life", type: "text", placeholder: "e.g., 12 months" },
        { id: "safetyData", label: "SDS Available", type: "select", options: ["Yes", "No"] },
      ]},
      { id: "dyes", name: "Dyes", fields: [
        { id: "dyeClass", label: "Dye Class", type: "select", options: ["Reactive", "Disperse", "Acid", "Direct", "Vat", "Pigment", "Sulphur", "Azoic"], required: true },
        { id: "fiberSuitability", label: "Suitable For", type: "multiselect", options: ["Cotton", "Polyester", "Nylon", "Wool", "Silk", "Blends"], fullWidth: true },
        { id: "shadeRange", label: "Shade Range", type: "text", placeholder: "e.g., Full range or specific shades" },
        { id: "form", label: "Form", type: "select", options: ["Powder", "Liquid", "Granules"] },
        { id: "fastness", label: "Fastness Properties", type: "multiselect", options: ["Wash Fast", "Light Fast", "Rub Fast", "Perspiration Fast"], fullWidth: true },
        { id: "packSize", label: "Pack Size", type: "text", placeholder: "e.g., 25kg bag" },
      ]},
      { id: "washing-finishing-chemicals", name: "Washing & Finishing Chemicals", fields: [
        { id: "type", label: "Type", type: "select", options: ["Softener", "Silicone", "Enzyme", "Stone Substitute", "Anti-back Stain", "Neutralizer", "Optical Brightener"], required: true },
        { id: "finish", label: "Finish Effect", type: "multiselect", options: ["Soft Hand", "Silky Feel", "Stiff", "Water Repellent", "Wrinkle Free", "Anti-pilling"], fullWidth: true },
        { id: "application", label: "Application", type: "text", placeholder: "e.g., Garment wash, Fabric finish" },
        { id: "packSize", label: "Pack Size", type: "text", placeholder: "e.g., 50kg drum" },
        { id: "ecoFriendly", label: "Eco-friendly", type: "select", options: ["Yes - Certified", "Yes - Claim", "No"] },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "mannequins-display",
    name: "Mannequins & Display",
    icon: "User",
    type: "product",
    subCategories: [
      { id: "full-body-mannequins", name: "Full Body Mannequins", fields: [
        { id: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Child", "Abstract"], required: true },
        { id: "material", label: "Material", type: "select", options: ["Fiberglass", "Plastic", "Fabric Wrapped", "Wood", "Chrome"], required: true },
        { id: "finish", label: "Finish", type: "select", options: ["Matte", "Glossy", "Skin Tone", "Abstract Color", "Chrome"] },
        { id: "pose", label: "Pose", type: "select", options: ["Standing", "Sitting", "Walking", "Dynamic", "Casual"] },
        { id: "baseType", label: "Base Type", type: "select", options: ["Glass Base", "Metal Base", "Hanging", "No Base"] },
        { id: "height", label: "Height (cm)", type: "number", placeholder: "e.g., 180" },
      ]},
      { id: "half-body-mannequins", name: "Half Body / Torso Mannequins", fields: [
        { id: "type", label: "Type", type: "select", options: ["Upper Torso", "Lower Torso", "3/4 Body", "Bust Form"], required: true },
        { id: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Child", "Abstract"] },
        { id: "material", label: "Material", type: "select", options: ["Fiberglass", "Plastic", "Fabric Wrapped", "Wood"] },
        { id: "finish", label: "Finish", type: "select", options: ["Matte", "Glossy", "Skin Tone", "Fabric Covered"] },
        { id: "mountType", label: "Mount Type", type: "select", options: ["Table Top Stand", "Hanging", "Wall Mount", "Tripod Stand"] },
      ]},
      { id: "body-forms", name: "Body Forms & Dress Forms", fields: [
        { id: "formType", label: "Form Type", type: "select", options: ["Dress Form", "Tailor Form", "Adjustable Form", "Professional Fitting Form"], required: true },
        { id: "sizeRange", label: "Size Range", type: "text", placeholder: "e.g., S-XL or 36-44" },
        { id: "adjustable", label: "Adjustable", type: "select", options: ["Yes", "No"] },
        { id: "material", label: "Material", type: "select", options: ["Fabric Covered", "Foam", "Fiberglass", "Pinnable"] },
        { id: "baseType", label: "Base Type", type: "select", options: ["Wooden Tripod", "Metal Stand", "Wheeled Base"] },
      ]},
      { id: "speciality-forms", name: "Speciality Forms", fields: [
        { id: "type", label: "Type", type: "select", options: ["Head Form", "Hand Form", "Leg Form", "Foot Form", "Jewellery Display Hand"], required: true },
        { id: "material", label: "Material", type: "select", options: ["Fiberglass", "Plastic", "Foam", "Velvet Covered", "Wood"] },
        { id: "finish", label: "Finish", type: "select", options: ["Matte", "Glossy", "Skin Tone", "Abstract"] },
      ]},
      { id: "display-racks-stands", name: "Display Racks & Stands", fields: [
        { id: "type", label: "Type", type: "select", options: ["Garment Rack", "Display Stand", "Gondola Shelf", "Slat Wall Panel", "Grid Wall Panel", "Hanger Stand"], required: true },
        { id: "material", label: "Material", type: "select", options: ["Metal", "Wood", "Chrome", "Stainless Steel", "Acrylic"] },
        { id: "dimensions", label: "Dimensions (LxWxH)", type: "text", placeholder: "e.g., 120x60x160 cm" },
        { id: "capacity", label: "Capacity", type: "text", placeholder: "e.g., 50 garments" },
        { id: "wheels", label: "With Wheels", type: "select", options: ["Yes", "No"] },
      ]},
      { id: "hangers", name: "Hangers", fields: [
        { id: "hangerType", label: "Hanger Type", type: "select", options: ["Wooden", "Plastic", "Velvet", "Metal Wire", "Padded", "Clip Hanger", "Suit Hanger", "Kids Hanger"], required: true },
        { id: "size", label: "Size", type: "select", options: ["Standard (17\")", "Large (19\")", "Kids (12\")", "Custom"] },
        { id: "packQuantity", label: "Pack Quantity", type: "select", options: ["10", "25", "50", "100", "500", "1000"] },
        { id: "customBranding", label: "Custom Branding", type: "select", options: ["Yes", "No"] },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "printing-manufacturing",
    name: "Printing & Manufacturing Services",
    icon: "Printer",
    type: "service",
    subCategories: [
      { id: "printing-services", name: "Printing Services", fields: [
        { id: "printTypes", label: "Print Types Offered", type: "multiselect", options: ["Screen Print", "DTG", "DTF", "Sublimation", "Heat Transfer", "Discharge", "Foil", "Flock", "Puff", "Water Base", "Plastisol"], required: true, fullWidth: true },
        { id: "maxColors", label: "Max Colors", type: "select", options: ["1-4", "5-8", "9-12", "12+", "Unlimited (Digital)"] },
        { id: "maxPrintSize", label: "Max Print Size", type: "text", placeholder: "e.g., 40x50 cm" },
        { id: "garmentTypes", label: "Garment Types", type: "multiselect", options: ["T-Shirts", "Hoodies", "Bags", "Caps", "Cut Pieces", "Yardage"], fullWidth: true },
        { id: "dailyCapacity", label: "Daily Capacity", type: "text", placeholder: "e.g., 5000 impressions/day" },
      ]},
      { id: "embroidery-services", name: "Embroidery Services", fields: [
        { id: "machineHeads", label: "Total Machine Heads", type: "number", placeholder: "e.g., 48", required: true },
        { id: "maxColors", label: "Max Thread Colors", type: "number", placeholder: "e.g., 15" },
        { id: "maxArea", label: "Max Embroidery Area", type: "text", placeholder: "e.g., 400x400 mm" },
        { id: "stitchTypes", label: "Stitch Types", type: "multiselect", options: ["Flat", "3D Puff", "Applique", "Sequin", "Chenille"], fullWidth: true },
        { id: "digitizing", label: "Digitizing Service", type: "select", options: ["In-house", "Outsourced", "Customer Provides"] },
        { id: "dailyCapacity", label: "Daily Capacity", type: "text", placeholder: "e.g., 2000 pieces" },
      ]},
      { id: "fabric-dyeing", name: "Fabric Dyeing", fields: [
        { id: "dyeTypes", label: "Dye Types", type: "multiselect", options: ["Reactive", "Disperse", "Vat", "Pigment", "Acid"], required: true, fullWidth: true },
        { id: "fabricTypes", label: "Fabric Types Handled", type: "multiselect", options: ["Cotton", "Polyester", "Blends", "Nylon", "Wool", "Silk"], fullWidth: true },
        { id: "processes", label: "Processes", type: "multiselect", options: ["Piece Dye", "Yarn Dye", "Garment Dye", "Tie-Dye", "Ombre"], fullWidth: true },
        { id: "dailyCapacity", label: "Daily Capacity (kg)", type: "number", placeholder: "e.g., 5000" },
        { id: "certifications", label: "Certifications", type: "multiselect", options: ["OEKO-TEX", "GOTS", "ZLD", "Bluesign"], fullWidth: true },
      ]},
      { id: "processing-finishing", name: "Processing & Finishing", fields: [
        { id: "processes", label: "Processes Offered", type: "multiselect", options: ["Washing", "Enzyme Wash", "Stone Wash", "Bleaching", "Mercerizing", "Sanforizing", "Calendering", "Singeing", "Raising/Brushing"], required: true, fullWidth: true },
        { id: "specialFinishes", label: "Special Finishes", type: "multiselect", options: ["Water Repellent", "Fire Retardant", "Anti-microbial", "Wrinkle Free", "Stain Resistant", "UV Protection"], fullWidth: true },
        { id: "fabricTypes", label: "Fabric Types", type: "multiselect", options: ["Woven", "Knits", "Denim", "Synthetics"], fullWidth: true },
        { id: "dailyCapacity", label: "Daily Capacity", type: "text", placeholder: "e.g., 10,000 meters/day" },
      ]},
    ],
    commonFields: [
      { id: "minOrder", label: "Minimum Order", type: "text", placeholder: "e.g., 100 pcs or No MOQ" },
      { id: "samplePolicy", label: "Sample Policy", type: "select", options: ["Free Samples", "Paid Samples", "No Samples"] },
    ],
  },
  {
    id: "service-providers",
    name: "Service Providers (Manufacturing & Fashion Ops)",
    icon: "Wrench",
    type: "service",
    subCategories: [
      { id: "stitching-garmenting", name: "Stitching / Garmenting", fields: [
        { id: "garmentTypes", label: "Garment Types", type: "multiselect", options: ["T-Shirts", "Shirts", "Trousers", "Dresses", "Jackets", "Activewear", "Kidswear", "Ethnic Wear", "Denim"], required: true, fullWidth: true },
        { id: "monthlyCapacity", label: "Monthly Capacity", type: "text", placeholder: "e.g., 50,000 pcs", required: true },
        { id: "machines", label: "Total Machines", type: "number", placeholder: "e.g., 200" },
        { id: "specialOperations", label: "Special Operations", type: "multiselect", options: ["Smocking", "Pintucks", "Pleating", "Quilting", "Piping"], fullWidth: true },
        { id: "certifications", label: "Certifications", type: "multiselect", options: ["SEDEX", "BSCI", "WRAP", "GOTS", "ISO 9001", "SA8000"], fullWidth: true },
      ]},
      { id: "cutting", name: "Cutting", fields: [
        { id: "cuttingMethods", label: "Cutting Methods", type: "multiselect", options: ["Manual", "Straight Knife", "Band Knife", "Die Cut", "CAM/CNC", "Laser"], required: true, fullWidth: true },
        { id: "layHeight", label: "Max Lay Height (inches)", type: "number", placeholder: "e.g., 6" },
        { id: "dailyCapacity", label: "Daily Cutting Capacity", type: "text", placeholder: "e.g., 10,000 pcs" },
        { id: "cadSoftware", label: "CAD Software", type: "select", options: ["Gerber", "Lectra", "Optitex", "Tukatech", "Other", "None"] },
      ]},
      { id: "packaging", name: "Packaging", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Folding", "Tagging", "Poly Packing", "Box Packing", "Hanging", "Steaming", "Quality Check"], required: true, fullWidth: true },
        { id: "dailyCapacity", label: "Daily Capacity", type: "text", placeholder: "e.g., 5,000 pcs" },
        { id: "packingTypes", label: "Packing Types", type: "multiselect", options: ["Individual Pack", "Assorted Pack", "Solid Pack", "Ratio Pack"], fullWidth: true },
      ]},
      { id: "quality-check", name: "Quality Check (QC)", fields: [
        { id: "qcTypes", label: "QC Services", type: "multiselect", options: ["Inline QC", "End-line QC", "Final Audit", "Pre-shipment Inspection", "Fabric Inspection"], required: true, fullWidth: true },
        { id: "standards", label: "Standards Followed", type: "multiselect", options: ["AQL 1.5", "AQL 2.5", "AQL 4.0", "4-Point System", "10-Point System"], fullWidth: true },
        { id: "equipment", label: "Testing Equipment", type: "multiselect", options: ["GSM Cutter", "Light Box", "Shrinkage Template", "Color Matching Cabinet"], fullWidth: true },
      ]},
      { id: "pattern-making-cad", name: "Pattern Making / CAD", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Manual Pattern", "CAD Pattern", "Grading", "Marker Making", "Digitizing", "Pattern Correction"], required: true, fullWidth: true },
        { id: "software", label: "CAD Software", type: "multiselect", options: ["Gerber", "Lectra", "Optitex", "Tukatech", "StyleCAD", "CLO 3D"], fullWidth: true },
        { id: "garmentTypes", label: "Garment Expertise", type: "multiselect", options: ["Woven Tops", "Woven Bottoms", "Knits", "Dresses", "Outerwear", "Activewear"], fullWidth: true },
      ]},
      { id: "tech-pack-development", name: "Tech Pack Development", fields: [
        { id: "software", label: "Software Used", type: "multiselect", options: ["Adobe Illustrator", "CorelDRAW", "CLO 3D", "Browzwear", "Techpacker"], required: true, fullWidth: true },
        { id: "includes", label: "Tech Pack Includes", type: "multiselect", options: ["Flat Sketch", "Construction Details", "BOM", "Measurements", "Colorways", "Label Placement", "Packaging Specs"], fullWidth: true },
        { id: "turnaround", label: "Turnaround Time", type: "select", options: ["24 Hours", "48 Hours", "3-5 Days", "1 Week"] },
      ]},
      { id: "fashion-designing", name: "Fashion Designing", fields: [
        { id: "services", label: "Design Services", type: "multiselect", options: ["Collection Design", "Print Design", "Embroidery Design", "Trend Research", "Mood Boards", "Range Planning"], required: true, fullWidth: true },
        { id: "categories", label: "Categories", type: "multiselect", options: ["Menswear", "Womenswear", "Kidswear", "Activewear", "Ethnic", "Accessories"], fullWidth: true },
        { id: "software", label: "Software Proficiency", type: "multiselect", options: ["Adobe Illustrator", "Photoshop", "CLO 3D", "Browzwear", "Procreate"], fullWidth: true },
      ]},
      { id: "fabric-sourcing", name: "Fabric Sourcing", fields: [
        { id: "fabricTypes", label: "Fabric Types", type: "multiselect", options: ["Knits", "Wovens", "Denim", "Sustainable", "Performance", "Lace & Nets", "Prints"], required: true, fullWidth: true },
        { id: "sourcingRegions", label: "Sourcing Regions", type: "multiselect", options: ["India", "China", "Bangladesh", "Turkey", "Italy", "Japan", "Korea"], fullWidth: true },
        { id: "services", label: "Services Included", type: "multiselect", options: ["Mill Sourcing", "Price Negotiation", "Quality Check", "Sampling", "Logistics"], fullWidth: true },
      ]},
      { id: "trims-accessories-sourcing", name: "Trims & Accessories Sourcing", fields: [
        { id: "trimTypes", label: "Trim Types", type: "multiselect", options: ["Buttons", "Zippers", "Labels", "Hang Tags", "Elastics", "Laces", "Patches", "Rivets"], required: true, fullWidth: true },
        { id: "sourcingRegions", label: "Sourcing Regions", type: "multiselect", options: ["India", "China", "Taiwan", "Hong Kong", "Europe"], fullWidth: true },
        { id: "services", label: "Services Included", type: "multiselect", options: ["Custom Development", "Sampling", "Quality Check", "Logistics"], fullWidth: true },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "logistics-supply-chain",
    name: "Logistics & Supply Chain",
    icon: "Truck",
    type: "service",
    subCategories: [
      { id: "logistics-transportation", name: "Logistics & Transportation", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Road Transport", "Air Freight", "Sea Freight", "Rail Freight", "Express Delivery", "Last Mile"], required: true, fullWidth: true },
        { id: "coverage", label: "Coverage", type: "multiselect", options: ["Local", "State-wide", "PAN India", "International"], fullWidth: true },
        { id: "vehicleTypes", label: "Vehicle Types", type: "multiselect", options: ["Bike", "Tempo", "Mini Truck", "Container", "Trailer"], fullWidth: true },
        { id: "specialHandling", label: "Special Handling", type: "multiselect", options: ["Temperature Controlled", "Fragile", "Oversized", "Hazardous"], fullWidth: true },
      ]},
      { id: "warehousing", name: "Warehousing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Storage", "Pick & Pack", "Inventory Management", "Order Fulfillment", "Returns Processing"], required: true, fullWidth: true },
        { id: "warehouseSize", label: "Warehouse Size (sq ft)", type: "text", placeholder: "e.g., 50,000 sq ft" },
        { id: "locations", label: "Locations", type: "text", placeholder: "e.g., Mumbai, Delhi, Bangalore" },
        { id: "features", label: "Facility Features", type: "multiselect", options: ["Climate Controlled", "24/7 Security", "Fire Safety", "CCTV", "WMS Enabled"], fullWidth: true },
      ]},
      { id: "import-export-handling", name: "Import / Export Handling", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Custom Clearance", "Documentation", "Freight Forwarding", "Cargo Insurance", "Trade Finance"], required: true, fullWidth: true },
        { id: "tradeLanes", label: "Trade Lanes", type: "multiselect", options: ["USA", "EU", "UK", "Middle East", "Australia", "Asia Pacific"], fullWidth: true },
        { id: "shipmentTypes", label: "Shipment Types", type: "multiselect", options: ["FCL", "LCL", "Air Cargo", "Courier"], fullWidth: true },
        { id: "licenses", label: "Licenses & Certifications", type: "multiselect", options: ["Custom Broker License", "IATA", "FIATA", "AEO"], fullWidth: true },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "it-software-saas",
    name: "IT, Software & SaaS",
    icon: "Monitor",
    type: "service",
    subCategories: [
      { id: "app-development", name: "App Development", fields: [
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["iOS", "Android", "Cross-platform", "Web App", "PWA"], required: true, fullWidth: true },
        { id: "technologies", label: "Technologies", type: "multiselect", options: ["React Native", "Flutter", "Swift", "Kotlin", "React", "Node.js", "Python"], fullWidth: true },
        { id: "appTypes", label: "App Types", type: "multiselect", options: ["E-commerce", "B2B Marketplace", "Inventory", "CRM", "Custom"], fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["UI/UX Design", "Development", "Testing", "Deployment", "Maintenance"], fullWidth: true },
      ]},
      { id: "erp-saas-software", name: "ERP / SaaS Software", fields: [
        { id: "modules", label: "Modules", type: "multiselect", options: ["Production Planning", "Inventory", "Order Management", "Costing", "HR/Payroll", "Accounting", "Quality"], required: true, fullWidth: true },
        { id: "deployment", label: "Deployment", type: "select", options: ["Cloud", "On-premise", "Hybrid"] },
        { id: "industry", label: "Industry Focus", type: "multiselect", options: ["Apparel", "Textile", "Retail", "Manufacturing"], fullWidth: true },
        { id: "integrations", label: "Integrations", type: "multiselect", options: ["Tally", "SAP", "Shopify", "WooCommerce", "Marketplaces"], fullWidth: true },
      ]},
      { id: "crm-automation", name: "CRM & Automation", fields: [
        { id: "features", label: "Features", type: "multiselect", options: ["Lead Management", "Sales Pipeline", "Email Automation", "WhatsApp Integration", "Analytics", "Mobile App"], required: true, fullWidth: true },
        { id: "integrations", label: "Integrations", type: "multiselect", options: ["Website", "Email", "WhatsApp", "Social Media", "ERP"], fullWidth: true },
        { id: "pricing", label: "Pricing Model", type: "select", options: ["Per User/Month", "Flat Monthly", "One-time License", "Usage Based"] },
      ]},
      { id: "accounting-billing-software", name: "Accounting & Billing Software", fields: [
        { id: "features", label: "Features", type: "multiselect", options: ["GST Billing", "Inventory", "Purchase/Sales", "Bank Reconciliation", "Reports", "Multi-branch"], required: true, fullWidth: true },
        { id: "compliance", label: "Compliance", type: "multiselect", options: ["GST Ready", "E-invoice", "E-way Bill", "TDS"], fullWidth: true },
        { id: "deployment", label: "Deployment", type: "select", options: ["Cloud", "Desktop", "Both"] },
      ]},
      { id: "b2b-directory-listings", name: "B2B Directory Listings", fields: [
        { id: "listingTypes", label: "Listing Types", type: "multiselect", options: ["Basic", "Premium", "Featured", "Verified"], required: true },
        { id: "features", label: "Features Included", type: "multiselect", options: ["Company Profile", "Product Catalog", "Lead Generation", "RFQ", "Analytics"], fullWidth: true },
        { id: "industries", label: "Industries Covered", type: "multiselect", options: ["Textile", "Apparel", "Fashion", "Manufacturing"], fullWidth: true },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "finance-compliance",
    name: "Finance & Compliance Services",
    icon: "Calculator",
    type: "service",
    subCategories: [
      { id: "accounting-services", name: "Accounting Services", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Bookkeeping", "Financial Statements", "MIS Reports", "Bank Reconciliation", "Accounts Payable/Receivable"], required: true, fullWidth: true },
        { id: "software", label: "Software Expertise", type: "multiselect", options: ["Tally", "Zoho Books", "QuickBooks", "Busy", "SAP"], fullWidth: true },
        { id: "clientTypes", label: "Client Types", type: "multiselect", options: ["Startups", "SMEs", "Manufacturers", "Exporters", "Retailers"], fullWidth: true },
      ]},
      { id: "gst-filing", name: "GST Filing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["GSTR-1", "GSTR-3B", "GSTR-9", "E-way Bill", "GST Registration", "GST Audit", "Refund Claims"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Textile", "Apparel", "Export", "Retail", "Manufacturing"], fullWidth: true },
      ]},
      { id: "income-tax-filing", name: "Income Tax Filing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["ITR Filing", "Tax Planning", "TDS Returns", "Advance Tax", "Tax Audit", "Assessment Support"], required: true, fullWidth: true },
        { id: "entityTypes", label: "Entity Types", type: "multiselect", options: ["Individual", "Proprietorship", "Partnership", "LLP", "Pvt Ltd", "Public Ltd"], fullWidth: true },
      ]},
      { id: "business-registration", name: "Business Registration", fields: [
        { id: "registrations", label: "Registration Types", type: "multiselect", options: ["Company Incorporation", "LLP Registration", "Partnership Deed", "Trademark", "MSME/Udyam", "FSSAI", "Import Export Code"], required: true, fullWidth: true },
        { id: "additionalServices", label: "Additional Services", type: "multiselect", options: ["MOA/AOA Drafting", "Director KYC", "Annual Compliance", "Changes/Amendments"], fullWidth: true },
      ]},
      { id: "payroll-pf-esic", name: "Payroll & PF / ESIC", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Payroll Processing", "PF Registration", "PF Returns", "ESIC Registration", "ESIC Returns", "Gratuity", "Leave Management"], required: true, fullWidth: true },
        { id: "employeeRange", label: "Employee Range", type: "select", options: ["1-50", "51-200", "201-500", "500+"] },
        { id: "software", label: "Software Used", type: "multiselect", options: ["Tally", "Zoho Payroll", "GreytHR", "Custom Software"], fullWidth: true },
      ]},
      { id: "budgeting-forecasting", name: "Budgeting & Forecasting", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Annual Budgeting", "Cash Flow Forecasting", "Revenue Projections", "Expense Analysis", "Variance Analysis"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Textile", "Apparel", "Retail", "Manufacturing", "Export"], fullWidth: true },
      ]},
      { id: "fundraising-support", name: "Fundraising Support", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Pitch Deck", "Financial Model", "Investor Connect", "Due Diligence Support", "Term Sheet Negotiation"], required: true, fullWidth: true },
        { id: "fundingStage", label: "Funding Stage", type: "multiselect", options: ["Pre-seed", "Seed", "Series A", "Series B+", "Debt"], fullWidth: true },
      ]},
      { id: "loan-advisory", name: "Loan Advisory", fields: [
        { id: "loanTypes", label: "Loan Types", type: "multiselect", options: ["Working Capital", "Term Loan", "CGTMSE", "Export Finance", "Bill Discounting", "LAP"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Eligibility Assessment", "Documentation", "Bank Liaison", "Sanction Support"], fullWidth: true },
      ]},
      { id: "inventory-valuation", name: "Inventory Valuation", fields: [
        { id: "methods", label: "Valuation Methods", type: "multiselect", options: ["FIFO", "LIFO", "Weighted Average", "Standard Cost", "Retail Method"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Physical Verification", "Stock Reconciliation", "Obsolete Inventory Analysis", "Audit Support"], fullWidth: true },
      ]},
      { id: "import-export-compliance", name: "Import / Export Compliance", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["IEC Application", "DGFT Schemes", "RoDTEP", "MEIS/SEIS", "Customs Documentation", "BRC Closure"], required: true, fullWidth: true },
        { id: "countries", label: "Country Expertise", type: "multiselect", options: ["USA", "EU", "UK", "Middle East", "Australia", "Asia"], fullWidth: true },
      ]},
      { id: "costing-consultation", name: "Costing Consultation", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Product Costing", "Process Costing", "Standard Costing", "Variance Analysis", "Cost Reduction", "Pricing Strategy"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Apparel", "Textile", "Home Textiles", "Accessories"], fullWidth: true },
      ]},
      { id: "audit-support", name: "Audit Support", fields: [
        { id: "auditTypes", label: "Audit Types", type: "multiselect", options: ["Statutory Audit", "Internal Audit", "Tax Audit", "Stock Audit", "Concurrent Audit", "SEDEX/BSCI"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Audit Preparation", "Query Resolution", "Documentation", "Representation"], fullWidth: true },
      ]},
      { id: "financial-sop-setup", name: "Financial SOP Setup", fields: [
        { id: "areas", label: "SOP Areas", type: "multiselect", options: ["Procurement", "Payments", "Receivables", "Inventory", "Expense Management", "Reporting"], required: true, fullWidth: true },
        { id: "deliverables", label: "Deliverables", type: "multiselect", options: ["Process Flow", "Documentation", "Training", "Implementation Support"], fullWidth: true },
      ]},
    ],
    commonFields: [],
  },
  {
    id: "marketing-pr-photography",
    name: "Marketing, PR & Photography",
    icon: "Camera",
    type: "service",
    subCategories: [
      { id: "brand-consulting", name: "Brand Consulting", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Brand Strategy", "Brand Identity", "Brand Positioning", "Brand Guidelines", "Naming", "Rebranding"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Fashion", "Textile", "D2C", "B2B", "Retail"], fullWidth: true },
        { id: "deliverables", label: "Deliverables", type: "multiselect", options: ["Strategy Document", "Logo Design", "Brand Book", "Collaterals"], fullWidth: true },
      ]},
      { id: "marketing-services", name: "Marketing Services", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Strategy", "Campaign Planning", "Creative Design", "Media Planning", "Analytics", "Growth Marketing"], required: true, fullWidth: true },
        { id: "channels", label: "Channels", type: "multiselect", options: ["Digital", "Print", "Outdoor", "Events", "Trade Shows"], fullWidth: true },
      ]},
      { id: "ecommerce-services", name: "E-commerce Services", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Store Setup", "Product Listing", "Catalog Management", "Order Management", "Customer Service", "Analytics"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Shopify", "WooCommerce", "Magento", "Custom"], fullWidth: true },
      ]},
      { id: "marketplace-onboarding", name: "Marketplace Onboarding", fields: [
        { id: "marketplaces", label: "Marketplaces", type: "multiselect", options: ["Amazon", "Flipkart", "Myntra", "Ajio", "Nykaa Fashion", "Meesho", "International"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Account Setup", "Catalog Upload", "A+ Content", "Advertising", "Account Management"], fullWidth: true },
      ]},
      { id: "brand-store-setup", name: "Brand Store Setup", fields: [
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Shopify", "WooCommerce", "Wix", "Squarespace", "Custom"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Design", "Development", "Payment Integration", "Shipping Setup", "SEO", "Training"], fullWidth: true },
      ]},
      { id: "social-media-marketing", name: "Social Media Marketing", fields: [
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Instagram", "Facebook", "LinkedIn", "Twitter", "Pinterest", "YouTube", "TikTok"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Strategy", "Content Creation", "Community Management", "Paid Ads", "Influencer Outreach", "Analytics"], fullWidth: true },
      ]},
      { id: "performance-marketing", name: "Performance Marketing", fields: [
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Google Ads", "Facebook Ads", "Instagram Ads", "LinkedIn Ads", "Programmatic"], required: true, fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Campaign Setup", "Optimization", "Creative", "Landing Pages", "Analytics", "CRO"], fullWidth: true },
        { id: "budgetRange", label: "Budget Range Managed", type: "select", options: ["<1 Lakh/month", "1-5 Lakhs", "5-10 Lakhs", "10+ Lakhs"] },
      ]},
      { id: "influencer-collaborations", name: "Influencer Collaborations", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Influencer Discovery", "Outreach", "Campaign Management", "Content Review", "Analytics", "Contracts"], required: true, fullWidth: true },
        { id: "influencerTypes", label: "Influencer Types", type: "multiselect", options: ["Nano", "Micro", "Mid-tier", "Macro", "Celebrity"], fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Instagram", "YouTube", "LinkedIn", "Twitter"], fullWidth: true },
      ]},
      { id: "public-relations", name: "Public Relations (PR)", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Media Relations", "Press Releases", "Media Coverage", "Crisis Management", "Event PR", "Thought Leadership"], required: true, fullWidth: true },
        { id: "mediaTypes", label: "Media Types", type: "multiselect", options: ["Print", "Digital", "TV", "Radio", "Podcasts"], fullWidth: true },
      ]},
      { id: "content-creation", name: "Content Creation", fields: [
        { id: "contentTypes", label: "Content Types", type: "multiselect", options: ["Blog Posts", "Articles", "Social Media", "Video Scripts", "Email Copy", "Website Copy", "Product Descriptions"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Fashion", "Textile", "B2B", "D2C", "Lifestyle"], fullWidth: true },
      ]},
      { id: "catalogue-listing", name: "Catalogue & Listing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Product Photography", "Image Editing", "Copywriting", "Catalog Design", "Listing Upload", "A+ Content"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Amazon", "Flipkart", "Myntra", "Own Website", "B2B Portals"], fullWidth: true },
        { id: "volume", label: "Volume per Month", type: "select", options: ["<100 SKUs", "100-500", "500-1000", "1000+"] },
      ]},
      { id: "seo-blogging", name: "SEO & Blogging", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Keyword Research", "On-page SEO", "Technical SEO", "Content Strategy", "Link Building", "Local SEO"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Fashion", "Textile", "E-commerce", "B2B"], fullWidth: true },
      ]},
      { id: "email-marketing", name: "Email Marketing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Strategy", "Template Design", "Copywriting", "Automation", "List Management", "Analytics"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Mailchimp", "Klaviyo", "Sendinblue", "HubSpot", "Custom"], fullWidth: true },
      ]},
      { id: "sms-whatsapp-campaigns", name: "SMS / WhatsApp Campaigns", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Bulk SMS", "WhatsApp Business", "Chatbot Setup", "Campaign Management", "Automation", "Analytics"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["WhatsApp Business API", "Interakt", "Wati", "Gupshup", "Custom"], fullWidth: true },
      ]},
      { id: "photography-videography", name: "Photography & Videography", fields: [
        { id: "photoServices", label: "Photography Services", type: "multiselect", options: ["Product Photography", "Lookbook", "E-commerce", "Lifestyle", "Flat Lay", "360°"], required: true, fullWidth: true },
        { id: "videoServices", label: "Video Services", type: "multiselect", options: ["Product Videos", "Brand Films", "Reels", "BTS", "Interviews", "Ads"], fullWidth: true },
        { id: "studio", label: "Studio", type: "select", options: ["Own Studio", "On-location", "Both"] },
        { id: "equipment", label: "Equipment", type: "text", placeholder: "e.g., Canon 5D, Godox Lights, etc." },
      ]},
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
      { id: "fashion-designing", name: "Fashion Designing", fields: [
        { id: "designServices", label: "Design Services", type: "multiselect", options: ["Collection Design", "Print Design", "Embroidery Design", "Trend Research", "Mood Boards", "Range Planning", "Tech Packs"], required: true, fullWidth: true },
        { id: "categories", label: "Categories", type: "multiselect", options: ["Menswear", "Womenswear", "Kidswear", "Activewear", "Ethnic", "Bridal", "Accessories"], fullWidth: true },
        { id: "software", label: "Software Proficiency", type: "multiselect", options: ["Adobe Illustrator", "Photoshop", "CLO 3D", "Browzwear", "Procreate", "CorelDRAW"], fullWidth: true },
      ]},
      { id: "tech-pack-creation", name: "Tech Pack Creation", fields: [
        { id: "includes", label: "Tech Pack Includes", type: "multiselect", options: ["Flat Sketch", "Construction Details", "BOM", "Measurements", "Colorways", "Label Placement", "Packaging Specs", "Fabric Swatches"], required: true, fullWidth: true },
        { id: "software", label: "Software Used", type: "multiselect", options: ["Adobe Illustrator", "CorelDRAW", "Techpacker", "Excel"], fullWidth: true },
        { id: "garmentTypes", label: "Garment Expertise", type: "multiselect", options: ["Woven Tops", "Woven Bottoms", "Knits", "Dresses", "Outerwear", "Activewear", "Denim"], fullWidth: true },
      ]},
      { id: "fabric-trim-sourcing", name: "Fabric & Trim Sourcing", fields: [
        { id: "sourcingTypes", label: "Sourcing Types", type: "multiselect", options: ["Fabrics", "Trims", "Accessories", "Labels", "Packaging"], required: true, fullWidth: true },
        { id: "regions", label: "Sourcing Regions", type: "multiselect", options: ["India", "China", "Bangladesh", "Turkey", "Italy", "Korea", "Taiwan"], fullWidth: true },
        { id: "services", label: "Services", type: "multiselect", options: ["Supplier Identification", "Price Negotiation", "Quality Check", "Sample Coordination", "Logistics"], fullWidth: true },
      ]},
      { id: "marketing-strategy", name: "Marketing Strategy", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Brand Strategy", "Go-to-Market", "Digital Strategy", "Content Strategy", "Growth Hacking", "Campaign Planning"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Fashion", "Textile", "D2C", "B2B", "Retail", "E-commerce"], fullWidth: true },
      ]},
      { id: "ecommerce-operations", name: "E-commerce Operations", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Store Management", "Order Processing", "Inventory Management", "Customer Service", "Returns Handling", "Analytics"], required: true, fullWidth: true },
        { id: "platforms", label: "Platform Expertise", type: "multiselect", options: ["Shopify", "WooCommerce", "Amazon", "Flipkart", "Myntra"], fullWidth: true },
      ]},
      { id: "performance-influencer-marketing", name: "Performance & Influencer Marketing", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Paid Ads Management", "Influencer Outreach", "Campaign Management", "Analytics", "Creative Strategy"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Google Ads", "Meta Ads", "Instagram", "YouTube", "LinkedIn"], fullWidth: true },
      ]},
      { id: "pr-media", name: "PR & Media", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Media Relations", "Press Releases", "Media Coverage", "Event Coverage", "Thought Leadership"], required: true, fullWidth: true },
        { id: "industries", label: "Industry Experience", type: "multiselect", options: ["Fashion", "Lifestyle", "Textile", "Retail"], fullWidth: true },
      ]},
      { id: "software-crm-support", name: "Software & CRM Support", fields: [
        { id: "expertise", label: "Expertise", type: "multiselect", options: ["ERP Implementation", "CRM Setup", "Automation", "Training", "Troubleshooting", "Integration"], required: true, fullWidth: true },
        { id: "software", label: "Software", type: "multiselect", options: ["Tally", "Zoho", "HubSpot", "Salesforce", "SAP", "Custom ERP"], fullWidth: true },
      ]},
      { id: "accounting-bookkeeping", name: "Accounting & Bookkeeping", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Daily Bookkeeping", "Bank Reconciliation", "GST Filing", "TDS Returns", "Financial Statements", "MIS Reports"], required: true, fullWidth: true },
        { id: "software", label: "Software", type: "multiselect", options: ["Tally", "Zoho Books", "QuickBooks", "Busy", "Excel"], fullWidth: true },
      ]},
      { id: "legal-compliance", name: "Legal & Compliance", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Contract Drafting", "Legal Review", "Compliance Audit", "IP Registration", "Labor Law Advisory"], required: true, fullWidth: true },
        { id: "specialization", label: "Specialization", type: "multiselect", options: ["Commercial", "Employment", "IP/Trademark", "Export-Import", "Tax"], fullWidth: true },
      ]},
      { id: "packaging-design-procurement", name: "Packaging Design & Procurement", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Packaging Design", "Structural Design", "Print-ready Artwork", "Vendor Sourcing", "Sampling", "Production Coordination"], required: true, fullWidth: true },
        { id: "packagingTypes", label: "Packaging Types", type: "multiselect", options: ["Boxes", "Bags", "Pouches", "Hang Tags", "Labels", "Tissue"], fullWidth: true },
      ]},
      { id: "photography-videography", name: "Photography & Videography", fields: [
        { id: "photoServices", label: "Photography", type: "multiselect", options: ["Product", "Lookbook", "Lifestyle", "Flat Lay", "E-commerce", "Portrait"], required: true, fullWidth: true },
        { id: "videoServices", label: "Videography", type: "multiselect", options: ["Product Videos", "Reels", "Brand Films", "BTS", "Interviews"], fullWidth: true },
        { id: "equipment", label: "Equipment", type: "text", placeholder: "e.g., Canon 5D Mark IV, DJI Gimbal" },
      ]},
      { id: "content-creation-cataloging", name: "Content Creation & Cataloging", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Product Descriptions", "SEO Content", "Social Media Content", "Blog Writing", "Catalog Copy", "Email Copy"], required: true, fullWidth: true },
        { id: "industries", label: "Industries", type: "multiselect", options: ["Fashion", "Textile", "E-commerce", "B2B"], fullWidth: true },
      ]},
      { id: "model-coordination-styling", name: "Model Coordination & Styling", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Model Casting", "Styling", "Wardrobe Management", "Hair & Makeup Coordination", "On-set Coordination"], required: true, fullWidth: true },
        { id: "shootTypes", label: "Shoot Types", type: "multiselect", options: ["E-commerce", "Lookbook", "Editorial", "Campaign", "Catalog"], fullWidth: true },
      ]},
      { id: "reels-campaign-shoots", name: "Reels & Campaign Shoots", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Concept Development", "Scripting", "Shooting", "Editing", "Motion Graphics", "Sound Design"], required: true, fullWidth: true },
        { id: "platforms", label: "Platforms", type: "multiselect", options: ["Instagram Reels", "YouTube Shorts", "TikTok", "Brand Website"], fullWidth: true },
      ]},
      { id: "warehouse-logistics-management", name: "Warehouse & Logistics Management", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Warehouse Setup", "Inventory Management", "Order Fulfillment", "Returns Processing", "Vendor Coordination", "Logistics Optimization"], required: true, fullWidth: true },
        { id: "systems", label: "Systems Expertise", type: "multiselect", options: ["WMS", "OMS", "ERP", "Spreadsheets"], fullWidth: true },
      ]},
      { id: "label-tag-customisation", name: "Label & Tag Customisation", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Design", "Artwork Preparation", "Vendor Sourcing", "Sample Development", "Quality Check"], required: true, fullWidth: true },
        { id: "labelTypes", label: "Label Types", type: "multiselect", options: ["Woven Labels", "Printed Labels", "Hang Tags", "Care Labels", "Patches"], fullWidth: true },
      ]},
      { id: "product-sampling", name: "Product Sampling", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Pattern Making", "Sample Stitching", "Fit Sessions", "Proto Development", "Size Set", "PP Sample"], required: true, fullWidth: true },
        { id: "garmentTypes", label: "Garment Types", type: "multiselect", options: ["Woven", "Knits", "Denim", "Outerwear", "Activewear", "Ethnic"], fullWidth: true },
      ]},
      { id: "trend-forecasting", name: "Trend Forecasting", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Color Trends", "Fabric Trends", "Print Trends", "Style Trends", "Consumer Insights", "Seasonal Forecasts"], required: true, fullWidth: true },
        { id: "categories", label: "Categories", type: "multiselect", options: ["Menswear", "Womenswear", "Kidswear", "Activewear", "Denim", "Accessories"], fullWidth: true },
      ]},
      { id: "brand-strategy-consulting", name: "Brand Strategy Consulting", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Brand Positioning", "Competitive Analysis", "Target Audience", "Brand Architecture", "Messaging", "Visual Identity"], required: true, fullWidth: true },
        { id: "industries", label: "Industries", type: "multiselect", options: ["Fashion", "Textile", "D2C", "B2B", "Retail"], fullWidth: true },
      ]},
      { id: "ui-ux-website-development", name: "UI/UX & Website Development", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["UI Design", "UX Research", "Wireframing", "Prototyping", "Web Development", "Mobile App Design"], required: true, fullWidth: true },
        { id: "tools", label: "Tools", type: "multiselect", options: ["Figma", "Sketch", "Adobe XD", "InVision", "Webflow", "WordPress"], fullWidth: true },
        { id: "technologies", label: "Technologies", type: "multiselect", options: ["React", "Vue", "Shopify", "WordPress", "Webflow"], fullWidth: true },
      ]},
      { id: "seo-copywriting", name: "SEO & Copywriting", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["SEO Audit", "Keyword Research", "On-page SEO", "Content Writing", "Product Descriptions", "Blog Posts", "Landing Pages"], required: true, fullWidth: true },
        { id: "industries", label: "Industries", type: "multiselect", options: ["Fashion", "E-commerce", "B2B", "Lifestyle"], fullWidth: true },
      ]},
      { id: "b2b-sales-enablement", name: "B2B Sales Enablement", fields: [
        { id: "services", label: "Services", type: "multiselect", options: ["Sales Strategy", "Lead Generation", "CRM Setup", "Sales Collateral", "Pitch Decks", "Trade Show Support"], required: true, fullWidth: true },
        { id: "industries", label: "Industries", type: "multiselect", options: ["Textile", "Apparel", "Manufacturing", "Fashion Tech"], fullWidth: true },
      ]},
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

  // Get base common fields based on seller type
  const baseFields = category.type === "product" 
    ? productCommonFields 
    : category.type === "service" 
    ? serviceCommonFields 
    : freelancerCommonFields;

  // Get category-level common fields
  const categoryFields = category.commonFields || [];
  
  // Get subcategory-specific fields
  let subCategoryFields: FormField[] = [];
  if (subCategoryId) {
    const subCategory = getSubCategoryById(categoryId, subCategoryId);
    subCategoryFields = subCategory?.fields || [];
  }

  // Return fields in order: subcategory-specific first, then category common, then base common
  return [...subCategoryFields, ...categoryFields, ...baseFields];
};
