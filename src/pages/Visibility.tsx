import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, Loader2, Megaphone, Sparkles, Star } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useMyVisibility, type MyVisibility } from "@/lib/queries/visibility";

// Visibility (subscriptions P10; Basic and above): where the seller's plan places their
// products for buyers, and how often buyers saw them there. Basic: first among sellers without
// a plan in its categories. Silver: a rotating Featured place in the first 10 of a category
// page. Gold: the first 5, ahead of others for buyers in a state it serves. VIP: place 1 and
// the Spotlight rail on the home and category pages. Figures from my_visibility().

const E = [0.23, 1, 0.32, 1] as [number, number, number, number];
const page = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const section = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { ease: E, duration: 0.38 } } };

const PLACE: Record<MyVisibility["featured"], { title: string; body: string }> = {
  none: {
    title: "Priority in your categories",
    body: "Your products come before sellers without a plan in the categories you list in. Silver and above add a Featured place on category pages.",
  },
  top10: {
    title: "Featured in the first 10",
    body: "On the category pages you list in, your best-selling product takes a Featured place among the first 10, in turn with other Silver, Gold and VIP sellers.",
  },
  top5: {
    title: "Featured in the first 5",
    body: "On your category pages your best-selling product takes a Featured place among the first 5, ahead of others for buyers in your state or the states you serve.",
  },
  spotlight: {
    title: "Spotlight: place 1",
    body: "On your category pages your best-selling product takes place 1, in turn with other VIP sellers, and your products appear in the Spotlight on the home and category pages.",
  },
};
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

export default function Visibility() {
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const { data: v, isLoading } = useMyVisibility(user?.id, days);
  const max = Math.max(1, ...(v?.impressions.byDay ?? []).map((d) => d.featured + d.spotlight));

  return (
    <DashboardLayout>
      <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 pb-8">
        <motion.div variants={section} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground lg:text-2xl">Visibility</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Where your plan places your products for buyers, and how often they were seen there.</p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Period">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${days === d ? "bg-gray-900 text-white" : "text-gray-600"}`}>
                {`${d} days`}
              </button>
            ))}
          </div>
        </motion.div>

        {isLoading || !v ? (
          <div className="flex justify-center py-16" role="status" aria-label="Loading"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4 lg:p-5" data-testid="visibility-place">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {v.featured === "spotlight" ? <Sparkles className="h-4 w-4 text-amber-500" /> : <Star className="h-4 w-4 text-brand-vendor" />} Your place
              </p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">{PLACE[v.featured].title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">{PLACE[v.featured].body}</p>
              {v.featured !== "spotlight" && (
                <Link to="/subscription#plans" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-vendor hover:underline">
                  See what other plans place <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </motion.div>

            <motion.div variants={section} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="visibility-featured">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Eye className="h-3.5 w-3.5" /> Seen in Featured places</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{v.impressions.featured.toLocaleString("en-IN")}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="visibility-spotlight">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Sparkles className="h-3.5 w-3.5" /> Seen in the Spotlight</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{v.featured === "spotlight" ? v.impressions.spotlight.toLocaleString("en-IN") : "VIP only"}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Megaphone className="h-3.5 w-3.5" /> Your ads, all time</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{v.impressions.ads.toLocaleString("en-IN")}</p>
                <Link to="/advertisements" className="text-xs font-medium text-brand-vendor hover:underline">Open Advertisements</Link>
              </div>
            </motion.div>

            {v.impressions.byDay.length > 0 && (
              <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4" data-testid="visibility-days">
                <h2 className="text-sm font-bold text-gray-900">By day</h2>
                <div className="mt-3 flex h-28 items-end gap-1 overflow-x-auto" role="img" aria-label="Featured and Spotlight views by day">
                  {v.impressions.byDay.map((d) => (
                    <div key={d.day} className="flex min-w-[10px] flex-1 flex-col items-center justify-end" title={`${DAY.format(new Date(`${d.day}T00:00:00`))}: ${d.featured + d.spotlight}`}>
                      <div className="w-full rounded-t bg-amber-400" style={{ height: `${(d.spotlight / max) * 100}%` }} />
                      <div className="w-full bg-brand-vendor" style={{ height: `${(d.featured / max) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 flex gap-4 text-[11px] text-gray-500">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-vendor" /> Featured</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Spotlight</span>
                </p>
              </motion.div>
            )}

            <motion.div variants={section} className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-bold text-gray-900">Your categories</h2>
              <p className="text-xs text-gray-500">Featured places are on the pages of the categories you have live products in.</p>
              {v.categories.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No live products yet. <Link to="/upload" className="font-medium text-brand-vendor hover:underline">Add one</Link></p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {v.categories.map((c) => (
                    <li key={c.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                      <span data-no-translate>{c.name}</span>{` · ${c.products}`}
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
