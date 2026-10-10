// ─────────────────────────────────────────────────────────────
// The photos on the interest picker's tiles, by buyer category id.
//
// Kept apart from buyerCategories.ts, which the preferences store imports;
// only CategoryPickerGrid imports this. vite.config.ts keeps these photos out
// of the bundle as base64 (assetsInlineLimit), so each is a cached file.
// Sources and credits: src/assets/interests/README.md.
// ─────────────────────────────────────────────────────────────

import fabrics from "@/assets/interests/fabrics.webp";
import womensClothing from "@/assets/interests/womens-clothing.webp";
import mensClothing from "@/assets/interests/mens-clothing.webp";
import cosmetics from "@/assets/interests/cosmetics.webp";
import unisexClothing from "@/assets/interests/unisex-clothing.webp";
import kidswear from "@/assets/interests/kidswear.webp";
import accessories from "@/assets/interests/accessories.webp";
import labelsTags from "@/assets/interests/labels-tags.webp";
import itSoftware from "@/assets/interests/it-software.webp";
import rawMaterials from "@/assets/interests/raw-materials.webp";
import packaging from "@/assets/interests/packaging.webp";
import trimsAccessories from "@/assets/interests/trims-accessories.webp";
import fashionDesigner from "@/assets/interests/fashion-designer.webp";
import marketingPr from "@/assets/interests/marketing-pr.webp";
import freelancers from "@/assets/interests/freelancers.webp";
import exporter from "@/assets/interests/exporter.webp";
import photography from "@/assets/interests/photography.webp";

export const BUYER_CATEGORY_IMAGES: Record<string, string> = {
  fabrics,
  "womens-clothing": womensClothing,
  "mens-clothing": mensClothing,
  cosmetics,
  "unisex-clothing": unisexClothing,
  kidswear,
  accessories,
  "labels-tags": labelsTags,
  "it-software": itSoftware,
  "raw-materials": rawMaterials,
  packaging,
  "trims-accessories": trimsAccessories,
  "fashion-designer": fashionDesigner,
  "marketing-pr": marketingPr,
  freelancers,
  exporter,
  photography,
};
