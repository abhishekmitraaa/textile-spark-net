import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Search, ArrowRight, BookOpen } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { vendorBlogCategories, vendorBlogs } from "@/data/vendorBlogs";
import { useVendorBlogFeed } from "@/hooks/useVendorData";

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

const VendorBlogs = () => {
  const reduced = useReducedMotion();
  const [activeCategory, setActiveCategory] = useState<(typeof vendorBlogCategories)[number]>("All Categories");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: blogFeed } = useVendorBlogFeed();
  const blogs = blogFeed ?? vendorBlogs;

  const filteredBlogs = useMemo(() => {
    return blogs.filter((blog) => {
      const matchesCategory = activeCategory === "All Categories" || blog.category === activeCategory;
      const haystack = `${blog.title} ${blog.excerpt} ${blog.tags.join(" ")}`.toLowerCase();
      const matchesSearch = haystack.includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, blogs, searchQuery]);

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-6 pb-8">
        <motion.div variants={section} className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            Vendor stories, product marketing, and growth tips
          </div>
          <h1 className="text-2xl font-semibold text-foreground lg:text-3xl">Blogs</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Read Cosora company updates and practical community advice for vendors looking to grow their textile and fashion business.
          </p>
        </motion.div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles, categories, or keywords"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {vendorBlogCategories.map((category) => (
              <motion.div key={category} whileTap={TAP} transition={TAP_T}>
                <Button
                  type="button"
                  variant={activeCategory === category ? "default" : "outline"}
                  size="sm"
                  className={activeCategory === category ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </Button>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div variants={listContainer} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredBlogs.map((blog) => (
            <motion.article
              key={blog.id}
              variants={listItem}
            >
              <Card className="group h-full overflow-hidden border-border/70 transition-shadow hover:shadow-lg">
                <div className="aspect-[16/10] overflow-hidden bg-muted">
                  <img src={blog.image} alt={blog.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                      {blog.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{blog.date}</span>
                    <span className="text-xs text-muted-foreground">{blog.readTime}</span>
                  </div>
                  <div className="space-y-1">
                    <h2 className="line-clamp-2 text-base font-semibold text-foreground">{blog.title}</h2>
                    <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{blog.excerpt}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {blog.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">By {blog.author}</span>
                    <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-accent hover:bg-accent/10">
                      <Link to={`/seller/blogs/${blog.id}`}>
                        Read more
                        <motion.span whileHover={{ x: 3 }} transition={{ ease: E, duration: 0.2 }} className="inline-flex"><ArrowRight className="h-3.5 w-3.5" /></motion.span>
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.article>
          ))}
        </motion.div>

        {filteredBlogs.length === 0 && (
          <motion.div variants={section}>
            <Card className="border-border/70">
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No blog articles matched your search.</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

export default VendorBlogs;
