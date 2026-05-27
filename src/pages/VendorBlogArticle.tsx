import { Link, Navigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Link2, Share2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { vendorBlogs, getVendorBlogById } from "@/data/vendorBlogs";

const VendorBlogArticle = () => {
  const { blogId } = useParams();
  const blog = blogId ? getVendorBlogById(blogId) : undefined;

  if (!blog) {
    return <Navigate to="/seller/blogs" replace />;
  }

  const relatedBlogs = vendorBlogs.filter((item) => item.id !== blog.id).slice(0, 2);

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-8">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-2 px-2 text-muted-foreground hover:text-foreground">
          <Link to="/seller/blogs">
            <ArrowLeft className="h-4 w-4" />
            Back to Blogs
          </Link>
        </Button>

        <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <Card className="overflow-hidden border-border/70">
            <div className="aspect-[16/9] overflow-hidden bg-muted">
              <img src={blog.image} alt={blog.title} className="h-full w-full object-cover" />
            </div>
            <CardContent className="space-y-5 p-5 lg:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {blog.category}
                </Badge>
                <span className="text-xs text-muted-foreground">{blog.date}</span>
                <span className="text-xs text-muted-foreground">{blog.readTime}</span>
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-semibold text-foreground lg:text-4xl">{blog.title}</h1>
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground lg:text-base">{blog.excerpt}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {blog.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Author</p>
                  <p className="font-medium text-foreground">{blog.author}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Link2 className="h-4 w-4" />
                    Copy Link
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardContent className="space-y-4 p-5 lg:p-6">
              {blog.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground lg:text-base">
                  {paragraph}
                </p>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-foreground">More for you to read</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {relatedBlogs.map((item) => (
                <Card key={item.id} className="overflow-hidden border-border/70">
                  <div className="aspect-[16/9] overflow-hidden bg-muted">
                    <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                  </div>
                  <CardContent className="space-y-2 p-4">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                      {item.category}
                    </Badge>
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.excerpt}</p>
                    <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-accent hover:bg-accent/10">
                      <Link to={`/seller/blogs/${item.id}`}>Read article</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </motion.article>
      </div>
    </DashboardLayout>
  );
};

export default VendorBlogArticle;
