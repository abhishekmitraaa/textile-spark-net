import { errorMessage } from "@/lib/errorMessage";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { createRfq, uploadRfqImages, RFQ_MAX_IMAGES } from "@/lib/queries/rfqs";
import { quantityFrom, amountFrom } from "@/lib/requirementNumbers";
import { UPLOAD_IMAGE_TYPES } from "@/lib/shrinkImage";
import { resolveSubcategoryId, resolveParentCategoryId } from "@/lib/queries/products";
import { getCategoryById } from "@/data/sellerCategories";
import { requirementAttributes } from "@/lib/formAttributes";
import { schemaForCategory, type Field } from "@/data/requirementSchemas";
import { useVocabulary } from "@/lib/queries/attributeDefinitions";
import { CategorySelector } from "@/components/upload/CategorySelector";
import { SubCategorySelector } from "@/components/upload/SubCategorySelector";
import BuyerShell from "@/components/buyer/BuyerShell";
import { usePublishedHeight } from "@/hooks/usePublishedHeight";
import QuickRfqModal from "@/components/buyer/QuickRfqModal";
import CosoraLogo from "@/components/CosoraLogo";
import {
  Zap, FileText, ArrowLeft, ChevronRight, Sparkles, Clock, CheckCircle2,
  Check, X, Mic, MicOff, Image as ImageIcon, Plus, ChevronDown, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// CATEGORY VOCABULARY
//
// This step used to render a hardcoded 17-tile list local to this file
// ("Fabrics", "Women's clothing", "IT & Software"...) that was never resolved
// against anything. It looked like a taxonomy and behaved like decoration: the
// chosen tile reached the RFQ only as part of the title string, and only 2 of
// its 17 labels named a category any live product actually used. An RFQ and a
// vendor's catalogue could not be compared at all.
//
// Buyers now pick from the SAME rows vendors list under — sellerCategories.ts,
// which the categories table is seeded from — through the SAME two components
// Upload.tsx uses. One vocabulary, one picker, one source of truth, so the
// selected row's id is directly comparable to a product's category_id in
// match_vendor_rfqs. Nothing here maps names after the fact.
//
// The old per-tile preference thumbnails go with it: CategorySelector is
// icon-and-type based (Products / Services / Freelancer), and keeping a second
// image-grid variant purely for buyers would rebuild the divergence this
// change removes.

type Step = "main" | "category" | "form" | "success";

// Minimal typing for the Web Speech API (not in lib.dom for all TS targets).
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecCtor = new () => SpeechRec;

// ─────────────────────────────────────────────────────────────
// Reusable bits
// ─────────────────────────────────────────────────────────────

function SectionCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded-full bg-brand-buyer/10 text-brand-buyer text-[11px] font-bold flex items-center justify-center">{n}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-buyer transition-colors";

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
        active ? "border-brand-buyer bg-brand-buyer text-white" : "border-gray-200 text-gray-700 hover:border-brand-buyer/40"
      )}
    >
      {label}
    </button>
  );
}

// Group consecutive half-width fields into 2-col rows.
function toRows(fields: Field[]): Field[][] {
  const rows: Field[][] = [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.half && fields[i + 1]?.half) { rows.push([f, fields[i + 1]]); i += 2; }
    else { rows.push([f]); i += 1; }
  }
  return rows;
}

type FormValues = Record<string, string | string[]>;

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

/** A picked photo before upload, with its remove button. */
function PhotoPreview({ file, onRemove, cover }: { file: File; onRemove: () => void; cover: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <span className="relative h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" />}
      {cover && <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[9px] font-semibold text-white">Cover</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 shadow"
      >
        <X className="h-3 w-3 text-gray-600" />
      </button>
    </span>
  );
}

/**
 * A bar fixed to the bottom of the screen, just above the phone's bottom bar, holding a step's way on.
 * Rendered into <body>: the step's slide-in animation transforms its own box, and a fixed element
 * inside a transformed one moves with it. A spacer of the bar's height keeps the end of the step
 * scrollable above it, and the height is published as --pinned-bar-h so the To-top button rises above
 * it instead of covering it.
 */
function PinnedBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  usePublishedHeight(ref, "--pinned-bar-h");
  return (
    <>
      <div aria-hidden style={{ height: "calc(var(--pinned-bar-h, 0px) + 1rem)" }} />
      {createPortal(
        <div
          ref={ref}
          className="fixed inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur"
          style={{ bottom: "var(--bottom-nav-h, 0px)" }}
        >
          <div className="mx-auto max-w-2xl px-4 py-3">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

const PostRequirement = () => {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);
  const subCategoryRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("main");
  const [quickOpen, setQuickOpen] = useState(false);
  // Both ids are sellerCategories ids (e.g. "apparel-home" / "womens-dresses"),
  // NOT categories.id. They are resolved to a real taxonomy row once, on submit.
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [openSelect, setOpenSelect] = useState<string | null>(null);

  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const category = categoryId ? (getCategoryById(categoryId) ?? null) : null;
  const subCategory = category?.subCategories.find((s) => s.id === subCategoryId) ?? null;
  // The question sets super admins edit (public.attribute_definitions, Ranking F3), or the code list if they
  // can't be read. A category without questions of its own gets the generic set.
  const { requirementSchemas } = useVocabulary();
  const sections = categoryId ? schemaForCategory(categoryId, requirementSchemas) : [];

  // Reset the form whenever the chosen category changes (fields differ per
  // category). The subcategory is cleared too: it belongs to the old parent and
  // would otherwise resolve against a category the buyer is no longer choosing.
  useEffect(() => {
    setValues({});
    setFiles([]);
    setOpenSelect(null);
    setSubCategoryId(null);
  }, [categoryId]);

  // The category list is taller than a phone screen, and the sub-category choice appears under it,
  // out of sight (Mitra, 2026-10-14: people don't know they have to scroll). Picking a category
  // brings that choice into view.
  const pickCategory = (id: string) => {
    setCategoryId(id);
    window.setTimeout(() => {
      subCategoryRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }, 50);
  };

  const sVal = (k: string) => (values[k] as string) ?? "";
  const aVal = (k: string) => (Array.isArray(values[k]) ? (values[k] as string[]) : []);
  const setVal = (k: string, v: string | string[]) => setValues((prev) => ({ ...prev, [k]: v }));
  const toggleArr = (k: string, v: string) =>
    setValues((prev) => {
      const cur = Array.isArray(prev[k]) ? (prev[k] as string[]) : [];
      return { ...prev, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });

  // ── Voice to text (Web Speech API, graceful fallback) ──
  const toggleVoice = () => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input isn't supported in this browser"); return; }
    if (recording) { recognitionRef.current?.stop(); return; }

    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => { setRecording(true); toast.info("Listening... speak now"); };
    rec.onerror = () => { setRecording(false); toast.error("Couldn't capture audio"); };
    rec.onend = () => setRecording(false);
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setValues((prev) => {
        const cur = (prev.description as string) ?? "";
        return { ...prev, description: (cur ? cur + " " : "") + text };
      });
      toast.success("Added voice description");
    };
    recognitionRef.current = rec;
    rec.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // the same photo can be picked again after removing it
    const photos = picked.filter((f) => f.type.startsWith("image/"));
    if (photos.length < picked.length) toast.error("Only photos can be added here.");
    setFiles((prev) => [...prev, ...photos].slice(0, RFQ_MAX_IMAGES));
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (submitting) return;
    for (const section of sections) {
      for (const f of section.fields) {
        if (!f.required) continue;
        const val = values[f.key];
        const empty = Array.isArray(val) ? val.length === 0 : !String(val ?? "").trim();
        if (empty) { toast.error(`Please fill in "${f.label || section.title}"`); return; }
      }
    }

    if (!user) {
      toast.error("Sign in as a buyer to submit", { description: "Use the dev switcher (bottom-left) to sign in as Demo Buyer." });
      return;
    }

    // Best-effort extraction of a title / quantity / budget from the
    // category-specific values (field keys differ per category schema).
    // `skip`: keys containing any of these are passed over (the max budget must
    // never read the Min box: "budgetMin" contains "budget", 2026-10-18).
    const findVal = (subs: string[], skip: string[] = []): string | undefined => {
      for (const k of Object.keys(values)) {
        const key = k.toLowerCase();
        if (skip.some((s) => key.includes(s))) continue;
        if (subs.some((s) => key.includes(s))) {
          const val = values[k];
          if (val && !Array.isArray(val)) return String(val);
        }
      }
      return undefined;
    };
    // Prefer the SUBCATEGORY over the parent for both of these. The parent is a
    // shelf label ("Apparel & Home Categories"), not a description of what the
    // buyer wants, and this title is the first line of search_text -- so a
    // vague title makes a vaguer embedding, not just an uglier lead card.
    const categoryLabel = subCategory?.name ?? category?.name;
    const productName = findVal(["producttype", "apparel", "type", "item", "name"]) || categoryLabel || "Requirement";
    const quantity = quantityFrom(findVal(["quantity", "qty", "units", "moq", "order"]));
    // The price-range field stores its two boxes as budgetMin / budgetMax: read those
    // first. The guesses are for schemas that name their price fields differently.
    const budgetMin = amountFrom(values.budgetMin ?? findVal(["budgetmin", "minprice", "pricemin", "targetmin"]));
    const budgetMax = amountFrom(values.budgetMax ?? findVal(["budgetmax", "maxprice", "pricemax", "budget", "targetprice", "price"], ["min"]));
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      toast.error("Check your budget", { description: "The minimum is more than the maximum." });
      return;
    }
    const description = (values.description as string) || "";
    const title = `${categoryLabel ?? "General"} — ${productName}`.slice(0, 120);

    // The buyer picked these rows out of the taxonomy, so resolving them is an
    // exact lookup of a name the picker itself offered — not a derivation from
    // anything the buyer typed. Subcategory when there is one, parent otherwise.
    // resolveCategoryId (the free-text regex) is deliberately NOT in this path.
    let categoryDbId: string | null = null;
    try {
      categoryDbId =
        (await resolveSubcategoryId(category?.name, subCategory?.name)) ??
        (await resolveParentCategoryId(category?.name));
    } catch {
      // A taxonomy lookup failure must not cost the buyer their requirement.
      // The RFQ is still worth saving uncategorised: semantic matching carries
      // the larger share of the score either way.
    }

    setSubmitting(true);
    try {
      // Photos first, so the requirement is written once, complete, with its cover.
      const images = files.length ? await uploadRfqImages(user.id, files) : [];
      await createRfq(user.id, {
        title, productName, quantity, budgetMin, budgetMax, description, images,
        categoryId: categoryDbId,
        // Every category answer, as asked (Ranking F1). The guesses above still fill
        // the title, quantity and budget columns.
        attributes: requirementAttributes(values),
      });
      // It is a submission until Cosora approves it: My Quotes lists those under ["rfq_submissions"] (2026-10-19).
      queryClient.invalidateQueries({ queryKey: ["rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["rfq_submissions"] });
    } catch (e) {
      toast.error("Couldn't submit your requirement", { description: errorMessage(e) });
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setStep("success");
  };

  // Success -> redirect to My Previous Quotes
  useEffect(() => {
    if (step !== "success") return;
    const t = window.setTimeout(() => navigate("/requirement/my-quotes"), 5000);
    return () => window.clearTimeout(t);
  }, [step, navigate]);

  // ── Field renderer ──
  const renderField = (f: Field) => {
    switch (f.type) {
      case "text":
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-brand-buyer"> *</span>}</label>}
            <input className={inputCls} placeholder={f.placeholder} value={sVal(f.key)} onChange={(e) => setVal(f.key, e.target.value)} />
          </div>
        );

      case "textarea":
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}</label>}
            <textarea rows={3} className={cn(inputCls, "resize-none")} placeholder={f.placeholder} value={sVal(f.key)} onChange={(e) => setVal(f.key, e.target.value)} />
          </div>
        );

      case "description":
        return (
          <div key={f.key}>
            <div className="relative">
              <textarea
                rows={4}
                className={cn(inputCls, "resize-none pr-12")}
                placeholder={f.placeholder}
                value={sVal("description")}
                onChange={(e) => setVal("description", e.target.value)}
              />
              <button
                onClick={toggleVoice}
                aria-label="Voice to text"
                className={cn("absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors", recording ? "bg-brand-buyer animate-pulse" : "bg-brand-buyer hover:bg-brand-buyer/90")}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 inline-flex items-center gap-1"><Mic className="w-3 h-3" /> Tap mic button to add voice description</p>
          </div>
        );

      case "select": {
        const open = openSelect === f.key;
        return (
          <div key={f.key}>
            {f.label && <label className="block text-xs font-semibold text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-brand-buyer"> *</span>}</label>}
            <div className="relative">
              <button type="button" onClick={() => setOpenSelect(open ? null : f.key)} className={cn(inputCls, "flex items-center justify-between text-left")}>
                <span className={sVal(f.key) ? "text-gray-900" : "text-gray-400"}>{sVal(f.key) || f.placeholder || "Select"}</span>
                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform shrink-0", open && "rotate-180")} />
              </button>
              {open && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg py-1">
                  {(f.options ?? []).map((opt) => (
                    <button key={opt} type="button" onClick={() => { setVal(f.key, opt); setOpenSelect(null); }} className="w-full text-left px-3.5 py-2 text-sm hover:bg-gray-50">{opt}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      case "chips":
        return (
          <div key={f.key}>
            {f.label && <p className="text-xs text-gray-500 mb-2">{f.label}</p>}
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map((opt) => <Chip key={opt} label={opt} active={aVal(f.key).includes(opt)} onClick={() => toggleArr(f.key, opt)} />)}
            </div>
          </div>
        );

      case "radio":
        return (
          <div key={f.key} className="grid grid-cols-2 gap-2.5">
            {(f.options ?? []).map((opt) => {
              const active = sVal(f.key) === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setVal(f.key, active ? "" : opt)}
                  className={cn("flex items-center gap-2 rounded-xl border p-3 text-left transition-all active:scale-[0.98]", active ? "border-brand-buyer bg-brand-buyer/5" : "border-gray-200 hover:border-brand-buyer/40")}
                >
                  <span className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0", active ? "border-brand-buyer" : "border-gray-300")}>
                    {active && <span className="w-2 h-2 rounded-full bg-brand-buyer" />}
                  </span>
                  <span className="text-xs font-medium text-gray-800">{opt}</span>
                </button>
              );
            })}
          </div>
        );

      case "priceRange":
        return (
          <div key={f.key}>
            <p className="text-xs text-gray-500 mb-1.5">{f.label}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                <input className={cn(inputCls, "pl-7")} placeholder="Min" value={sVal("budgetMin")} onChange={(e) => setVal("budgetMin", e.target.value)} />
              </div>
              <span className="text-gray-400">-</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                <input className={cn(inputCls, "pl-7")} placeholder="Max" value={sVal("budgetMax")} onChange={(e) => setVal("budgetMax", e.target.value)} />
              </div>
            </div>
          </div>
        );

      // Photos only (2026-10-14). It offered videos and PDFs too, and uploaded nothing at all: every
      // requirement reached sellers without its pictures. Photos are uploaded on submit and the first
      // is the requirement's cover. Videos and PDFs would need their own storage (size limits, who may read them).
      case "files":
        return (
          <div key={f.key}>
            <input type="file" ref={fileInputRef} onChange={onFiles} accept={UPLOAD_IMAGE_TYPES.join(",")} multiple className="hidden" />
            {files.length < RFQ_MAX_IMAGES && (
              <button onClick={() => fileInputRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-gray-300 p-5 text-center hover:border-brand-buyer/50 transition-colors">
                <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><ImageIcon className="w-4 h-4" /></span>
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700"><Plus className="w-3.5 h-3.5" /> Add photos</p>
                <p className="text-[11px] text-gray-400 mt-1">Designs, inspiration or reference photos. Up to {RFQ_MAX_IMAGES}; the first is the cover sellers see.</p>
              </button>
            )}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((file, i) => (
                  <PhotoPreview key={`${file.name}-${file.lastModified}-${i}`} file={file} onRemove={() => removeFile(i)} cover={i === 0} />
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ── SUCCESS (full-screen coral, per reference) ──
  if (step === "success") {
    return (
      <div className="fixed inset-0 z-[80] bg-brand-buyer flex flex-col items-center justify-center text-center px-8">
        <CosoraLogo height={38} variant="white" className="mb-8" />
        <motion.div
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
          className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
            <Check className="w-9 h-9 text-brand-buyer" strokeWidth={3} />
          </div>
        </motion.div>
        {/* Every open requirement is checked before sellers see it (2026-10-17). */}
        <p className="text-white text-lg font-semibold max-w-xs" data-testid="rfq-sent-for-review">Sent for review</p>
        <p className="mt-2 text-white/90 text-sm max-w-xs">
          Cosora checks every requirement before sellers see it. This usually takes 3–5 minutes, and we'll notify you.
        </p>
        <button onClick={() => navigate("/requirement/my-quotes")} className="mt-8 text-white/80 text-sm underline underline-offset-4">
          See it in My Quotes
        </button>
      </div>
    );
  }

  return (
    <BuyerShell>
      {/* The category step's pinned bar brings its own room (PinnedBar's spacer). */}
      <div className={cn("max-w-2xl mx-auto px-4 pt-3", step === "category" ? "pb-2" : "pb-28")}>
        {/* Each step opens at its top, once the last one has gone. Continue sits in a bar pinned to the
            screen, so without this the next step would open as far down as the category list was scrolled. */}
        <AnimatePresence mode="wait" onExitComplete={() => window.scrollTo({ top: 0 })}>
          {/* ─── HUB ─── */}
          {step === "main" && (
            <motion.div key="main" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -12 }}>
              <div className="text-center mb-5">
                <h1 className="text-xl font-bold text-gray-900">Post Your Requirement</h1>
                <p className="text-sm text-gray-500 mt-0.5">Get quotes from verified manufacturers</p>
              </div>

              {/* Quick Quote */}
              <button
                onClick={() => setQuickOpen(true)}
                className="w-full text-left rounded-2xl border-2 border-brand-buyer/30 bg-brand-buyer/5 p-4 mb-4 hover:border-brand-buyer/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-brand-buyer/15 flex items-center justify-center text-brand-buyer shrink-0">
                    <Zap className="w-5 h-5 fill-brand-buyer" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-bold text-gray-900">Quick Quote</h3>
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase bg-brand-buyer/10 text-brand-buyer px-1.5 py-0.5 rounded"><Sparkles className="w-2.5 h-2.5" /> Fast</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Just upload an image + quantity. Get quotes in minutes!</p>
                    <p className="inline-flex items-center gap-1 text-[11px] text-gray-400 mt-2"><Clock className="w-3 h-3" /> Takes 30 seconds</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </button>

              {/* Create New Requirement */}
              <button
                onClick={() => setStep("category")}
                className="w-full text-left rounded-2xl border border-gray-200 bg-white p-4 mb-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900">Create New Requirement</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Detailed specifications for precise quotes</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-400">
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Category-specific fields</span>
                      <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Fabric, Specs, Quantity</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
                </div>
              </button>

              <button
                onClick={() => navigate("/requirement/my-quotes")}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors"
              >
                <FileText className="w-4 h-4" /> My Previous Quotes
              </button>
            </motion.div>
          )}

          {/* ─── CATEGORY SELECT ─── */}
          {step === "category" && (
            <motion.div key="category" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }}>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep("main")} aria-label="Back" className="-ml-1 p-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-buyer">Step 1 of 2</p>
                  <h1 className="text-lg font-bold text-gray-900">Request Quote from Sellers</h1>
                  <p className="text-xs text-gray-500">Share your requirement and receive multiple quotes from relevant sellers.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900">Select one Category</h2>
                <p className="mb-3 mt-0.5 text-xs text-gray-500">Products, services and freelancers. Scroll to see them all.</p>
                <CategorySelector selectedCategory={categoryId} onSelectCategory={pickCategory} includeBuyerOnly />
              </div>

              {/* Subcategory is OPTIONAL for a buyer, unlike the vendor upload
                  wizard where it is required. "I need packaging" is a complete
                  requirement; a listing has to say which packaging. Skipping it
                  files the RFQ against the parent row, which still matches every
                  vendor selling anything under that parent. */}
              {category && (
                <div ref={subCategoryRef} className="mt-3 scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4">
                  <h2 className="text-sm font-bold text-gray-900 mb-1">
                    Narrow it down <span className="font-medium text-gray-400">(optional)</span>
                  </h2>
                  <p className="mb-3 text-xs text-gray-500">
                    More specific means better-matched sellers. Leave it blank to reach everyone in {category.name}.
                  </p>
                  <SubCategorySelector
                    categoryId={category.id}
                    selectedSubCategory={subCategoryId}
                    onSelectSubCategory={setSubCategoryId}
                  />
                </div>
              )}

              {/* Pinned above the bottom bar, so the way on is always in sight, with what's chosen.
                  It used to be a "Save" button under the whole list, below the fold on a phone. */}
              <PinnedBar>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1" aria-live="polite">
                    {category ? (
                      <>
                        <p className="text-[11px] text-gray-400">Selected</p>
                        <p className="truncate text-sm font-bold text-gray-900">
                          {category.name}
                          {subCategory && <span className="font-medium text-gray-500"> · {subCategory.name}</span>}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">Pick a category to continue</p>
                    )}
                  </div>
                  <button
                    onClick={() => categoryId && setStep("form")}
                    disabled={!categoryId}
                    className={cn("shrink-0 rounded-xl px-6 py-3 text-sm font-bold transition-colors", categoryId ? "bg-brand-buyer hover:bg-brand-buyer/90 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed")}
                  >
                    Continue
                  </button>
                </div>
              </PinnedBar>
            </motion.div>
          )}

          {/* ─── FORM (schema-driven, per category) ─── */}
          {step === "form" && category && (
            <motion.div key="form" initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -16 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("category")} aria-label="Back" className="-ml-1 p-1"><ArrowLeft className="w-5 h-5 text-gray-700" /></button>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-buyer">Step 2 of 2</p>
                  <h1 className="text-lg font-bold text-gray-900">Post Your Requirement</h1>
                  <p className="text-xs text-gray-500">Fill in the details below</p>
                </div>
              </div>

              {/* Category card. Shows the subcategory too when one was chosen,
                  because that — not the parent — is what the RFQ gets filed
                  under, and the buyer should see the value being used. */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-buyer/10 text-sm font-bold text-brand-buyer">
                  {category.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400">Category</p>
                  <p className="truncate text-sm font-bold text-gray-900">
                    {category.name}
                    {subCategory && <span className="font-medium text-gray-500"> · {subCategory.name}</span>}
                  </p>
                </div>
                <button onClick={() => setStep("category")} className="shrink-0 text-xs font-semibold text-brand-buyer hover:underline">Change</button>
              </div>

              {/* Numbered sections for this category */}
              {sections.map((section, si) => (
                <SectionCard key={section.title} n={si + 1} title={section.title}>
                  <div className="space-y-3">
                    {toRows(section.fields).map((row, ri) =>
                      row.length === 2 ? (
                        <div key={ri} className="grid grid-cols-2 gap-3">
                          {row.map(renderField)}
                        </div>
                      ) : (
                        renderField(row[0])
                      )
                    )}
                  </div>
                </SectionCard>
              ))}

              {/* Deadline note */}
              <div className="rounded-xl bg-brand-buyer/5 border border-brand-buyer/20 px-3.5 py-2.5 flex items-start gap-2">
                <Clock className="w-4 h-4 text-brand-buyer mt-0.5 shrink-0" />
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Every quote has an automatic <span className="font-semibold text-gray-800">7-day deadline</span>. Once it's reached, you'll get an option to extend it.
                </p>
              </div>

              {/* Submit */}
              <button
                onClick={submit}
                disabled={submitting}
                aria-busy={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-buyer hover:bg-brand-buyer/90 disabled:opacity-70 text-white py-3.5 text-sm font-bold transition-colors active:scale-[0.99]"
              >
                <Send className="w-4 h-4" /> {submitting ? (files.length ? "Uploading photos…" : "Submitting…") : "Submit Quote Request"}
              </button>
              <p className="text-[11px] text-center text-gray-400">
                Your request will be sent to verified manufacturers. Expect quotes within 24-48 hours.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <QuickRfqModal isOpen={quickOpen} onClose={() => setQuickOpen(false)} />
    </BuyerShell>
  );
};

export default PostRequirement;
