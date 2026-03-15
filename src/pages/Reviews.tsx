import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Star,
  QrCode,
  Link2,
  Download,
  Share2,
  MessageSquare,
  ThumbsUp,
  Flag,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const fadeIn = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay, ease: "easeOut" as const },
});

const overallRating = 4.2;
const totalReviews = 24;

const starBreakdown = [
  { stars: 5, percent: 52 },
  { stars: 4, percent: 28 },
  { stars: 3, percent: 12 },
  { stars: 2, percent: 5 },
  { stars: 1, percent: 3 },
];

const getRatingLabel = (rating: number) => {
  if (rating >= 5) return { text: "PERFECT", cls: "bg-accent/10 text-accent border-accent/20" };
  if (rating >= 4) return { text: "GOOD", cls: "bg-green-500/10 text-green-600 border-green-500/20" };
  if (rating >= 3) return { text: "DECENT", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" };
  return { text: "POOR", cls: "bg-destructive/10 text-destructive border-destructive/20" };
};

const reviews = [
  {
    id: 1,
    name: "Amit Patel",
    company: "Patel Garments",
    initials: "AP",
    rating: 5,
    time: "2 days ago",
    text: "Excellent quality fabrics! The cotton collection is top-notch and delivery was on time. Will definitely order again.",
    helpful: 8,
    replied: true,
    reply: "Thank you Amit! We're glad you loved our cotton collection. Looking forward to serving you again!",
  },
  {
    id: 2,
    name: "Sunita Sharma",
    company: "Sharma Exports",
    initials: "SS",
    rating: 4,
    time: "1 week ago",
    text: "Good variety and competitive pricing. The silk range could use more color options though.",
    helpful: 3,
    replied: false,
    reply: "",
  },
  {
    id: 3,
    name: "Rajiv Kumar",
    company: "Kumar Textiles",
    initials: "RK",
    rating: 5,
    time: "2 weeks ago",
    text: "Best supplier in Surat for premium fabrics. Communication is very professional and responsive.",
    helpful: 12,
    replied: true,
    reply: "Thanks Rajiv! We pride ourselves on quality and communication. Happy to be your trusted supplier!",
  },
];

const Reviews = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const label = getRatingLabel(overallRating);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + "/reviews");
    toast({ title: "Link copied to clipboard" });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Rate My Business - Cosora", url: window.location.origin + "/reviews" });
      } catch { }
    } else {
      handleCopyLink();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 pb-24 lg:pb-8">
        {/* Header */}
        <motion.div {...fadeIn(0)}>
          <h1 className="font-display text-2xl font-bold text-foreground">Reviews</h1>
          <p className="text-muted-foreground text-sm">Get more reviews to build trust</p>
        </motion.div>

        {/* Rating Summary */}
        <motion.div {...fadeIn(0.05)} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-5xl font-bold text-foreground">{overallRating}</span>
            <div>
              <div className="flex gap-0.5 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${i < Math.floor(overallRating) ? "text-accent fill-accent" : "text-muted-foreground"}`}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">Reviewed by {totalReviews} users</p>
            </div>
          </div>

          <span className={`inline-block border rounded-full px-3 py-1 text-sm font-bold mb-4 ${label.cls}`}>
            {label.text}
          </span>

          <div className="space-y-2">
            {starBreakdown.map((row) => (
              <div key={row.stars} className="flex items-center gap-2">
                <span className="text-sm w-4 text-foreground">{row.stars}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{row.percent}%</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* QR Code Card */}
        <motion.div {...fadeIn(0.1)} className="rounded-xl border-2 border-dashed border-accent/30 bg-accent/5 p-4">
          <h3 className="font-semibold text-foreground">Rate My Business</h3>
          <p className="text-xs text-muted-foreground mb-3">Share this QR to collect reviews offline</p>

          <Dialog>
            <DialogTrigger asChild>
              <button className="w-32 h-32 bg-background rounded-xl border border-border mx-auto flex items-center justify-center cursor-pointer hover:border-accent/50 transition-colors">
                <QrCode className="w-16 h-16 text-foreground" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Your Review QR Code</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center py-4 space-y-4">
                <div className="w-48 h-48 bg-background rounded-xl border border-border flex items-center justify-center">
                  <QrCode className="w-16 h-16 text-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">Rajesh Textiles</p>
                  <p className="text-sm text-muted-foreground">Surat, Gujarat</p>
                </div>
                <div className="w-full space-y-2">
                  <Button variant="outline" className="w-full gap-2" onClick={handleCopyLink}>
                    <Link2 className="w-4 h-4" /> Copy Link
                  </Button>
                  <Button variant="outline" className="w-full gap-2">
                    <Download className="w-4 h-4" /> Download QR
                  </Button>
                  <Button className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleShare}>
                    <Share2 className="w-4 h-4" /> Share QR Code
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleCopyLink}>
              <Link2 className="w-3 h-3" /> Copy Link
            </Button>
            <Button variant="outline" size="sm" className="text-xs gap-1">
              <Download className="w-3 h-3" /> Download
            </Button>
            <Button size="sm" className="text-xs gap-1 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleShare}>
              <Share2 className="w-3 h-3" /> Share
            </Button>
          </div>
        </motion.div>

        {/* Respond to Reviews */}
        <motion.div {...fadeIn(0.15)}>
          <h2 className="font-display text-lg font-semibold text-foreground mb-3">Respond to Reviews</h2>

          {reviews.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
              <p className="font-medium text-foreground">No reviews yet</p>
              <p className="text-sm text-muted-foreground">Share your QR code to start collecting reviews</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review, idx) => (
                <motion.div
                  key={review.id}
                  {...fadeIn(0.2 + idx * 0.05)}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center text-sm font-bold shrink-0">
                      {review.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{review.name}</p>
                      <p className="text-xs text-muted-foreground">{review.company}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex gap-0.5 justify-end mb-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${i < review.rating ? "text-accent fill-accent" : "text-muted-foreground"}`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{review.time}</p>
                    </div>
                  </div>

                  {/* Review text */}
                  <p className="text-sm text-muted-foreground mt-2">{review.text}</p>

                  {/* Actions */}
                  <div className="flex items-center mt-3 gap-2">
                    <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 px-2">
                      <ThumbsUp className="w-3 h-3" /> Helpful {review.helpful}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 px-2">
                      <Flag className="w-3 h-3 mr-1" /> Report
                    </Button>
                    {!review.replied && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs ml-auto h-7 px-3"
                        onClick={() => setReplyingTo(replyingTo === review.id ? null : review.id)}
                      >
                        Reply
                      </Button>
                    )}
                  </div>

                  {/* Reply input */}
                  {replyingTo === review.id && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="text-sm"
                      />
                      <Button
                        size="sm"
                        className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
                        onClick={() => {
                          toast({ title: "Reply sent!" });
                          setReplyingTo(null);
                          setReplyText("");
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  )}

                  {/* Existing reply */}
                  {review.replied && review.reply && (
                    <div className="mt-3 ml-4 bg-muted/30 rounded-lg p-3">
                      <p className="text-xs font-medium text-foreground mb-1">Your Reply</p>
                      <p className="text-sm text-muted-foreground">{review.reply}</p>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Reviews;
