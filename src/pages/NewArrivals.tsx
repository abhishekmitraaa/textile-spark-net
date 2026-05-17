import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import BuyerHomeTabs from "@/components/buyer/BuyerHomeTabs";
import BuyerProductCard, { type BuyerProductCardData } from "@/components/buyer/BuyerProductCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getNewArrivals } from "@/lib/api";
import { Clock, Grid3X3, LayoutGrid, List, Search, Sparkles } from "lucide-react";

const heroSlides = [
  {
    title: "New Everyday Fashion",
    subtitle: "Discover fresh product drops from verified manufacturers every day.",
    image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1200&h=700&fit=crop",
    accent: "from-rose-500 to-rose-600",
  },
  {
    title: "Styled for Scale",
    subtitle: "Fast-moving categories, lower MOQs, and better sourcing visibility.",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&h=700&fit=crop",
    accent: "from-slate-800 to-slate-950",
  },
  {
    title: "Trusted by Growing Brands",
    subtitle: "Find product lines that are ready for your next order cycle.",
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&h=700&fit=crop",
    accent: "from-zinc-900 to-black",
  },
];

const categories = [
  "Women's Apparel",
  "Men's Apparel",
  "Men's Jeans",
  "Men's Shirt",
  "Accessories",
  "Women's Trousers",
  "Women's T-shirts",
  "Women's Shoes",
];

// fetch products via react-query
  

const brandPicks = [
  { name: "Raymond", category: "Men's Wear", price: "₹899+", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=500&fit=crop" },
  { name: "Arvind", category: "Casuals", price: "₹699+", image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=400&h=500&fit=crop" },
  { name: "Welspun", category: "Home & Textiles", price: "₹299+", image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=500&fit=crop" },
];

// buildBatch will be based on fetched products below

const NewArrivals = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"2-col" | "3-col">("2-col");
  const [batchCount, setBatchCount] = useState(2);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoadingMore) {
          setIsLoadingMore(true);
          window.setTimeout(() => {
            setBatchCount((current) => current + 1);
            setIsLoadingMore(false);
          }, 250);
        }
      },
      { rootMargin: "240px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore]);

  const [baseProducts, setBaseProducts] = useState<BuyerProductCardData[]>([]);

  useEffect(() => {
    let mounted = true;
    getNewArrivals().then((items) => {
      if (mounted) setBaseProducts(items);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const buildBatch = (batchIndex: number) =>
    baseProducts.map((product) => ({
      ...product,
      id: `${product.id}-${batchIndex}`,
      vendorId: `${product.vendorId}-${batchIndex}`,
    }));

  const products = useMemo(
    () => Array.from({ length: batchCount }, (_, batchIndex) => buildBatch(batchIndex)).flat(),
    [batchCount, baseProducts]
  );


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <BuyerHomeTabs />

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
        >
          <div className={cn("grid gap-0 lg:grid-cols-[1.25fr_0.9fr]", `bg-gradient-to-br ${heroSlides[activeSlide].accent}`)}>
            <div className="relative min-h-[320px] overflow-hidden p-6 text-background sm:p-8 lg:p-10">
              <div className="absolute inset-0 opacity-30">
                <img src={heroSlides[activeSlide].image} alt={heroSlides[activeSlide].title} className="h-full w-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-black/35" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-background/80">
                  <Sparkles className="h-4 w-4" />
                  New Everyday Fashion
                </div>
                <div className="max-w-xl">
                  <Badge className="mb-4 bg-background/15 text-background hover:bg-background/15">
                    slide {activeSlide + 1} of {heroSlides.length}
                  </Badge>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                    {heroSlides[activeSlide].title}
                  </h1>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-background/80 sm:text-base">
                    {heroSlides[activeSlide].subtitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="bg-background text-foreground hover:bg-background/90">
                    <Link to="/search">
                      <Search className="mr-2 h-4 w-4" />
                      Search products
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="border-background/30 bg-transparent text-background hover:bg-background/10 hover:text-background">
                    <Link to="/requirement">Submit requirement</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 bg-card p-6 sm:p-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  What&apos;s on your mind?
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Link
                      key={category}
                      to={`/search/results?category=${encodeURIComponent(category)}`}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                    >
                      {category}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-accent" />
                  Looking for products?
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Post your requirement and get quotes from perfect manufacturers.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <Button asChild className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link to="/requirement/quick-rfq">Quick RFQ</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/requirement/post-requirement">Create New Requirement</Link>
                  </Button>
                  <Button asChild variant="ghost" className="w-full justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
                    <Link to="/requirement/my-quotes">My Previous Quotes</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-3">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                onClick={() => setActiveSlide(index)}
                className={cn(
                  "h-2.5 rounded-full transition-all",
                  index === activeSlide ? "w-8 bg-accent" : "w-2.5 bg-muted-foreground/30"
                )}
                aria-label={`Show slide ${index + 1}`}
              />
            ))}
          </div>
        </motion.section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Today&apos;s New In</h2>
              <p className="text-xs text-muted-foreground">New products added by sellers every day</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border p-1">
              <button
                type="button"
                onClick={() => setViewMode("2-col")}
                className={cn(
                  "rounded-lg p-2 transition-colors",
                  viewMode === "2-col" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                )}
                aria-label="Two column view"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("3-col")}
                className={cn(
                  "rounded-lg p-2 transition-colors",
                  viewMode === "3-col" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                )}
                aria-label="Three column view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={cn("grid gap-3 sm:gap-4", viewMode === "2-col" ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
            {products.map((product) => (
              <BuyerProductCard key={product.id} product={product} />
            ))}
          </div>

          <div ref={loadMoreRef} className="py-8 text-center text-sm text-muted-foreground">
            {isLoadingMore ? "Loading more products..." : "Scroll for more products"}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                <LayoutGrid className="h-3.5 w-3.5" />
                Post your requirement
              </div>
              <h3 className="mt-3 text-xl font-semibold text-foreground">Looking for products?</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Submit a requirement now and connect with verified manufacturers who can quote exactly what you need.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/requirement/quick-rfq">Quick RFQ</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/requirement/post-requirement">Create New Requirement</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/requirement/my-quotes">My Previous Quotes</Link>
              </Button>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Brand Picks</h2>
              <p className="text-xs text-muted-foreground">Sponsored and brand-specific product highlights</p>
            </div>
            <Link to="/search/results" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2">
            {brandPicks.map((brand) => (
              <Link
                key={brand.name}
                to="/search/results"
                className="min-w-[220px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="relative aspect-[3/4]">
                  <img src={brand.image} alt={brand.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-background">
                    <p className="text-xs uppercase tracking-[0.18em] text-background/70">Sponsored</p>
                    <h3 className="mt-1 text-lg font-semibold">{brand.name}</h3>
                    <p className="text-sm text-background/80">{brand.category}</p>
                    <p className="mt-2 text-sm font-semibold">{brand.price}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

export default NewArrivals;