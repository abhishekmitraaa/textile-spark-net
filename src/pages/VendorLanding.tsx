import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Play,
  Check,
  Clock,
  Users,
  Percent,
  Shield,
  Globe,
  Star,
  Instagram,
  Mail,
  ChevronRight,
} from "lucide-react";

const fadeIn = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const documents = ["PAN Card", "Aadhaar Card", "Business Address", "One Product Photo"];

const valueProps = [
  { icon: Users, title: "Attract New Customers", desc: "Get discovered by thousands of verified buyers actively looking for suppliers like you." },
  { icon: Percent, title: "0% Commission Fee", desc: "Keep 100% of your earnings. No hidden charges, no commission cuts on your sales." },
  { icon: Shield, title: "Trusted by Brands", desc: "Join a network trusted by leading fashion brands across India and globally." },
];

const brandNames = ["Raymond", "Arvind Mills", "Vardhman", "Welspun", "Bombay Dyeing"];

const plans = [
  { name: "Basic", price: "₹999", period: "/month", features: ["50 Product Listings", "Basic Analytics", "Email Support"] },
  { name: "Silver", price: "₹1,999", period: "/month", features: ["200 Product Listings", "Advanced Analytics", "Priority Support", "Featured Listings"], popular: true },
  { name: "Gold", price: "₹4,999", period: "/month", features: ["Unlimited Listings", "Full Analytics Suite", "Dedicated Account Manager", "Top Placement", "Custom Branding"] },
];

const testimonials = [
  { name: "Rajesh Kumar", business: "Kumar Textiles, Surat", quote: "Cosora helped us reach buyers we never could before. Our orders doubled in 3 months.", rating: 5 },
  { name: "Priya Sharma", business: "Sharma Fabrics, Jaipur", quote: "The 0% commission model is a game-changer. We save lakhs every quarter compared to other platforms.", rating: 5 },
  { name: "Amit Patel", business: "Patel Garments, Ahmedabad", quote: "From listing to getting our first lead took just 2 days. The platform is incredibly easy to use.", rating: 5 },
];

const faqs = [
  { q: "How long does onboarding take?", a: "The entire onboarding process takes about 10 minutes. You'll need your PAN card, Aadhaar card, business address, and at least one product photo." },
  { q: "Is there any joining fee?", a: "Registration is completely FREE. You can start listing your products immediately after verification." },
  { q: "How do I get leads?", a: "Once your profile is live, buyers can discover your products through search, browse, and our smart matching system. You'll receive lead notifications directly." },
  { q: "Can I sell internationally?", a: "Yes! Cosora connects you with buyers from 150+ countries. Our platform supports international shipping and payment processing." },
];

const VendorLanding = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 max-w-6xl mx-auto">
          <Link to="/">
            <span className="font-logo text-accent text-2xl font-bold italic uppercase tracking-[-0.08em]">Cosora</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="#" className="text-sm text-muted-foreground hidden sm:inline">
              View Existing Applications
            </Link>
            <Link to="/onboarding">
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4">
        {/* Hero Section */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="py-10 text-center"
        >
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-6">
            Sell online to Global customers at{" "}
            <span className="text-accent">0% Commission</span>
          </h1>

          {/* Onboarding Video */}
          <div className="rounded-xl aspect-video w-full mb-6 relative overflow-hidden">
            <iframe
              className="w-full h-full rounded-xl"
              src="https://www.youtube.com/embed/quogY2hgYFY"
              title="Cosora Onboarding Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          {/* Document Checklist */}
          <div className="grid grid-cols-2 gap-2 mb-4 max-w-sm mx-auto">
            {documents.map((doc) => (
              <div key={doc} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                {doc}
              </div>
            ))}
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent rounded-full px-3 py-1 text-sm mb-6">
            <Clock className="h-4 w-4" />
            Complete in 10 minutes
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Link to="/onboarding" className="block">
              <Button className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 text-base font-semibold gap-2">
                Get Started <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="#" className="text-sm text-muted-foreground underline inline-block">
              View Existing Applications
            </Link>
          </div>
        </motion.section>

        {/* Market Positioning */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pb-10"
        >
          <div className="rounded-xl bg-foreground text-background p-8 text-center">
            <h2 className="font-display text-2xl font-bold italic mb-3">
              Fashion Wholesale No.1: Market
            </h2>
            <p className="text-background/60 text-sm mb-5">
              Join India's largest B2B fashion marketplace
            </p>
            <Link to="/browse">
              <Button
                variant="outline"
                className="border-background/30 text-background hover:bg-background/10 hover:text-background"
              >
                Explore as Guest
              </Button>
            </Link>
          </div>
        </motion.section>

        {/* Why Partner Section */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pb-10"
        >
          <h2 className="font-display text-2xl font-bold text-foreground text-center mb-6">
            Why Partner with Cosora?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {valueProps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          {/* Brand logos scroll */}
          <div className="flex gap-3 overflow-x-auto pb-2 justify-center flex-wrap">
            {brandNames.map((brand) => (
              <span key={brand} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground whitespace-nowrap">
                {brand}
              </span>
            ))}
          </div>

          <div className="text-center mt-6">
            <Link to="/onboarding">
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                Get Started <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.section>

        {/* Pricing Section */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pb-10"
        >
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 px-3 py-1 text-sm font-medium mb-3">
              Limited-Time Offer
            </span>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Daily ads from Rs 25
            </h2>
            <p className="text-lg font-bold text-accent mt-1">Registration Fee: FREE</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-5 text-center relative ${
                  plan.popular
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent text-accent-foreground px-3 py-0.5 text-xs font-semibold">
                    Popular
                  </span>
                )}
                <h3 className="font-semibold text-foreground text-lg mb-1">{plan.name}</h3>
                <p className="text-2xl font-bold text-foreground">
                  {plan.price}
                  <span className="text-sm font-normal text-muted-foreground">{plan.period}</span>
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground text-left">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/onboarding">
                  <Button
                    className={`w-full mt-4 ${
                      plan.popular
                        ? "bg-accent text-accent-foreground hover:bg-accent/90"
                        : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    Choose {plan.name}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Seller Success Stories */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pb-10"
        >
          <h2 className="font-display text-2xl font-bold text-foreground text-center mb-6">
            Seller Success Stories
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-xl border border-border bg-card p-5">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-sm text-foreground mb-3 leading-relaxed">"{t.quote}"</p>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.business}</p>
              </div>
            ))}
          </div>

          {/* FAQ */}
          <h3 className="font-display text-xl font-bold text-foreground text-center mb-4">
            Frequently Asked Questions
          </h3>
          <Accordion type="single" collapsible className="max-w-2xl mx-auto">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-foreground">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.section>

        {/* Reach Section */}
        <motion.section
          variants={fadeIn}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="pb-10 text-center"
        >
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">
            Expand Your Reach
          </h2>
          <p className="text-4xl font-bold text-accent mb-4">150+ countries</p>
          <div className="rounded-xl bg-muted h-40 flex items-center justify-center mb-6">
            <Globe className="h-16 w-16 text-muted-foreground/40" />
          </div>
          <Link to="/onboarding">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 h-12 px-8 text-base gap-2">
              Get Started <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-6 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <a href="mailto:hello@cosora.in" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Mail className="h-4 w-4" /> hello@cosora.in
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Instagram className="h-4 w-4" /> Instagram
            </a>
          </div>
          <p>© 2024 Cosora</p>
        </div>
      </footer>
    </div>
  );
};

export default VendorLanding;
