import { useNavigate, Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Mail, Star, Globe, Share2, Package, Tag, Image, FileText, Building2, Users, Send, Calendar, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useProfileScore } from "@/lib/queries/vendorDashboard";

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

// Each tile deep-links to the exact control that fills it in. `?focus=` is read
// by BusinessProfile, which either scrolls to the section or opens the relevant
// modal; landing on /my-store (as these all used to) left the vendor to hunt for
// the field themselves.
const scoreItems = [
  { label: "Check your contact details", tag: "Missing", href: "/business-profile?focus=contact-details", Icon: ClipboardList },
  { label: "Add about us", tag: "Missing", href: "/business-profile?focus=about-us", Icon: Building2 },
  { label: "Complete product details", tag: "Missing", href: "/upload", Icon: Package },
  { label: "Add category", tag: "Missing", href: "/business-profile?focus=business-category", Icon: Tag },
  { label: "Business Picture add 5 hd Photos", tag: "Trending", href: "/business-profile?focus=office-pictures", Icon: Image },
  { label: "Add Upto 10 Products with Price & Image", tag: "Trending", href: "/upload", Icon: FileText },
  { label: "Add Email Address", tag: null, href: "/business-profile?focus=contact-details", Icon: Mail },
  { label: "Get up to 20 Reviews", tag: "Pending", href: "/reviews", Icon: Star },
  { label: "Add Social Media Channels", tag: null, href: "/add-social-links", Icon: Share2 },
  { label: "Add Business Website", tag: null, href: "/business-profile?focus=contact-details", Icon: Globe },
  { label: "Send upto 2 quotations", tag: "Trending", href: "/quotes", Icon: Send },
  { label: "Add Year of Establishment", tag: null, href: "/business-profile?focus=year-established", Icon: Calendar },
];

const missingCount = scoreItems.filter((item) => item.tag === "Missing").length;

/**
 * One tile in the completion grid. Extracted so the twelve looped tiles and the
 * full-width "Add Number of Employees" tile can never drift apart visually.
 *
 * Every desktop treatment here sits behind `lg:` on purpose: the mobile layout
 * was signed off as-is, so widening the page must not move a pixel below
 * 1024px. Desktop gets the taller box, larger label, hover lift and a keyboard
 * focus ring; mobile keeps the exact tile it already had.
 *
 * `wide` is for the single tile that spans the full grid row. Stacked icon over
 * label reads as a void when the box is 1100px across, so at desktop that one
 * lays its icon and label out on a single line instead.
 */
const ScoreTile = ({
  label,
  href,
  Icon,
  tag = null,
  wide = false,
  className = "",
}: {
  label: string;
  href: string;
  Icon: LucideIcon;
  tag?: string | null;
  wide?: boolean;
  className?: string;
}) => (
  <motion.div variants={listItem} className={className}>
    <Link
      to={href}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div
        className={`relative flex min-h-[110px] flex-col items-center justify-center gap-3 rounded-2xl bg-muted/60 p-4 text-center transition-[background-color,box-shadow,transform] duration-200 hover:bg-muted lg:gap-4 lg:p-5 lg:hover:-translate-y-0.5 lg:hover:shadow-md lg:active:translate-y-0 ${
          wide ? "lg:min-h-[110px] lg:flex-row lg:gap-3" : "lg:min-h-[150px]"
        }`}
      >
        {/* Badge */}
        {tag && (
          <span
            className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold lg:right-3 lg:top-3 lg:text-[10px] ${
              tag === "Missing"
                ? "bg-red-500 text-white"
                : "bg-foreground text-background"
            }`}
          >
            {tag}
          </span>
        )}

        {/* Icon */}
        <Icon className="h-8 w-8 shrink-0 text-muted-foreground lg:h-9 lg:w-9" strokeWidth={1.5} />

        {/* Label */}
        <p className="text-xs font-medium leading-snug text-foreground lg:text-sm">
          {label}
        </p>
      </div>
    </Link>
  </motion.div>
);

const BusinessProfileScorePage = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const score = useProfileScore();

  // Rating label + colours track the score so the header never contradicts it.
  const rating =
    score < 40
      ? { label: "Poor", text: "text-red-500", bar: "bg-red-500" }
      : score < 70
      ? { label: "Average", text: "text-amber-500", bar: "bg-amber-500" }
      : { label: "Good", text: "text-green-600", bar: "bg-green-500" };

  return (
    <DashboardLayout>
      {/* Mobile keeps the signed-off 512px column. Desktop widens to 1152px and
          the two blocks below reflow into the space rather than being stretched
          into it: the score becomes a horizontal summary band, the tiles go
          from 2 columns to 4. */}
      <motion.div
        className="mx-auto max-w-lg space-y-4 pb-8 lg:max-w-6xl lg:space-y-6"
        variants={reduced ? {} : page}
        initial="hidden"
        animate="show"
      >

        {/* Header */}
        <motion.div variants={section} className="flex items-center gap-3 py-1">
          <motion.button
            whileTap={TAP}
            transition={TAP_T}
            onClick={() => navigate(-1)}
            className="rounded-full p-1.5 transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <h1 className="text-base font-semibold text-foreground lg:text-xl">
            Business Profile Score
          </h1>
        </motion.div>

        {/* Score summary */}
        <motion.div
          variants={section}
          className="space-y-1.5 lg:flex lg:items-center lg:gap-10 lg:space-y-0 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-6"
        >
          {/* Score + rating label. Reversed at desktop so the number leads. */}
          <div className="flex items-center justify-between lg:shrink-0 lg:flex-col-reverse lg:items-start lg:justify-start lg:gap-1">
            <span className={`text-sm font-semibold ${rating.text} lg:text-base`}>{rating.label}</span>
            <span className="text-sm font-bold text-foreground lg:text-5xl lg:leading-none lg:tracking-tight">{score}%</span>
          </div>

          {/* Bar + copy. Grouped so they can sit beside the score at desktop;
              the inner space-y matches the outer one, so mobile spacing is
              unchanged. */}
          <div className="space-y-1.5 lg:flex-1 lg:space-y-2.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted lg:h-2.5">
              <motion.div
                className={`h-full rounded-full ${rating.bar}`}
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.8, delay: 0.1 }}
              />
            </div>
            <p className="text-xs text-muted-foreground lg:text-sm">
              Complete the options below to increase your profile score and reach out to more customers.
            </p>
            {missingCount > 0 && (
              <p className="hidden text-sm text-muted-foreground lg:block">
                <span className="font-semibold text-foreground">{missingCount} essential details</span> are still missing from your profile.
              </p>
            )}
          </div>
        </motion.div>

        {/* Task grid: 2 columns on mobile, 3 from 1024px, 4 from 1280px. Twelve
            items divide evenly by 2, 3 and 4, so no breakpoint ends ragged. */}
        <motion.div
          variants={listContainer}
          className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
        >
          {scoreItems.map((item) => (
            <ScoreTile
              key={item.label}
              label={item.label}
              href={item.href}
              Icon={item.Icon}
              tag={item.tag}
            />
          ))}

          {/* Twelve tiles fill 6 mobile rows / 3 desktop rows exactly, so this
              one closes the grid full-width in both layouts and neither ends
              on a ragged row. */}
          <ScoreTile
            label="Add Number of Employees"
            href="/business-profile?focus=employees"
            Icon={Users}
            wide
            className="col-span-2 lg:col-span-3 xl:col-span-4"
          />
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

export default BusinessProfileScorePage;
