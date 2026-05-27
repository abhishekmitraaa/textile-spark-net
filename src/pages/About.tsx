import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Instagram, Facebook, Twitter, Linkedin } from "lucide-react";

const About = () => {
  const fadeUp = (delay: number) => ({ initial: { opacity:0, y:16 }, animate: { opacity:1, y:0 }, transition: { delay } });
  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-lg mx-auto pb-8">
        <motion.div {...fadeUp(0)}>
          <div className="rounded-xl bg-foreground text-center p-8 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full border border-background/5"/>
            <div className="absolute -left-4 bottom-0 w-20 h-20 rounded-full border border-background/5"/>
            <span className="font-logo text-4xl font-bold italic uppercase tracking-[-0.08em] text-accent block relative z-10">Cosora</span>
            <p className="text-background/70 mt-2 text-base relative z-10">Making the customer's business easy and enjoyable</p>
          </div>
        </motion.div>
        <motion.div {...fadeUp(0.1)}>
          <Card><CardContent className="p-6 space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>Cosora is India's fastest-growing B2B fashion and textile sourcing marketplace, built to connect manufacturers, suppliers, and buyers across the globe.</p>
            <p>We believe sourcing should be simple, transparent, and efficient. Whether you're a small boutique or a large retail chain, Cosora gives you the tools to find the right partners, compare quotes, and grow your business.</p>
            <p>Founded in 2024, we're on a mission to digitise India's $120B fashion supply chain and put it at your fingertips.</p>
          </CardContent></Card>
        </motion.div>
        <motion.div {...fadeUp(0.15)} className="grid grid-cols-3 gap-3">
          {[ ["10K+","Customers"],["5K+","Suppliers"],["2400+","Shoots Done"] ].map(([val, label]) => (
            <Card key={label}><CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-accent">{val}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent></Card>
          ))}
        </motion.div>
        <motion.div {...fadeUp(0.2)}>
          <Card><CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Follow Us</p>
            <div className="flex gap-3 justify-center">
              {[Instagram, Facebook, Twitter, Linkedin].map((Icon, i) => (
                <Button key={i} variant="outline" size="icon" className="rounded-full w-10 h-10 hover:bg-accent/10 hover:text-accent hover:border-accent/40">
                  <Icon className="h-4 w-4"/>
                </Button>
              ))}
            </div>
          </CardContent></Card>
        </motion.div>
        <motion.div {...fadeUp(0.25)}>
          <Card><CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">From the Blog</p>
            <div className="space-y-3">
              {[
                { tag:"Industry", title:"How Indian Manufacturers Are Going Global in 2025", time:"5 min read · Jan 2025" },
                { tag:"Tips", title:"10 Tips for Getting More Leads on Cosora", time:"3 min read · Dec 2024" },
              ].map(b => (
                <div key={b.title} className="flex gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
                  <div className="w-14 h-14 rounded-lg bg-muted flex-shrink-0"/>
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{b.tag}</span>
                    <p className="text-sm font-medium mt-0.5 leading-snug">{b.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.time}</p>
                  </div>
                </div>
              ))}
              <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-accent hover:bg-accent/10">
                <Link to="/seller/blogs">View all blogs</Link>
              </Button>
            </div>
          </CardContent></Card>
        </motion.div>
        <motion.div {...fadeUp(0.3)} className="text-center py-2 space-y-1">
          <p className="text-sm text-accent">hello@cosora.in</p>
          <p className="text-xs text-muted-foreground">© 2025 Cosora Technologies Pvt Ltd</p>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};
export default About;