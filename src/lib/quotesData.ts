// Buyer "My Quotes" data layer — RFQ requests the buyer posted and the vendor
// quotes received against them. JSX-free so it can back both the page and the
// quotesStore without import cycles.

export type RfqStatus = "active" | "closed";
export type QuoteStatus = "pending" | "shortlisted" | "accepted" | "rejected";

export interface Rfq {
  id: string;
  title: string;
  productName: string;      // used as the "For:" label on quote cards
  units: number;
  priceMin: number;
  priceMax: number;
  image: string;
  status: RfqStatus;
  newCount: number;         // "N new" badge
  lowest: number;           // lowest quote (₹) shown on the request card
  date: string;             // "March 30, 2024"
}

export interface QuoteAttachments {
  images: string[];
  videos: string[];
  documents: { name: string; url: string }[];
}

export interface VendorQuote {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  vendorInitials: string;
  verified: boolean;
  rating: number;
  ratingCount: string;      // "1.2K"
  location: string;         // "Bangladesh"
  responseTime: string;     // "6h avg"
  status: QuoteStatus;
  // Vendor quotes are shown in the vendor's own currency (₹ for India, else $)
  currency: string;         // "₹" | "$"
  pricePerUnit: number;
  priceINR: number;         // INR-normalized value, used for cross-currency ranking
  moq: number;
  leadTime: string;         // "30 days" or "15-18 days"
  sampling: number;         // sampling cost
  sampleTimeline: string;   // "7 Days"
  fabric: string;
  comment: string;
  submittedAgo: string;     // "1 day ago"
  isNew: boolean;
  attachments: QuoteAttachments;
}

// ── Money formatting (₹ no decimals, $ two decimals) ──
export function fmtMoney(currency: string, value: number): string {
  return currency === "₹" ? `${currency}${Math.round(value)}` : `${currency}${value.toFixed(2)}`;
}

const pimg = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

// ── RFQs ──
export const RFQS: Rfq[] = [
  {
    id: "rfq-1",
    title: "Premium Cotton T-Shirts",
    productName: "Premium Cotton T-Shirts",
    units: 500,
    priceMin: 200,
    priceMax: 350,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=200&h=200&fit=crop",
    status: "active",
    newCount: 2,
    lowest: 245,
    date: "March 30, 2024",
  },
  {
    id: "rfq-2",
    title: "Polo Shirts - Custom Embroidery",
    productName: "Polo Shirts",
    units: 300,
    priceMin: 350,
    priceMax: 500,
    image: "https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=200&h=200&fit=crop",
    status: "active",
    newCount: 0,
    lowest: 380,
    date: "April 15, 2024",
  },
  {
    id: "rfq-3",
    title: "Hoodies - Fleece",
    productName: "Fleece Hoodies",
    units: 200,
    priceMin: 600,
    priceMax: 800,
    image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=200&h=200&fit=crop",
    status: "closed",
    newCount: 0,
    lowest: 620,
    date: "March 10, 2024",
  },
];

const stdAttachments = (seed: string): QuoteAttachments => ({
  images: [pimg(`${seed}-1`), pimg(`${seed}-2`), pimg(`${seed}-3`)],
  videos: [pimg(`${seed}-v`)],
  documents: [{ name: "Specifications.pdf", url: "#" }],
});

// ── Vendor quotes ──
export const QUOTES: VendorQuote[] = [
  {
    id: "q1", rfqId: "rfq-1", vendorId: "textile-masters", vendorName: "Textile Masters Ltd", vendorInitials: "TM",
    verified: true, rating: 4.8, ratingCount: "1.4k", location: "Mumbai, India", responseTime: "2h avg",
    status: "pending", currency: "₹", pricePerUnit: 245, priceINR: 245, moq: 500, leadTime: "20 days", sampling: 60,
    sampleTimeline: "7 Days", fabric: "100% Combed Cotton",
    comment: "Premium combed cotton, pre-shrunk. Bulk discounts available above 5,000 units.",
    submittedAgo: "1 day ago", isNew: true, attachments: stdAttachments("q1"),
  },
  {
    id: "q2", rfqId: "rfq-1", vendorId: "global-garments", vendorName: "Global Garments", vendorInitials: "GG",
    verified: true, rating: 4.3, ratingCount: "1.2K", location: "Bangladesh", responseTime: "3h avg",
    status: "pending", currency: "$", pricePerUnit: 12.0, priceINR: 1056, moq: 2000, leadTime: "30 days", sampling: 75,
    sampleTimeline: "7 Days", fabric: "100% Combed Cotton",
    comment: "Expert in linen garments. ISO certified factory.",
    submittedAgo: "1 day ago", isNew: true, attachments: stdAttachments("q2"),
  },
  {
    id: "q3", rfqId: "rfq-1", vendorId: "fashion-hub", vendorName: "Fashion Hub Exports", vendorInitials: "FH",
    verified: false, rating: 4.4, ratingCount: "980", location: "Delhi, India", responseTime: "6h avg",
    status: "rejected", currency: "₹", pricePerUnit: 290, priceINR: 290, moq: 3000, leadTime: "25 days", sampling: 50,
    sampleTimeline: "10 Days", fabric: "Cotton Blend",
    comment: "Competitive pricing with bulk orders.",
    submittedAgo: "2 days ago", isNew: false, attachments: stdAttachments("q3"),
  },
  {
    id: "q4", rfqId: "rfq-1", vendorId: "premium-fabrics", vendorName: "Premium Fabrics Co", vendorInitials: "PF",
    verified: true, rating: 4.9, ratingCount: "760", location: "Tirupur, India", responseTime: "1h avg",
    status: "shortlisted", currency: "₹", pricePerUnit: 305, priceINR: 305, moq: 500, leadTime: "18 days", sampling: 45,
    sampleTimeline: "5 Days", fabric: "Organic Cotton",
    comment: "Specialized in oversized fits. Can provide custom wash treatments.",
    submittedAgo: "5 hours ago", isNew: false, attachments: stdAttachments("q4"),
  },
  {
    id: "q5", rfqId: "rfq-1", vendorId: "stylecraft", vendorName: "StyleCraft Apparels", vendorInitials: "SC",
    verified: true, rating: 4.8, ratingCount: "2.3k", location: "Bangalore, India", responseTime: "2h avg",
    status: "shortlisted", currency: "₹", pricePerUnit: 285, priceINR: 285, moq: 200, leadTime: "15-18 days", sampling: 50,
    sampleTimeline: "6 Days", fabric: "100% Combed Cotton",
    comment: "Trusted by 40+ D2C brands. In-house dyeing unit.",
    submittedAgo: "6 hours ago", isNew: false, attachments: stdAttachments("q5"),
  },
  {
    id: "q6", rfqId: "rfq-1", vendorId: "urban-threads", vendorName: "Urban Threads", vendorInitials: "UT",
    verified: false, rating: 4.5, ratingCount: "1.9k", location: "Ludhiana, India", responseTime: "4h avg",
    status: "pending", currency: "₹", pricePerUnit: 265, priceINR: 265, moq: 300, leadTime: "12-15 days", sampling: 45,
    sampleTimeline: "7 Days", fabric: "Cotton Blend",
    comment: "Fast turnaround, ideal for repeat orders.",
    submittedAgo: "8 hours ago", isNew: true, attachments: stdAttachments("q6"),
  },
  {
    id: "q7", rfqId: "rfq-1", vendorId: "fabric-first", vendorName: "Fabric First", vendorInitials: "FF",
    verified: true, rating: 4.6, ratingCount: "540", location: "Surat, India", responseTime: "5h avg",
    status: "pending", currency: "₹", pricePerUnit: 320, priceINR: 320, moq: 150, leadTime: "18-22 days", sampling: 55,
    sampleTimeline: "8 Days", fabric: "Organic Cotton",
    comment: "GOTS-certified organic cotton, low MOQ friendly.",
    submittedAgo: "10 hours ago", isNew: false, attachments: stdAttachments("q7"),
  },
  {
    id: "q8", rfqId: "rfq-1", vendorId: "coastal-knits", vendorName: "Coastal Knits", vendorInitials: "CK",
    verified: true, rating: 4.2, ratingCount: "410", location: "Chennai, India", responseTime: "3h avg",
    status: "accepted", currency: "₹", pricePerUnit: 250, priceINR: 250, moq: 1000, leadTime: "21 days", sampling: 50,
    sampleTimeline: "7 Days", fabric: "100% Combed Cotton",
    comment: "We can offer 10% discount for orders above 5,000 units. Premium cotton sourced from Gujarat.",
    submittedAgo: "2 hours ago", isNew: false, attachments: stdAttachments("q8"),
  },
  // rfq-2
  {
    id: "q9", rfqId: "rfq-2", vendorId: "stylecraft", vendorName: "StyleCraft Apparels", vendorInitials: "SC",
    verified: true, rating: 4.8, ratingCount: "2.3k", location: "Bangalore, India", responseTime: "2h avg",
    status: "pending", currency: "₹", pricePerUnit: 380, priceINR: 380, moq: 300, leadTime: "16-20 days", sampling: 70,
    sampleTimeline: "7 Days", fabric: "Pique Knit",
    comment: "Custom embroidery included. Thread color matching available.",
    submittedAgo: "1 day ago", isNew: true, attachments: stdAttachments("q9"),
  },
  {
    id: "q10", rfqId: "rfq-2", vendorId: "premium-fabrics", vendorName: "Premium Fabrics Co", vendorInitials: "PF",
    verified: true, rating: 4.9, ratingCount: "760", location: "Tirupur, India", responseTime: "1h avg",
    status: "pending", currency: "₹", pricePerUnit: 420, priceINR: 420, moq: 250, leadTime: "14-18 days", sampling: 65,
    sampleTimeline: "5 Days", fabric: "Cotton Pique",
    comment: "Premium collar construction, tipping options available.",
    submittedAgo: "2 days ago", isNew: false, attachments: stdAttachments("q10"),
  },
];
