import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, QrCode, Share2, Link2, Download, MessageSquare } from "lucide-react";

const mockReviews = [
  { id: "1", company: "StyleMart Retailers", reviewer: "Rajesh Kumar", rating: 5, time: "2 days ago", text: "Excellent quality fabric and very professional communication. Delivery was on time and packaging was great. Will definitely order again!", project: "Bulk T-shirt Order", helpful: 12, replied: false },
  { id: "2", company: "Fashion Forward Exports", reviewer: "Priya Sharma", rating: 4, time: "1 week ago", text: "Good quality products but slight delay in delivery. Overall satisfied with the purchase and vendor communication.", project: "Summer Collection", helpful: 8, replied: true, replyText: "Thank you for your feedback! We apologize for the delay and are working to improve our delivery timelines." },
  { id: "3", company: "TrendyWear Wholesale", reviewer: "Amit Patel", rating: 5, time: "2 weeks ago", text: "Best fabric supplier in Surat! Consistently high quality, competitive pricing, and great customer service.", project: "Denim Collection", helpful: 24, replied: false },
];

const ratingBreakdown = [[5, 65], [4, 20], [3, 10], [2, 3], [1, 2]];

const getRatingLabel = (r: number) => {
  if (r < 3) return { label: "POOR", cls: "bg-red-500/10 text-red-600 border-red-500/20" };
  if (r < 4) return { label: "DECENT", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  if (r < 5) return { label: "GOOD", cls: "bg-green-500/10 text-green-600 border-green-500/20" };
  return { label: "PERFECT", cls: "bg-accent/10 text-accent border-accent/20" };
};

type ReviewItem = {
  id: string;
  company: string;
  reviewer: string;
  rating: number;
  time: string;
  text: string;
  project: string;
  helpful: number;
  replied: boolean;
  replyText?: string;
};

const Reviews = () => {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [reviews, setReviews] = useState<ReviewItem[]>(mockReviews);

  const rating = 4.2;
  const ratingLabel = getRatingLabel(rating);

  const handleCopyReviewLink = async () => {
    await navigator.clipboard.writeText(window.location.origin + "/reviews");
    toast.success("Review link copied!");
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rate My Business - Cosora", url: window.location.origin + "/reviews" });
      } else {
        await handleCopyReviewLink();
      }
    } catch {
      await handleCopyReviewLink();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-xl font-semibold font-display text-foreground lg:text-2xl">Reviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Build trust with buyers through authentic reviews</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start gap-6">
                <div className="text-center flex-shrink-0">
                  <p className="text-5xl font-bold font-display text-foreground leading-none">4.2</p>
                  <div className="flex justify-center gap-0.5 my-2">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">24 reviews</p>
                </div>
                <div className="flex-1">
                  {ratingBreakdown.map(([stars, pct], index) => (
                    <div className="flex items-center gap-2 mb-1.5" key={index}>
                      <span className="text-xs text-muted-foreground w-5 text-right">{stars}★</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div className="bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-7">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <Badge variant="outline" className={`${ratingLabel.cls} font-bold text-sm px-3 py-1`}>
                  {ratingLabel.label}
                </Badge>
                <Button variant="outline" className="h-9 gap-2 text-sm" onClick={() => setQrOpen(true)}>
                  <QrCode className="h-4 w-4" />
                  Share QR Code
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="rounded-xl border-2 border-dashed border-accent/30 bg-accent/5 p-4 flex items-center gap-4">
            <div className="w-16 h-16 bg-white rounded-xl border border-border flex items-center justify-center flex-shrink-0">
              <QrCode className="h-8 w-8 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Rate My Business</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">Share this QR code with buyers to collect reviews offline</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => toast.success("Link copied!")}>
                <Link2 className="h-3 w-3" />
                Copy
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleShare}>
                <Share2 className="h-3 w-3" />
                Share
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-base font-semibold font-display text-foreground mb-3">Customer Reviews ({reviews.length})</p>
          <div className="space-y-3">
            {reviews.map((review, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + index * 0.05 }}
                key={review.id}
              >
                <Card className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
                          {review.reviewer
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-tight">{review.company}</p>
                          <p className="text-xs text-muted-foreground">{review.reviewer}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${i < review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{review.time}</span>
                      </div>
                    </div>

                    <Badge variant="secondary" className="text-[10px] mt-2 w-fit">
                      {review.project}
                    </Badge>

                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{review.text}</p>

                    {review.replied && review.replyText ? (
                      <div className="mt-3 bg-muted/40 rounded-lg p-3 border-l-2 border-accent/40">
                        <p className="text-xs font-semibold text-accent mb-1">Your Reply</p>
                        <p className="text-sm text-muted-foreground">{review.replyText}</p>
                      </div>
                    ) : null}

                    <div className="flex gap-2 mt-3 items-center flex-wrap">
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground">
                        👍 Helpful ({review.helpful})
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground">
                        Report
                      </Button>
                      {!review.replied ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs ml-auto border-accent/40 text-accent hover:bg-accent/10"
                          onClick={() => setReplyingTo(replyingTo === review.id ? null : review.id)}
                        >
                          {replyingTo === review.id ? "Cancel" : "Reply"}
                        </Button>
                      ) : null}
                    </div>

                    <AnimatePresence>
                      {replyingTo === review.id ? (
                        <motion.div
                          key="reply"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-2">
                            <Textarea
                              placeholder="Write a professional reply to this review..."
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              rows={3}
                              className="text-sm resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
                                disabled={!replyText.trim()}
                                onClick={() => {
                                  toast.success("Reply posted successfully!");
                                  setReviews(
                                    reviews.map((r) =>
                                      r.id === review.id ? { ...r, replied: true, replyText } : r,
                                    ),
                                  );
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                              >
                                Post Reply
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Your Review QR Code</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-3">
              <div className="w-48 h-48 bg-muted rounded-2xl border-2 border-border flex items-center justify-center">
                <QrCode className="h-20 w-20 text-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Kumar Textiles Pvt Ltd</p>
                <p className="text-sm text-muted-foreground">Surat, Gujarat</p>
              </div>
            </div>
            <div className="grid gap-2 mt-1">
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => toast.success("Review link copied!")}>
                <Link2 className="h-4 w-4" />
                Copy Review Link
              </Button>
              <Button variant="outline" className="w-full h-10 gap-2">
                <Download className="h-4 w-4" />
                Download QR Code
              </Button>
              <Button className="w-full h-10 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                <Share2 className="h-4 w-4" />
                Share QR Code
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Reviews;