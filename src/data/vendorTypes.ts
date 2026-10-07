// What a vendor is, what it can do, and how its capacity is counted (Ranking Part 1, F2).
// The values are checked by vendor_profiles_primary_type_known,
// vendor_profiles_capabilities_known and vendor_capacity's unit check; keep them in step
// with migration 20261007052605_vendor_type_location_capacity.

import { sellerCategories } from "@/data/sellerCategories";

export const PRIMARY_TYPES = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "trader_wholesaler", label: "Trader / Wholesaler" },
  { value: "retailer", label: "Retailer" },
  { value: "job_worker", label: "Job worker" },
  { value: "service_provider", label: "Service provider" },
  { value: "freelancer", label: "Freelancer" },
] as const;
export type PrimaryType = (typeof PRIMARY_TYPES)[number]["value"];

export const CAPABILITIES = [
  { value: "private_label", label: "Private label" },
  { value: "made_to_order", label: "Made to order" },
  { value: "export_ready", label: "Export-ready" },
  { value: "sampling", label: "Sampling" },
  { value: "sustainable", label: "Sustainable" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["value"];

export const CAPACITY_UNITS = [
  { value: "pieces", label: "pieces" },
  { value: "metres", label: "metres" },
  { value: "kg", label: "kg" },
  { value: "litres", label: "litres" },
  { value: "orders", label: "orders" },
  { value: "projects", label: "projects" },
] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number]["value"];

export const primaryTypeLabel = (v: string | null | undefined) => PRIMARY_TYPES.find((t) => t.value === v)?.label ?? "";
export const capabilityLabel = (v: string) => CAPABILITIES.find((c) => c.value === v)?.label ?? v;
export const categoryRootName = (id: string) => sellerCategories.find((c) => c.id === id)?.name ?? id;

/** The unit a category's capacity is usually counted in; the vendor can change it. */
export function defaultCapacityUnit(categoryRoot: string): CapacityUnit {
  const cat = sellerCategories.find((c) => c.id === categoryRoot);
  if (!cat) return "pieces";
  if (cat.type !== "product") return "projects";
  if (categoryRoot === "raw-materials") return "metres";
  if (categoryRoot === "chemicals-dyes") return "kg";
  return "pieces";
}
