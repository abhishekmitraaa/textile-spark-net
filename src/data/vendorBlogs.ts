export type VendorBlogCategory = "Community" | "Company";

export interface VendorBlog {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  readTime: string;
  category: VendorBlogCategory;
  image: string;
  body: string[];
  tags: string[];
}

export const vendorBlogs: VendorBlog[] = [
  {
    id: "global-sourcing-2025",
    title: "How Indian Manufacturers Are Going Global in 2025",
    excerpt: "The fastest growing textile brands are combining catalog quality, lead response speed, and trust signals to win export buyers.",
    author: "Cosora Editorial",
    date: "Jan 2025",
    readTime: "5 min read",
    category: "Community",
    image: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=1200&h=800&fit=crop",
    body: [
      "Global buyers do not just compare price. They compare clarity, responsiveness, compliance, and proof of capability. The manufacturers that win are the ones that make these signals visible everywhere.",
      "On Cosora, the strongest vendors use complete listings, fast lead responses, and trust assets like verified badges, reviews, and clean catalog imagery to stand out.",
      "That combination turns the platform from a simple discovery tool into a repeat business engine, especially for B2B fashion and textile sourcing.",
    ],
    tags: ["Exports", "Lead Quality", "Verified Sellers"],
  },
  {
    id: "more-leads-on-cosora",
    title: "10 Practical Ways to Get More Leads on Cosora",
    excerpt: "Small improvements in profile quality, product detail, and response speed can drive a noticeably better lead pipeline.",
    author: "Cosora Growth Team",
    date: "Dec 2024",
    readTime: "3 min read",
    category: "Company",
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1200&h=800&fit=crop",
    body: [
      "Start with the basics: complete every mandatory field, upload clean product images, and keep your MOQ and lead time current.",
      "Next, add trust layers. Reviews, certifications, accurate categories, and clear pricing improve both buyer confidence and platform ranking.",
      "Finally, respond quickly. The faster a vendor replies to a relevant inquiry, the more likely that lead is to convert.",
    ],
    tags: ["Profile Score", "Catalog Quality", "Speed to Lead"],
  },
  {
    id: "build-trust-with-reviews",
    title: "Why Review Collection Should Be Part of Your Sales Process",
    excerpt: "Offline review collection through QR codes helps vendors bring trade-fair and packaging interactions back into the app.",
    author: "Cosora Operations",
    date: "Nov 2024",
    readTime: "4 min read",
    category: "Community",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&h=800&fit=crop",
    body: [
      "Reviews are not just social proof. In a B2B marketplace, they influence ranking, response rates, and buyer confidence on the next inquiry.",
      "A QR code on invoices, packaging, and business cards turns every offline interaction into a review opportunity.",
      "That makes reputation a repeatable system instead of an afterthought.",
    ],
    tags: ["Reviews", "Trust", "Offline to Online"],
  },
];

export const vendorBlogCategories: Array<"All Categories" | VendorBlogCategory> = ["All Categories", "Community", "Company"];

export const getVendorBlogById = (id: string) => vendorBlogs.find((blog) => blog.id === id);
