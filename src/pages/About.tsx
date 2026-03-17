import { motion } from "framer-motion";
import { Facebook, Linkedin, Twitter, ArrowRight } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" as const },
};

const stats = [
  { label: "Customers", value: "10K+" },
  { label: "Suppliers", value: "5K+" },
  { label: "Shoots Completed", value: "2400+" },
];

const socials = [
  { icon: Facebook, label: "Facebook" },
  { icon: Linkedin, label: "LinkedIn" },
  { icon: Twitter, label: "X / Twitter" },
];

const blogPosts = [
  { category: "Industry", title: "How Indian Fashion Manufacturing is Going Digital", date: "Mar 10, 2026" },
  { category: "Tips", title: "5 Ways to Improve Your B2B Product Listings", date: "Feb 28, 2026" },
];

const About = () => {
  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto pb-24 space-y-6">
        {/* Hero */}
        <motion.div {...fadeIn} className="rounded-xl bg-foreground text-background p-8 text-center">
          <h1 className="font-display text-4xl italic text-accent">Cosora</h1>
          <p className="text-background/80 text-lg mt-2">Making the customer's business easy and enjoyable</p>
        </motion.div>

        {/* Mission */}
        <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.05 }} className="p-4 text-sm text-muted-foreground leading-relaxed space-y-4">
          <p>
            Cosora is India's fastest-growing B2B fashion marketplace, built to bridge the gap between clothing manufacturers, fabric suppliers, and global fashion brands. We believe every business deserves access to a reliable, transparent supply chain.
          </p>
          <p>
            Our platform connects thousands of verified suppliers with buyers across the country, enabling seamless sourcing, real-time quotations, and professional product photography — all under one roof.
          </p>
          <p>
            From small-town manufacturers to large-scale exporters, Cosora empowers every player in the fashion ecosystem to grow, compete, and thrive in the digital economy.
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.1 }} className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Social Links */}
        <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.15 }} className="flex gap-3 justify-center">
          {socials.map((s) => (
            <button
              key={s.label}
              className="rounded-full border w-10 h-10 flex items-center justify-center hover:bg-accent/10 hover:text-accent transition-colors text-muted-foreground"
              aria-label={s.label}
            >
              <s.icon className="w-4 h-4" />
            </button>
          ))}
        </motion.div>

        {/* Blog Section */}
        <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.2 }}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">More for you to read</h2>
          <p className="text-sm text-muted-foreground mb-4">From the Blog</p>
          <div className="space-y-3">
            {blogPosts.map((post) => (
              <div key={post.title} className="rounded-xl border bg-card p-4">
                <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">{post.category}</span>
                <h3 className="font-semibold text-foreground text-sm mt-1">{post.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{post.date}</p>
                <button className="text-xs text-accent font-medium mt-2 flex items-center gap-1 hover:gap-2 transition-all">
                  Read More <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default About;
