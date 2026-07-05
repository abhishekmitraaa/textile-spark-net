// Buyer ↔ Vendor chat + calls — shared mock data. JSX-free.

export type MsgStatus = "sent" | "delivered" | "read";
export type MsgKind = "text" | "image" | "file" | "audio";

export interface ChatMessage {
  id: string;
  sender: "user" | "vendor";
  text: string;
  time: string;          // "10:30 AM"
  status?: MsgStatus;    // only for user messages
  kind?: MsgKind;
  fileName?: string;
  imageUrl?: string;
}

export interface Conversation {
  id: string;            // also used as vendorId for /vendor/:id
  name: string;
  avatar: string | null;
  online: boolean;
  rating: number;
  reviews: number;
  location: string;
  verified: boolean;
  rfqId: string;         // "RFQ-001"
  rfqProduct: string;    // "Premium Cotton T-Shirts"
  lastMessage: string;
  timestamp: string;     // "2 min ago" | "1 hour ago" | "Wednesday"
  unread: number;
  messages: ChatMessage[];
}

export interface CallRecord {
  id: string;
  vendorId: string;
  name: string;
  avatar: string | null;
  direction: "incoming" | "outgoing" | "missed";
  time: string;          // "10:30 AM" (time only — the group header carries the date)
  group: string;         // "Today" | "Yesterday" | "Jan 20"
  rfqProduct: string;
}

const IMG = (s: string) => `https://images.unsplash.com/photo-${s}?w=120&h=120&fit=crop&q=80`;

export const CONVERSATIONS: Conversation[] = [
  {
    id: "stylecraft-apparels",
    name: "StyleCraft Apparels",
    avatar: IMG("1441984904996-e0b6ba687e04"),
    online: true,
    rating: 4.5,
    reviews: 20,
    location: "New Delhi",
    verified: true,
    rfqId: "RFQ-001",
    rfqProduct: "Premium Cotton T-Shirts",
    lastMessage: "We can offer a better price for 1000+ units",
    timestamp: "2 min ago",
    unread: 0,
    messages: [
      { id: "m1", sender: "vendor", text: "Hello! Thank you for your interest in our Premium Cotton T-Shirts.", time: "10:30 AM" },
      { id: "m2", sender: "user", text: "Hi! I'm looking for a bulk order of 500 units. What's your best price?", time: "10:32 AM", status: "read" },
      { id: "m3", sender: "vendor", text: "For 500 units, we can offer ₹285 per unit. This includes basic packaging.", time: "10:35 AM" },
      { id: "m4", sender: "user", text: "Can you do ₹260 per unit? We're a recurring customer.", time: "10:38 AM", status: "read" },
      { id: "m5", sender: "vendor", text: "We can offer a better price for 1000+ units", time: "10:42 AM" },
    ],
  },
  {
    id: "premium-fabrics-co",
    name: "Premium Fabrics Co",
    avatar: null,
    online: false,
    rating: 4.8,
    reviews: 64,
    location: "Surat, Gujarat",
    verified: true,
    rfqId: "RFQ-004",
    rfqProduct: "Organic Cotton Fabric",
    lastMessage: "Sample will be dispatched tomorrow",
    timestamp: "1 hour ago",
    unread: 2,
    messages: [
      { id: "m1", sender: "user", text: "Could you share a sample of the organic cotton fabric?", time: "9:05 AM", status: "read" },
      { id: "m2", sender: "vendor", text: "Absolutely. Sample will be dispatched tomorrow", time: "9:20 AM" },
      { id: "m3", sender: "vendor", text: "You'll receive the tracking details by evening.", time: "9:21 AM" },
    ],
  },
  {
    id: "urban-threads",
    name: "Urban Threads",
    avatar: IMG("1521572163474-6864f9cf17ab"),
    online: false,
    rating: 4.6,
    reviews: 38,
    location: "Tiruppur, Tamil Nadu",
    verified: true,
    rfqId: "RFQ-002",
    rfqProduct: "Denim Jeans",
    lastMessage: "Sample will be dispatched tomorrow",
    timestamp: "Wednesday",
    unread: 2,
    messages: [
      { id: "m1", sender: "vendor", text: "Hi! We received your quote request for Denim Jeans.", time: "Wed" },
      { id: "m2", sender: "user", text: "Great. Can you share the MOQ and lead time?", time: "Wed", status: "read" },
      { id: "m3", sender: "vendor", text: "MOQ is 300 pieces, lead time 15 days. Sample will be dispatched tomorrow", time: "Wed" },
    ],
  },
];

export const CALLS: CallRecord[] = [
  { id: "c1", vendorId: "stylecraft-apparels", name: "StyleCraft Apparels", avatar: IMG("1441984904996-e0b6ba687e04"), direction: "outgoing", time: "11:30 AM", group: "Today", rfqProduct: "Premium Cotton T-Shirts" },
  { id: "c2", vendorId: "urban-threads", name: "Urban Threads", avatar: IMG("1521572163474-6864f9cf17ab"), direction: "incoming", time: "9:15 AM", group: "Today", rfqProduct: "Premium Cotton T-Shirts" },
  { id: "c3", vendorId: "fabric-first", name: "Fabric First", avatar: IMG("1558769132-cb1aea458c5e"), direction: "missed", time: "4:30 PM", group: "Yesterday", rfqProduct: "Linen Blend" },
  { id: "c4", vendorId: "knitworks-india", name: "KnitWorks India", avatar: IMG("1489987707025-afc232f7ea0f"), direction: "outgoing", time: "2:00 PM", group: "Yesterday", rfqProduct: "Premium Cotton T-Shirts" },
  { id: "c5", vendorId: "stylecraft-apparels", name: "StyleCraft Apparels", avatar: IMG("1441984904996-e0b6ba687e04"), direction: "incoming", time: "11:00 AM", group: "Jan 20", rfqProduct: "Premium Cotton T-Shirts" },
];

export const getConversation = (id: string) => CONVERSATIONS.find((c) => c.id === id);

// Turn a vendor id/slug into a display name ("urban-threads" → "Urban Threads").
export const prettifyVendorName = (id: string) =>
  /^\d+$/.test(id)
    ? "Vendor Store"
    : id.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "Vendor Store";

// Chat is reachable from every product/vendor surface, so any id must open a
// usable thread. Return the seeded conversation, or synthesize a fresh one.
export const getOrCreateConversation = (id: string): Conversation => {
  const found = getConversation(id);
  if (found) return found;
  const name = prettifyVendorName(id);
  return {
    id, name, avatar: null, online: false, rating: 4.6, reviews: 0,
    location: "India", verified: true, rfqId: "RFQ-NEW", rfqProduct: "New enquiry",
    lastMessage: "", timestamp: "Now", unread: 0,
    messages: [{ id: "m1", sender: "vendor", text: "Hi! Thanks for reaching out. How can we help with your requirement?", time: "Now" }],
  };
};

// Order groups Today → Yesterday → older, preserving insertion order for the rest.
export const callGroupsInOrder = (): { group: string; calls: CallRecord[] }[] => {
  const order = ["Today", "Yesterday"];
  const groups: string[] = [];
  for (const c of CALLS) if (!groups.includes(c.group)) groups.push(c.group);
  groups.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return 0;
  });
  return groups.map((g) => ({ group: g, calls: CALLS.filter((c) => c.group === g) }));
};

// Legal requirement: chat monitoring disclosure shown in every chat flow.
export const CHAT_MONITORING_NOTICE =
  "For your safety, Cosora will be monitoring the messages in this chat.";
