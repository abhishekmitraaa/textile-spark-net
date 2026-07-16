import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search, MessageCircle, Phone, Mail, FileText,
  ShoppingBag, CreditCard, User, HelpCircle, ChevronRight,
  ExternalLink, Instagram, X, Paperclip, Send, Camera,
  ArrowLeft, Image as ImageIcon, Music, FileText as FilePdf,
} from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const TAP = { scale: 0.97 };
const TAP_T = { duration: 0.13, ease: E };

const page = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const section = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } },
};
const listContainer = {
  show: { transition: { staggerChildren: 0.055 } },
};
const listItem = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.26 } },
};

// ─────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────

const faqCategories = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: HelpCircle,
    faqs: [
      { question: "How do I create my first RFQ (Request for Quote)?", answer: "Navigate to 'Post Requirement' from your dashboard or sidebar. You can choose Quick RFQ for simple requests or create a detailed requirement with specifications like category, quantity, fabric type, and more." },
      { question: "How do I find the right vendors for my needs?", answer: "Use our smart matching system by posting your requirements. We'll connect you with verified vendors who specialize in your product category. You can also browse vendor profiles and view their ratings and reviews." },
      { question: "What information should I include in my requirement?", answer: "Include product category, quantity, preferred fabric/material, size range, any specific designs or prints, target price range, and delivery timeline. The more details you provide, the better quotes you'll receive." },
    ],
  },
  {
    id: "orders-quotes",
    title: "Orders & Quotes",
    icon: ShoppingBag,
    faqs: [
      { question: "How do I compare quotes from different vendors?", answer: "Go to 'My Quotes' section where you can view all received quotes side by side. Our comparison tool highlights the best price and fastest delivery options to help you make informed decisions." },
      { question: "Can I negotiate prices with vendors?", answer: "Yes! You can use our integrated chat feature to communicate directly with vendors. Discuss pricing, minimum order quantities, customizations, and delivery terms before finalising your order." },
      { question: "How do I track my order status?", answer: "Once you've placed an order, you can track it from your dashboard under 'Active Orders'. You'll receive notifications at each stage — from production to shipping to delivery." },
    ],
  },
  {
    id: "payments",
    title: "Payments & Billing",
    icon: CreditCard,
    faqs: [
      { question: "What payment methods are accepted?", answer: "We support multiple payment options including bank transfers, credit/debit cards, and escrow payments for larger orders. Payment terms can be negotiated directly with vendors." },
      { question: "Is my payment secure?", answer: "Yes, all transactions are secured with bank-grade encryption. For added protection, we offer escrow services where payment is released to the vendor only after you confirm receipt of goods." },
      { question: "Can I get a refund if there's an issue with my order?", answer: "Our buyer protection policy covers quality issues and non-delivery. Contact support within 7 days of delivery with photos/documentation of any issues to initiate a refund or replacement request." },
    ],
  },
  {
    id: "account",
    title: "Account Management",
    icon: User,
    faqs: [
      { question: "How do I update my business profile?", answer: "Go to Profile from the sidebar, then click 'Edit Profile'. You can update your company information, contact details, shipping addresses, and notification preferences." },
      { question: "Can I have multiple team members on one account?", answer: "Yes, business accounts can add team members with different permission levels. Go to Settings > Team Management to invite colleagues and assign roles." },
      { question: "How do I change my notification settings?", answer: "Navigate to Profile > Notifications. You can customise which updates you receive via email, SMS, or push notifications — including quote alerts, order updates, and promotional offers." },
    ],
  },
];

const quickGuides = [
  { title: "How to Complete Verification", icon: FileText },
  { title: "Request a Callback",            icon: Phone },
  { title: "Audio, PDF & Image Support",    icon: MessageCircle },
  { title: "Payment & Subscription Guide",  icon: CreditCard },
];

// ─────────────────────────────────────────────────────────────
// CHAT MODAL  (ported from ChatModal.jsx)
// ─────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  sender: "support" | "user";
  text: string;
  timestamp: Date;
  senderName?: string;
  senderRole?: string;
  fileType?: string;
  fileName?: string;
}

function ChatModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: "support",
      text: "Hi! We will assist you in connecting with a customer manager. Please let us know the details of your inquiry. Please wait a moment as it may take some time for the manager to respond.",
      timestamp: new Date(),
      senderName: "Abdul",
      senderRole: "Cosora support executive",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const audioRef  = useRef<HTMLInputElement>(null);
  const pdfRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim()) return;
    const next: ChatMessage = { id: messages.length + 1, sender: "user", text: message, timestamp: new Date() };
    setMessages(p => [...p, next]);
    setMessage("");
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessages(p => [...p, { id: p.length + 1, sender: "user", text: `Sent a ${type}: ${file.name}`, timestamp: new Date(), fileType: type, fileName: file.name }]);
  };

  const fmt = (d: Date) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl flex flex-col h-[90vh] sm:h-[600px]">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={onClose}><ChevronRight className="w-6 h-6 text-gray-700 rotate-180" /></button>
              <div>
                <p className="text-sm font-semibold text-gray-900">Abdul</p>
                <p className="text-xs text-gray-500">Cosora support executive</p>
              </div>
            </div>
            <button onClick={onClose} className="text-sm font-medium text-red-600 hover:text-red-700">
              End chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-4 py-3 ${
                msg.sender === "user"
                  ? "bg-blue-600 text-white rounded-l-2xl rounded-tr-2xl"
                  : "bg-white border border-gray-200 rounded-r-2xl rounded-tl-2xl"
              }`}>
                {msg.sender === "support" && (
                  <div className="mb-1">
                    <p className="text-xs font-semibold text-gray-900">{msg.senderName}</p>
                    <p className="text-xs text-gray-500">{msg.senderRole}</p>
                  </div>
                )}
                <p className={`text-sm ${msg.sender === "user" ? "text-white" : "text-gray-900"}`}>{msg.text}</p>
                <p className={`text-xs mt-1 ${msg.sender === "user" ? "text-blue-100" : "text-gray-400"}`}>{fmt(msg.timestamp)}</p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-r-2xl rounded-tl-2xl px-4 py-3">
                <div className="flex gap-1">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Support banner */}
        <div className="bg-amber-50 border-t border-amber-100 px-4 py-2 shrink-0">
          <p className="text-xs text-amber-800 text-center">Support executive Abdul will be assisting you now</p>
        </div>

        {/* Input area */}
        <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
          {/* Attachment options */}
          {showAttachMenu && (
            <div className="mb-3 flex gap-4 pb-3 border-b border-gray-100">
              {[
                { label: "Camera",  ref: cameraRef, type: "photo",  accept: "image/*",        capture: "environment" as const },
                { label: "Gallery", ref: galleryRef, type: "image",  accept: "image/*",        capture: undefined },
                { label: "Audio",   ref: audioRef,  type: "audio",  accept: "audio/*",        capture: undefined },
                { label: "PDF",     ref: pdfRef,    type: "PDF",    accept: "application/pdf",capture: undefined },
              ].map(item => (
                <button key={item.label} onClick={() => { item.ref.current?.click(); setShowAttachMenu(false); }}
                  className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center hover:bg-pink-200 transition-colors">
                    {item.label === "Camera"  && <Camera className="w-5 h-5 text-pink-600" />}
                    {item.label === "Gallery" && <ImageIcon className="w-5 h-5 text-pink-600" />}
                    {item.label === "Audio"   && <Music className="w-5 h-5 text-pink-600" />}
                    {item.label === "PDF"     && <FilePdf className="w-5 h-5 text-pink-600" />}
                  </div>
                  <span className="text-xs text-gray-600">{item.label}</span>
                  <input ref={item.ref} type="file" className="hidden" accept={item.accept}
                    {...(item.capture ? { capture: item.capture } : {})}
                    onChange={e => handleFile(e, item.type)} />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setShowAttachMenu(p => !p)}
              className={`p-2 transition-colors ${showAttachMenu ? "text-pink-600 bg-pink-50 rounded-full" : "text-gray-500 hover:text-gray-700"}`}>
              <Paperclip className="w-5 h-5" />
            </button>
            <input type="text" value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type your message here..."
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={sendMessage} disabled={!message.trim()}
              className="bg-[#FF4081] text-white p-3 rounded-full hover:bg-pink-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

const Help = () => {
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen]       = useState(false);
  const [faqOpen, setFaqOpen]         = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = faqCategories.map(cat => ({
    ...cat,
    faqs: cat.faqs.filter(
      f => f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
           f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.faqs.length > 0);

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ fontFamily: "'Open Sans', Roboto, system-ui, sans-serif" }}
    >
      {/* ── Back header (no home tab strip in the profile section) ── */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-1 p-1">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Help &amp; Support</h1>
        </div>
      </div>

      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-28">

          {/* ── Welcome ── */}
          <motion.div variants={section}>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Welcome to Cosora's Customer Service
            </h2>
            <p className="text-sm text-gray-500">What can we help you with?</p>
          </motion.div>

          {/* ── Contact Us ── */}
          <motion.div variants={section}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Contact Us</h3>
            <p className="text-xs text-gray-500 mb-4">
              10:00 - 7:00 PM IST (Closed on weekends and holidays)
            </p>
            <motion.div variants={listContainer} className="grid grid-cols-2 gap-3">
              <motion.button
                variants={listItem}
                whileTap={TAP}
                transition={TAP_T}
                onClick={() => setChatOpen(true)}
                className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mb-2">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Contact Us</span>
                <span className="text-xs text-gray-500">Chat with us</span>
              </motion.button>

              <motion.button
                variants={listItem}
                whileTap={TAP}
                transition={TAP_T}
                onClick={() => { window.location.href = "tel:+919147700465"; }}
                className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-2 border border-gray-300">
                  <Phone className="w-6 h-6 text-gray-900" />
                </div>
                <span className="text-sm font-semibold text-gray-900">Request a Callback</span>
                <span className="text-xs text-gray-500">a Callback</span>
              </motion.button>
            </motion.div>
          </motion.div>

          {/* ── Follow Us ── */}
          <motion.div variants={section}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Follow Us</h3>
            <p className="text-xs text-gray-500 mb-4">
              Get connected for our latest news & updates!
            </p>
            <a
              href="https://instagram.com/cosora"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 bg-black rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
            >
              <Instagram className="w-5 h-5 text-white" />
            </a>
          </motion.div>

          {/* ── Email ── */}
          <motion.div variants={section} className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 shrink-0" />
            <span className="font-medium">Email -</span>
            <a href="mailto:hello@cosora.in" className="text-blue-600 hover:underline">
              hello@cosora.in
            </a>
          </motion.div>

          {/* ── Delete Account ── */}
          <motion.div variants={section} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-2">Do you want to delete your account?</p>
            <motion.button
              whileTap={TAP}
              transition={TAP_T}
              onClick={() => toast.error("Delete account request submitted")}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Delete my account
            </motion.button>
          </motion.div>

          {/* ── FAQ — single collapsible dropdown ── */}
          <motion.div variants={section}>
            <Card className="border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setFaqOpen(p => !p)}
                className="w-full flex items-center justify-between px-6 py-5 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <HelpCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Frequently Asked Questions
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {faqOpen
                        ? "Click to collapse"
                        : `${faqCategories.reduce((a, c) => a + c.faqs.length, 0)} questions across ${faqCategories.length} topics`}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${faqOpen ? "rotate-90" : ""}`}
                />
              </button>

              {faqOpen && (
                <div className="border-t border-border">
                  {/* Search */}
                  <div className="px-6 py-4 border-b border-border/50 bg-muted/20">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search FAQs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm bg-background border-border"
                      />
                    </div>
                  </div>

                  {(searchQuery ? filteredCategories : faqCategories).length === 0 ? (
                    <div className="py-10 text-center">
                      <HelpCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No results for "{searchQuery}"</p>
                      <button onClick={() => setSearchQuery("")} className="text-sm text-primary hover:underline mt-1">
                        Clear search
                      </button>
                    </div>
                  ) : (
                    (searchQuery ? filteredCategories : faqCategories).map((cat, catIdx) => (
                      <div key={cat.id} className={catIdx > 0 ? "border-t border-border/50" : ""}>
                        {/* Category label */}
                        <div className="flex items-center gap-2.5 px-6 py-3 bg-muted/10">
                          <div className="p-1.5 rounded-lg bg-primary/10">
                            <cat.icon className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {cat.title}
                          </span>
                        </div>
                        {/* Q&As */}
                        <Accordion type="single" collapsible className="w-full">
                          {cat.faqs.map((faq, i) => (
                            <AccordionItem
                              key={i}
                              value={`${cat.id}-${i}`}
                              className="border-0 border-b border-border/40 last:border-b-0 px-6"
                            >
                              <AccordionTrigger className="text-left text-sm font-medium hover:no-underline hover:text-primary py-4 gap-3">
                                {faq.question}
                              </AccordionTrigger>
                              <AccordionContent className="text-sm text-muted-foreground pb-4 leading-relaxed">
                                {faq.answer}
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── Quick Guides ── */}
          <motion.div variants={section}>
            <h2 className="text-xl font-semibold text-foreground mb-4">Quick Guides</h2>
            <motion.div variants={listContainer} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickGuides.map(guide => (
                <motion.div
                  key={guide.title}
                  variants={listItem}
                >
                <Card
                  className="border-border hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gray-100 group-hover:bg-primary/10 transition-colors">
                      <guide.icon className="w-4 h-4 text-gray-500 group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1">{guide.title}</span>
                    <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardContent>
                </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* ── Still Need Help ── */}
          <motion.div variants={section}>
            <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border-primary/20">
              <CardContent className="py-8 text-center">
                <h3 className="text-xl font-semibold text-foreground mb-2">Still need help?</h3>
                <p className="text-muted-foreground mb-4 max-w-md mx-auto text-sm">
                  Our dedicated support team is here to assist you with any questions or concerns.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Button className="bg-primary hover:bg-primary/90" onClick={() => setChatOpen(true)}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Start Live Chat
                  </Button>
                  <Button variant="outline" className="border-border" onClick={() => { window.location.href = "mailto:hello@cosora.in"; }}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Support
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

      </motion.div>

      <MobileBottomNav />

      {/* ── Chat Modal ── */}
      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
};

export default Help;