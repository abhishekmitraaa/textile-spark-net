import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SampleProfilesNotice, SampleTag } from "@/components/buyer/SampleProfile";
import { getServiceVendor } from "@/lib/serviceVendorsData";
import { useStepBack } from "@/hooks/useStepBack";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MapPin, Share2, Briefcase, Timer, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "services" | "portfolio";

/**
 * A sample service provider (Mitra, 2026-11-18, "Keep, remove fakes"; review H-13). There is no account behind it, so
 * the page has no rating, reviews, Save, Chat or Call: Call dialled a generated real-format number, Chat opened a
 * thread with an id that isn't an account, and reviews written here attached real buyers' words to a made-up provider.
 */
const ServiceVendorProfile = () => {
  const reduced = useReducedMotion();
  const { vendorId } = useParams();
  const v = getServiceVendor(vendorId ?? "");
  const goBack = useStepBack("/services");

  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<Tab>("services");

  if (!v) {
    return (
      <div className="min-h-screen bg-white grid place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-gray-500">This service vendor no longer exists.</p>
          <button onClick={goBack} className="mt-3 text-sm font-semibold text-brand-buyer">Back to Services</button>
        </div>
      </div>
    );
  }

  const card = "rounded-2xl border border-gray-200 bg-white p-4";
  const total = v.cover.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to Services
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Link copied!"); }} aria-label="Share" className="p-1.5 rounded-full hover:bg-gray-100">
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      <motion.div className="max-w-2xl mx-auto px-4 pt-3 pb-24 space-y-3" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <SampleProfilesNotice />

        {/* Cover carousel */}
        <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/10]">
          <AnimatePresence mode="wait">
            <motion.img key={slide} src={v.cover[slide]} alt="" className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
          </AnimatePresence>
          {total > 1 && (
            <>
              <button onClick={() => setSlide((s) => (s - 1 + total) % total)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronLeft className="w-4 h-4 text-gray-700" /></button>
              <button onClick={() => setSlide((s) => (s + 1) % total)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronRight className="w-4 h-4 text-gray-700" /></button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {v.cover.map((_, i) => <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-white" : "w-1.5 bg-white/60")} />)}
              </div>
            </>
          )}
        </div>

        {/* Identity */}
        <div className={card}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{v.name}</h1>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-buyer px-2.5 py-1 text-[11px] font-bold text-white">
                <Briefcase className="w-3 h-3" /> {v.serviceType}
              </span>
            </div>
            <SampleTag />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {v.location}</span>
          </div>
          <div className="mt-3">
            <span className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600">{v.productCode}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-gray-200 p-1">
          {(["services", "portfolio"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative flex-1 rounded-lg py-2 text-sm font-semibold capitalize">
              {tab === t && <motion.span layoutId="sv-tab" className="absolute inset-0 rounded-lg bg-brand-buyer" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={cn("relative z-10", tab === t ? "text-white" : "text-gray-500")}>{t}</span>
            </button>
          ))}
        </div>

        {/* ── SERVICES ── */}
        {tab === "services" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-2">About</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{v.about}</p>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Services Offered</h3>
              <div className="space-y-2">
                {v.services.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm text-gray-800"><Briefcase className="w-4 h-4 text-brand-buyer" /> {s.name}</span>
                    <span className="text-sm font-bold text-brand-buyer">{s.price}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Service Details</h3>
              <div className="space-y-2">
                <DetailRow icon={Briefcase} label="Experience" value={v.experience} />
                <DetailRow icon={Timer} label="Turnaround Time" value={v.turnaround} />
                <DetailRow icon={Wallet} label="Price Range" value={v.priceRange} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-2 gap-3">
              {v.portfolio.map((p) => (
                <div key={p.title} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 group">
                  <img src={p.image} alt={p.title} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <p className="text-xs font-bold text-white leading-tight">{p.title}</p>
                    <p className="text-[10px] text-white/80">{p.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>

      <MobileBottomNav />
    </div>
  );
};

function DetailRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <span className="w-9 h-9 rounded-lg bg-brand-buyer/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-brand-buyer" /></span>
      <div>
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default ServiceVendorProfile;
