import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SampleProfilesNotice, SampleTag } from "@/components/buyer/SampleProfile";
import { getFreelancer } from "@/lib/freelancersData";
import { useStepBack } from "@/hooks/useStepBack";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MapPin, Share2, Briefcase, GraduationCap, Wallet, Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "services" | "portfolio";

/**
 * A sample freelancer (Mitra, 2026-11-18, "Keep, remove fakes"; review H-13). There is no account behind it, so the
 * page has no rating, reviews, Save, Chat or Call (Call dialled a generated real-format number; Chat opened a thread
 * with no account; reviews written here attached real buyers' words to a made-up person).
 */
const FreelancerProfile = () => {
  const reduced = useReducedMotion();
  const { id } = useParams();
  const f = getFreelancer(id ?? "");
  const goBack = useStepBack("/freelancers");

  const [slide, setSlide] = useState(0);
  const [tab, setTab] = useState<Tab>("services");

  if (!f) {
    return (
      <div className="min-h-screen bg-white grid place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-gray-500">This freelancer no longer exists.</p>
          <button onClick={goBack} className="mt-3 text-sm font-semibold text-brand-buyer">Back to Freelancers</button>
        </div>
      </div>
    );
  }

  const card = "rounded-2xl border border-gray-200 bg-white p-4";
  const total = f.cover.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to Freelancers
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
            <motion.img key={slide} src={f.cover[slide]} alt="" className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
          </AnimatePresence>
          {total > 1 && (
            <>
              <button onClick={() => setSlide((s) => (s - 1 + total) % total)} aria-label="Previous" className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronLeft className="w-4 h-4 text-gray-700" /></button>
              <button onClick={() => setSlide((s) => (s + 1) % total)} aria-label="Next" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 flex items-center justify-center shadow-sm"><ChevronRight className="w-4 h-4 text-gray-700" /></button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {f.cover.map((_, i) => <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-5 bg-white" : "w-1.5 bg-white/60")} />)}
              </div>
            </>
          )}
        </div>

        {/* Identity */}
        <div className={card}>
          <div className="flex items-start gap-3">
            <img src={f.avatar} alt={f.name} className="w-14 h-14 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{f.name}</h1>
              <p className="text-sm text-brand-buyer font-medium">{f.title}</p>
              <p className="text-xs text-gray-500">{f.specialty}</p>
            </div>
            <SampleTag />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {f.location}</span>
          </div>
          {/* Rate cards */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-brand-buyer/5 border border-brand-buyer/15 px-3 py-2.5">
              <p className="text-base font-extrabold text-brand-buyer">₹{f.hourlyRate.toLocaleString("en-IN")}<span className="text-[11px] font-medium text-gray-400">/hr</span></p>
              <p className="text-[11px] text-gray-500">Hourly Rate</p>
            </div>
            <div className="rounded-xl bg-brand-buyer/5 border border-brand-buyer/15 px-3 py-2.5">
              <p className="text-base font-extrabold text-brand-buyer">{f.projectRate}</p>
              <p className="text-[11px] text-gray-500">Per Project</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-gray-200 p-1">
          {(["services", "portfolio"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="relative flex-1 rounded-lg py-2 text-sm font-semibold capitalize">
              {tab === t && <motion.span layoutId="fp-tab" className="absolute inset-0 rounded-lg bg-brand-buyer" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className={cn("relative z-10", tab === t ? "text-white" : "text-gray-500")}>{t}</span>
            </button>
          ))}
        </div>

        {/* ── SERVICES ── */}
        {tab === "services" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-2">About</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.about}</p>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Services Offered</h3>
              <div className="space-y-2">
                {f.services.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-sm text-gray-800"><Briefcase className="w-4 h-4 text-brand-buyer" /> {s.name}</span>
                    <span className="text-sm font-bold text-brand-buyer">{s.price}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Skills &amp; Expertise</h3>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat icon={Briefcase} label="Experience" value={`${f.experienceYears} years`} />
                <Stat icon={Timer} label="Turnaround" value={f.turnaround} />
                <Stat icon={Wallet} label="Price Range" value={f.priceRange} />
              </div>
              <div className="flex flex-wrap gap-2">
                {f.skills.map((s) => <span key={s} className="rounded-full bg-brand-buyer/5 border border-brand-buyer/20 px-3 py-1 text-xs font-medium text-brand-buyer">{s}</span>)}
              </div>
            </div>

            <div className={card}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">Education</h3>
              <div className="space-y-3">
                {f.education.map((e) => (
                  <div key={e.title} className="flex items-start gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><GraduationCap className="w-4 h-4" /></span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{e.title}</p>
                      <p className="text-xs text-gray-400">{e.org} • {e.year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PORTFOLIO ── */}
        {tab === "portfolio" && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-2 gap-3">
              {f.portfolio.map((p) => (
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

function Stat({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 text-center">
      <Icon className="w-4 h-4 text-brand-buyer mx-auto mb-1" />
      <p className="text-[11px] font-bold text-gray-900 leading-tight">{value}</p>
      <p className="text-[9px] text-gray-400">{label}</p>
    </div>
  );
}

export default FreelancerProfile;
