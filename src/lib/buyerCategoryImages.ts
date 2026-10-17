// ─────────────────────────────────────────────────────────────
// The photos on the interest picker's tiles, by buyer category id.
//
// Kept apart from buyerCategories.ts, which the preferences store imports;
// only CategoryPickerGrid imports this. vite.config.ts keeps these photos out
// of the bundle as base64 (assetsInlineLimit), so each is a cached file. JPEG since 2026-10-17 (were WebP).
// Sources and credits: src/assets/interests/README.md.
// ─────────────────────────────────────────────────────────────

import fabrics from "@/assets/interests/fabrics.jpg";
import womensClothing from "@/assets/interests/womens-clothing.jpg";
import mensClothing from "@/assets/interests/mens-clothing.jpg";
import cosmetics from "@/assets/interests/cosmetics.jpg";
import unisexClothing from "@/assets/interests/unisex-clothing.jpg";
import kidswear from "@/assets/interests/kidswear.jpg";
import accessories from "@/assets/interests/accessories.jpg";
import labelsTags from "@/assets/interests/labels-tags.jpg";
import itSoftware from "@/assets/interests/it-software.jpg";
import rawMaterials from "@/assets/interests/raw-materials.jpg";
import packaging from "@/assets/interests/packaging.jpg";
import trimsAccessories from "@/assets/interests/trims-accessories.jpg";
import fashionDesigner from "@/assets/interests/fashion-designer.jpg";
import marketingPr from "@/assets/interests/marketing-pr.jpg";
import freelancers from "@/assets/interests/freelancers.jpg";
import exporter from "@/assets/interests/exporter.jpg";
import photography from "@/assets/interests/photography.jpg";

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
