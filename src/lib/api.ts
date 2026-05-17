import type { BuyerProductCardData } from "@/components/buyer/BuyerProductCard";

// Temporary in-memory data source for New Arrivals.
// Replace with real API endpoints when available.
const baseProducts: BuyerProductCardData[] = [
  // keep a small representative sample; real implementation will fetch from backend
  {
    id: "na-1",
    vendorId: "vendor-1",
    name: "Premium Cotton Polo T-shirt",
    manufacturer: "Fashion Hub Pvt Ltd",
    location: "Bangalore, India",
    price: "₹499",
    moq: "MOQ: 2",
    soldCount: "800+ sold",
    enquiries: "5.6k",
    rating: 4.1,
    reviews: 565,
    fabric: "Cotton",
    gsm: "GSM: 220",
    fitType: "Fit Type: Regular",
    image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&h=1000&fit=crop",
    secondaryImage: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&h=1000&fit=crop",
    verified: true,
  },
  {
    id: "na-2",
    vendorId: "vendor-2",
    name: "Classic White Shirt",
    manufacturer: "Textile Mills India",
    location: "Mumbai, India",
    price: "₹599",
    moq: "MOQ: 2",
    soldCount: "640+ sold",
    enquiries: "4.8k",
    rating: 4.5,
    reviews: 750,
    fabric: "Cotton",
    gsm: "GSM: 200",
    fitType: "Fit Type: Regular",
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=800&h=1000&fit=crop",
    secondaryImage: "https://images.unsplash.com/photo-1598032895397-b9472444bf93?w=800&h=1000&fit=crop",
    verified: true,
  },
];

export async function getNewArrivals(): Promise<BuyerProductCardData[]> {
  // simulate network latency
  await new Promise((res) => setTimeout(res, 140));
  return baseProducts;
}
