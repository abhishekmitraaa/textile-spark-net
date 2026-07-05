import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────
// Buyer → vendor reviews (public read; one review per buyer per vendor).
// A buyer writes from the vendor profile; the vendor sees + replies from the
// Reviews page; the buyer manages their own from My Reviews. Reviewer name +
// company are denormalized on the row so the vendor side needs no extra read.
// The `reviews` insert/update/delete keeps `vendor_profiles.rating_avg` /
// `reviews_count` in sync via a DB trigger. See [[buyer-side-db-status]].
// ─────────────────────────────────────────────────────────────

export interface VendorReview {
  id: string;
  rating: number;
  body: string | null;
  reviewerName: string;
  reviewerCompany: string | null;
  replyBody: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface RatingBucket {
  stars: number; // 5..1
  count: number;
  percent: number;
}

export interface VendorReviewsData {
  reviews: VendorReview[];
  avg: number;
  count: number;
  breakdown: RatingBucket[];
}

interface RawReview {
  id: string;
  rating: number;
  body: string | null;
  reviewer_name: string | null;
  reviewer_company: string | null;
  reply_body: string | null;
  replied_at: string | null;
  created_at: string;
}

function buildBreakdown(ratings: number[]): RatingBucket[] {
  const total = ratings.length;
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((r) => r === stars).length;
    return { stars, count, percent: total ? Math.round((count / total) * 100) : 0 };
  });
}

async function fetchVendorReviews(vendorId: string): Promise<VendorReviewsData> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, body, reviewer_name, reviewer_company, reply_body, replied_at, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawReview[];
  const reviews: VendorReview[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    reviewerName: r.reviewer_name ?? "Cosora Buyer",
    reviewerCompany: r.reviewer_company,
    replyBody: r.reply_body,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
  }));
  const ratings = rows.map((r) => r.rating);
  const avg = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0;
  return { reviews, avg, count: ratings.length, breakdown: buildBreakdown(ratings) };
}

export function useVendorReviews(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "vendor", vendorId],
    queryFn: () => fetchVendorReviews(vendorId as string),
    enabled: Boolean(vendorId),
  });
}

// ── Product reviews (buyer → product, on the ProductDetail page) ─────────
export interface ProductReview {
  id: string;
  rating: number;
  body: string | null;
  reviewerName: string;
  sizeBought: string | null;
  photos: string[];
  createdAt: string;
}

export interface ProductReviewsData {
  reviews: ProductReview[];
  avg: number;
  count: number;
  breakdown: RatingBucket[];
}

interface RawProductReview {
  id: string;
  rating: number;
  body: string | null;
  reviewer_name: string | null;
  size_bought: string | null;
  photos: string[] | null;
  created_at: string;
}

async function fetchProductReviews(productId: string): Promise<ProductReviewsData> {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id, rating, body, reviewer_name, size_bought, photos, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawProductReview[];
  const reviews: ProductReview[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    reviewerName: r.reviewer_name ?? "Cosora Buyer",
    sizeBought: r.size_bought,
    photos: r.photos ?? [],
    createdAt: r.created_at,
  }));
  const ratings = rows.map((r) => r.rating);
  const avg = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0;
  return { reviews, avg, count: ratings.length, breakdown: buildBreakdown(ratings) };
}

export function useProductReviews(productId: string | undefined) {
  return useQuery({
    queryKey: ["product_reviews", productId],
    queryFn: () => fetchProductReviews(productId as string),
    enabled: Boolean(productId),
  });
}

// ── Service reviews (service vendors / freelancers / photographers) ──────
// These entities are still client-side mock, so reviews key off the mock seed
// id + kind (no FK) and the aggregate is computed client-side.
export type ServiceKind = "service_vendor" | "freelancer" | "photographer";

export interface ServiceReviewsData {
  reviews: VendorReview[]; // reuses the vendor review display shape (no reply)
  avg: number;
  count: number;
  breakdown: RatingBucket[];
}

interface RawServiceReview {
  id: string;
  rating: number;
  body: string | null;
  reviewer_name: string | null;
  created_at: string;
}

async function fetchServiceReviews(kind: ServiceKind, serviceId: string): Promise<ServiceReviewsData> {
  const { data, error } = await supabase
    .from("service_reviews")
    .select("id, rating, body, reviewer_name, created_at")
    .eq("service_kind", kind)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as RawServiceReview[];
  const reviews: VendorReview[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body,
    reviewerName: r.reviewer_name ?? "Cosora Buyer",
    reviewerCompany: null,
    replyBody: null,
    repliedAt: null,
    createdAt: r.created_at,
  }));
  const ratings = rows.map((r) => r.rating);
  const avg = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 0;
  return { reviews, avg, count: ratings.length, breakdown: buildBreakdown(ratings) };
}

export function useServiceReviews(kind: ServiceKind, serviceId: string | undefined) {
  return useQuery({
    queryKey: ["service_reviews", kind, serviceId],
    queryFn: () => fetchServiceReviews(kind, serviceId as string),
    enabled: Boolean(serviceId),
  });
}

// ── Buyer's own reviews (My Reviews page) — vendor + product + service ────
export interface MyReviewItem {
  kind: "vendor" | "product" | "service";
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  name: string;
  subtitle: string;
  image: string | null;
}

interface RawMyVendorReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  vendor_profiles: { brand_name: string | null; city: string | null; business_type: string | null; logo_url: string | null } | null;
}
interface RawMyProductReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  products: { name: string | null; location: string | null; product_images: { url: string; position: number }[] | null } | null;
}
interface RawMyServiceReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  service_kind: ServiceKind;
  service_name: string | null;
}

const SERVICE_LABEL: Record<ServiceKind, string> = {
  service_vendor: "Service Vendor",
  freelancer: "Freelancer",
  photographer: "Photographer",
};

async function fetchMyReviews(buyerId: string): Promise<MyReviewItem[]> {
  const [{ data: vendorRows, error: ve }, { data: productRows, error: pe }, { data: serviceRows, error: se }] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, body, created_at, vendor_profiles ( brand_name, city, business_type, logo_url )")
      .eq("buyer_id", buyerId),
    supabase
      .from("product_reviews")
      .select("id, rating, body, created_at, products ( name, location, product_images ( url, position ) )")
      .eq("buyer_id", buyerId),
    supabase
      .from("service_reviews")
      .select("id, rating, body, created_at, service_kind, service_name")
      .eq("buyer_id", buyerId),
  ]);
  if (ve) throw ve;
  if (pe) throw pe;
  if (se) throw se;

  const vendorItems: MyReviewItem[] = ((vendorRows ?? []) as unknown as RawMyVendorReview[]).map((r) => ({
    kind: "vendor",
    id: r.id,
    rating: r.rating,
    body: r.body,
    createdAt: r.created_at,
    name: r.vendor_profiles?.brand_name ?? "Vendor",
    subtitle: [r.vendor_profiles?.business_type, r.vendor_profiles?.city].filter(Boolean).join(" · ") || "Vendor",
    image: r.vendor_profiles?.logo_url ?? null,
  }));

  const productItems: MyReviewItem[] = ((productRows ?? []) as unknown as RawMyProductReview[]).map((r) => {
    const cover = [...(r.products?.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url ?? null;
    return {
      kind: "product",
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
      name: r.products?.name ?? "Product",
      subtitle: r.products?.location || "Product",
      image: cover,
    };
  });

  const serviceItems: MyReviewItem[] = ((serviceRows ?? []) as unknown as RawMyServiceReview[]).map((r) => ({
    kind: "service",
    id: r.id,
    rating: r.rating,
    body: r.body,
    createdAt: r.created_at,
    name: r.service_name ?? SERVICE_LABEL[r.service_kind] ?? "Service",
    subtitle: SERVICE_LABEL[r.service_kind] ?? "Service",
    image: null,
  }));

  return [...vendorItems, ...productItems, ...serviceItems].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function useMyReviews() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["reviews", "mine", user?.id],
    queryFn: () => fetchMyReviews(user!.id),
    enabled: Boolean(user),
  });
}

// ── Mutations ────────────────────────────────────────────────────────────
export function useReviewMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const signedIn = Boolean(user);

  const invalidate = useCallback(
    (opts?: { vendorId?: string; productId?: string }) => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["product_reviews"] });
      qc.invalidateQueries({ queryKey: ["service_reviews"] });
      qc.invalidateQueries({ queryKey: ["vendor_profile"] });
      if (opts?.vendorId) qc.invalidateQueries({ queryKey: ["reviews", "vendor", opts.vendorId] });
      if (opts?.productId) qc.invalidateQueries({ queryKey: ["product_reviews", opts.productId] });
    },
    [qc],
  );

  // The buyer's public name/company, used to denormalize reviews.
  const resolveReviewer = useCallback(async () => {
    if (!user) throw new Error("Please sign in to leave a review");
    const [{ data: bp }, { data: pr }] = await Promise.all([
      supabase.from("buyer_profiles").select("display_name, company").eq("id", user.id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    ]);
    return {
      name: bp?.display_name || pr?.full_name || user.email?.split("@")[0] || "Cosora Buyer",
      company: bp?.company ?? null,
    };
  }, [user]);

  // Buyer creates or edits their review of a vendor (unique per vendor+buyer).
  const submit = useCallback(
    async (vendorId: string, rating: number, body: string) => {
      const reviewer = await resolveReviewer();
      const { error } = await supabase.from("reviews").upsert(
        {
          vendor_id: vendorId,
          buyer_id: user!.id,
          rating,
          body: body.trim() || null,
          reviewer_name: reviewer.name,
          reviewer_company: reviewer.company,
        },
        { onConflict: "vendor_id,buyer_id" },
      );
      if (error) throw error;
      invalidate({ vendorId });
    },
    [user, resolveReviewer, invalidate],
  );

  const updateReview = useCallback(
    async (id: string, rating: number, body: string) => {
      const { error } = await supabase.from("reviews").update({ rating, body: body.trim() || null }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const removeReview = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  // Buyer creates or edits their review of a product (unique per product+buyer).
  const submitProductReview = useCallback(
    async (productId: string, rating: number, body: string) => {
      const reviewer = await resolveReviewer();
      const { error } = await supabase.from("product_reviews").upsert(
        {
          product_id: productId,
          buyer_id: user!.id,
          rating,
          body: body.trim() || null,
          reviewer_name: reviewer.name,
        },
        { onConflict: "product_id,buyer_id" },
      );
      if (error) throw error;
      invalidate({ productId });
    },
    [user, resolveReviewer, invalidate],
  );

  const updateProductReview = useCallback(
    async (id: string, rating: number, body: string) => {
      const { error } = await supabase.from("product_reviews").update({ rating, body: body.trim() || null }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const removeProductReview = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("product_reviews").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  // Buyer creates or edits their review of a service entity (vendor/freelancer/photographer).
  const submitServiceReview = useCallback(
    async (kind: ServiceKind, serviceId: string, serviceName: string, rating: number, body: string) => {
      const reviewer = await resolveReviewer();
      const { error } = await supabase.from("service_reviews").upsert(
        {
          service_kind: kind,
          service_id: serviceId,
          service_name: serviceName || null,
          buyer_id: user!.id,
          rating,
          body: body.trim() || null,
          reviewer_name: reviewer.name,
        },
        { onConflict: "service_kind,service_id,buyer_id" },
      );
      if (error) throw error;
      invalidate();
    },
    [user, resolveReviewer, invalidate],
  );

  const updateServiceReview = useCallback(
    async (id: string, rating: number, body: string) => {
      const { error } = await supabase.from("service_reviews").update({ rating, body: body.trim() || null }).eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  const removeServiceReview = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("service_reviews").delete().eq("id", id);
      if (error) throw error;
      invalidate();
    },
    [invalidate],
  );

  // Vendor replies to a review about them (routed through a SECURITY DEFINER RPC
  // so the vendor can only touch the reply fields, never the buyer's rating/body).
  const reply = useCallback(
    async (reviewId: string, replyBody: string, vendorId?: string) => {
      const { error } = await supabase.rpc("reply_to_review", { review_id: reviewId, reply: replyBody });
      if (error) throw error;
      invalidate({ vendorId });
    },
    [invalidate],
  );

  return {
    submit, updateReview, removeReview,
    submitProductReview, updateProductReview, removeProductReview,
    submitServiceReview, updateServiceReview, removeServiceReview,
    reply, signedIn,
  };
}
