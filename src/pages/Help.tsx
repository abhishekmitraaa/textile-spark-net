import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Search, 
  MessageCircle, 
  Phone, 
  Mail, 
  FileText, 
  ShoppingBag,
  CreditCard,
  User,
  HelpCircle,
  ChevronRight,
  ExternalLink,
  Headphones
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

const faqCategories = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: HelpCircle,
    faqs: [
      {
        question: "How do I create my first RFQ (Request for Quote)?",
        answer: "Navigate to 'Post Requirement' from your dashboard or sidebar. You can choose Quick RFQ for simple requests or create a detailed requirement with specifications like category, quantity, fabric type, and more."
      },
      {
        question: "How do I find the right vendors for my needs?",
        answer: "Use our smart matching system by posting your requirements. We'll connect you with verified vendors who specialize in your product category. You can also browse vendor profiles and view their ratings and reviews."
      },
      {
        question: "What information should I include in my requirement?",
        answer: "Include product category, quantity, preferred fabric/material, size range, any specific designs or prints, target price range, and delivery timeline. The more details you provide, the better quotes you'll receive."
      }
    ]
  },
  {
    id: "orders-quotes",
    title: "Orders & Quotes",
    icon: ShoppingBag,
    faqs: [
      {
        question: "How do I compare quotes from different vendors?",
        answer: "Go to 'My Quotes' section where you can view all received quotes side by side. Our comparison tool highlights the best price and fastest delivery options to help you make informed decisions."
      },
      {
        question: "Can I negotiate prices with vendors?",
        answer: "Yes! You can use our integrated chat feature to communicate directly with vendors. Discuss pricing, minimum order quantities, customizations, and delivery terms before finalizing your order."
      },
      {
        question: "How do I track my order status?",
        answer: "Once you've placed an order, you can track it from your dashboard under 'Active Orders'. You'll receive notifications at each stage - from production to shipping to delivery."
      }
    ]
  },
  {
    id: "payments",
    title: "Payments & Billing",
    icon: CreditCard,
    faqs: [
      {
        question: "What payment methods are accepted?",
        answer: "We support multiple payment options including bank transfers, credit/debit cards, and escrow payments for larger orders. Payment terms can be negotiated directly with vendors."
      },
      {
        question: "Is my payment secure?",
        answer: "Yes, all transactions are secured with bank-grade encryption. For added protection, we offer escrow services where payment is released to the vendor only after you confirm receipt of goods."
      },
      {
        question: "Can I get a refund if there's an issue with my order?",
        answer: "Our buyer protection policy covers quality issues and non-delivery. Contact support within 7 days of delivery with photos/documentation of any issues to initiate a refund or replacement request."
      }
    ]
  },
  {
    id: "account",
    title: "Account Management",
    icon: User,
    faqs: [
      {
        question: "How do I update my business profile?",
        answer: "Go to Profile from the sidebar, then click 'Edit Profile'. You can update your company information, contact details, shipping addresses, and notification preferences."
      },
      {
        question: "Can I have multiple team members on one account?",
        answer: "Yes, business accounts can add team members with different permission levels. Go to Settings > Team Management to invite colleagues and assign roles."
      },
      {
        question: "How do I change my notification settings?",
        answer: "Navigate to Profile > Notifications. You can customize which updates you receive via email, SMS, or push notifications - including quote alerts, order updates, and promotional offers."
      }
    ]
  }
];

const contactOptions = [
  {
    icon: MessageCircle,
    title: "Live Chat",
    description: "Chat with our support team",
    action: "Start Chat",
    available: "Available 24/7",
    color: "bg-primary/10 text-primary"
  },
  {
    icon: Phone,
    title: "Phone Support",
    description: "+1 (800) 123-4567",
    action: "Call Now",
    available: "Mon-Fri, 9AM-6PM",
    color: "bg-accent/10 text-accent"
  },
  {
    icon: Mail,
    title: "Email Support",
    description: "support@textilemarket.com",
    action: "Send Email",
    available: "Response within 24hrs",
    color: "bg-secondary/50 text-foreground"
  }
];

const quickGuides = [
  { title: "How to Post Your First RFQ", icon: FileText },
  { title: "Understanding Vendor Ratings", icon: User },
  { title: "Negotiation Best Practices", icon: MessageCircle },
  { title: "Payment & Escrow Guide", icon: CreditCard }
];

const Help = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCategories = faqCategories.map(category => ({
    ...category,
    faqs: category.faqs.filter(
      faq =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.faqs.length > 0);

  const handleContactAction = (title: string) => {
    if (title === "Live Chat") {
      toast.success("Starting live chat...", {
        description: "A support agent will be with you shortly."
      });
    } else if (title === "Phone Support") {
      toast.info("Phone number copied!", {
        description: "+1 (800) 123-4567"
      });
    } else if (title === "Email Support") {
      toast.info("Email copied!", {
        description: "support@textilemarket.com"
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Headphones className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Help & Support
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Find answers to common questions or get in touch with our support team
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-2xl mx-auto"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search for help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 py-6 text-base bg-card border-border"
            />
          </div>
        </motion.div>

        {/* Contact Options */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {contactOptions.map((option, index) => (
            <Card 
              key={option.title}
              className="border-border hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => handleContactAction(option.title)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${option.color}`}>
                    <option.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{option.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs text-muted-foreground">{option.available}</span>
                      <Button variant="ghost" size="sm" className="text-primary h-auto p-0">
                        {option.action}
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Frequently Asked Questions
          </h2>
          
          {(searchQuery ? filteredCategories : faqCategories).length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center">
                <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
                <Button 
                  variant="link" 
                  onClick={() => setSearchQuery("")}
                  className="mt-2 text-primary"
                >
                  Clear search
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(searchQuery ? filteredCategories : faqCategories).map((category) => (
                <Card key={category.id} className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <category.icon className="w-4 h-4 text-primary" />
                      </div>
                      {category.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {category.faqs.map((faq, index) => (
                        <AccordionItem 
                          key={index} 
                          value={`${category.id}-${index}`}
                          className="border-border/50"
                        >
                          <AccordionTrigger className="text-left text-sm hover:no-underline hover:text-primary">
                            {faq.question}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </motion.div>

        {/* Quick Guides */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-xl font-display font-semibold text-foreground mb-4">
            Quick Guides
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickGuides.map((guide, index) => (
              <Card 
                key={guide.title}
                className="border-border hover:border-primary/30 hover:shadow-md transition-all cursor-pointer group"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/50 group-hover:bg-primary/10 transition-colors">
                    <guide.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-foreground flex-1">{guide.title}</span>
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* Still Need Help Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-accent/5 border-primary/20">
            <CardContent className="py-8 text-center">
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                Still need help?
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Our dedicated support team is here to assist you with any questions or concerns.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button className="bg-primary hover:bg-primary/90">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Start Live Chat
                </Button>
                <Button variant="outline" className="border-border">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Support
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Help;
