import { useQuery } from "@tanstack/react-query";
import { vendorBlogs } from "@/data/vendorBlogs";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface VendorQuoteSummary {
  totalSent: number;
  pending: number;
  negotiating: number;
  accepted: number;
  acceptanceRate: string;
  avgResponseTime: string;
  totalValue: string;
}

export interface VendorOnboardingSummary {
  profileScore: number;
  emailMissing: boolean;
  demandSignal: string;
  locationPrompt: string;
  locationOptions: Array<"automatic" | "manual">;
}

export const vendorQuoteSummaryFixture: VendorQuoteSummary = {
  totalSent: 5,
  pending: 1,
  negotiating: 1,
  accepted: 1,
  acceptanceRate: "40%",
  avgResponseTime: "2.3 days",
  totalValue: "$85,500",
};

export const vendorOnboardingSummaryFixture: VendorOnboardingSummary = {
  profileScore: 20,
  emailMissing: true,
  demandSignal: "3,302 inquiries for Fabric Wholesalers in Delhi",
  locationPrompt: "Choose automatic detection or enter your business location manually.",
  locationOptions: ["automatic", "manual"],
};

async function fetchVendorQuoteSummary(): Promise<VendorQuoteSummary> {
  await delay(120);
  return vendorQuoteSummaryFixture;
}

async function fetchVendorOnboardingSummary(): Promise<VendorOnboardingSummary> {
  await delay(120);
  return vendorOnboardingSummaryFixture;
}

async function fetchVendorBlogFeed() {
  await delay(120);
  return vendorBlogs;
}

export function useVendorQuoteSummary() {
  return useQuery({
    queryKey: ["vendor", "quote-summary"],
    queryFn: fetchVendorQuoteSummary,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVendorOnboardingSummary() {
  return useQuery({
    queryKey: ["vendor", "onboarding-summary"],
    queryFn: fetchVendorOnboardingSummary,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVendorBlogFeed() {
  return useQuery({
    queryKey: ["vendor", "blog-feed"],
    queryFn: fetchVendorBlogFeed,
    staleTime: 5 * 60 * 1000,
  });
}
