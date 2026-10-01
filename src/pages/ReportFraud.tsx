import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Flag, AlertTriangle, Mail, Phone, Loader2, CheckCircle2, FileText, Image as ImageIcon, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SUPPORT_EMAIL, SUPPORT_HOURS_LABEL, SUPPORT_PHONE, SUPPORT_PHONE_LABEL, supportMailto } from "@/lib/supportContact";
import {
  PHOTO_TYPES, fileProblem, postMessage, reportFraud, supportError, uploadSupportFile, useSupportStatus,
} from "@/lib/queries/support";
import { SignInForSupport, SupportFrame } from "@/components/support/SupportFrame";

/**
 * Report a potential fraud.
 *
 * Signed in, with support open to them (rollout), it's a short wizard that stores the
 * report (support_report_fraud, plan P3d). The team reviews it in Cosora-Admin's
 * restricted Fraud reports board, and the reporter later learns only that it was
 * reviewed, never the outcome. Evidence is write-only: Cosora's team can open the
 * files, the reporter is told how many were received.
 *
 * Otherwise (signed out, or support not open to them yet) it's the P1 path: the form
 * fills an email to Cosora and their own mail app sends it, and the page says so.
 * Until 2026-10-01 this page toasted "Report submitted... within 48 hours" and kept
 * nothing (securityflags.md, 2026-09-30).
 *
 * Reachable signed out (the landing page's footer). SupportFrame follows the role:
 * the seller dashboard for sellers, the plain back header otherwise.
 */

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

export default function ReportFraud() {
  const { user, loading } = useAuth();
  const status = useSupportStatus(user?.id);
  if (loading || (user && status.isPending)) {
    return (
      <SupportFrame title="Report fraud">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (user && status.data?.available) {
    return (
      <SupportFrame title="Report fraud">
        <FraudWizard />
      </SupportFrame>
    );
  }
  return (
    <SupportFrame title="Report fraud">
      <div className="space-y-4">
        {!user && <SignInForSupport title="Sign in to report fraud in the app, or email us your report." />}
        <EmailReportForm />
      </div>
    </SupportFrame>
  );
}

// ── The email path (P1) ────────────────────────────────────────
type Fields = { name: string; phone: string; reported: string; fraudPhone: string; city: string; message: string };

const FIELDS: { label: string; key: keyof Fields; type: string; placeholder: string }[] = [
  { label: "Who are you reporting?", key: "reported", type: "text", placeholder: "Their name, store name or a link" },
  { label: "Their phone number", key: "fraudPhone", type: "tel", placeholder: "The number you suspect" },
  { label: "City", key: "city", type: "text", placeholder: "Where it happened" },
  { label: "Your name", key: "name", type: "text", placeholder: "Your full name" },
  { label: "Your mobile number", key: "phone", type: "tel", placeholder: "+91 XXXXX XXXXX" },
];

// The email Cosora receives. Staff read it, so its labels stay in English whatever
// language the page is shown in.
function emailBody(f: Fields): string {
  const line = (label: string, value: string) => `${label}: ${value.trim() || "-"}`;
  return [
    line("Reported", f.reported),
    line("Their phone", f.fraudPhone),
    line("City", f.city),
    "",
    "What happened:",
    f.message.trim(),
    "",
    line("My name", f.name),
    line("My mobile", f.phone),
    "",
    "(Screenshots attached, if any.)",
  ].join("\n");
}

function EmailReportForm() {
  const reduced = useReducedMotion();
  const [fields, setFields] = useState<Fields>({ name: "", phone: "", reported: "", fraudPhone: "", city: "", message: "" });
  const [opened, setOpened] = useState(false);
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const openEmail = () => {
    if (!fields.message.trim()) {
      toast.error("Describe what happened first.");
      return;
    }
    window.location.href = supportMailto("Fraud report", emailBody(fields));
    setOpened(true);
  };

  return (
    <motion.div variants={reduced ? {} : page} initial="hidden" animate="show" className="space-y-4 max-w-lg mx-auto pb-8">
      <motion.div variants={section}>
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center">
          <Flag className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-xl font-bold text-destructive">Report a Potential Fraud</p>
          <p className="text-xs text-destructive/80 mt-1">
            Fill this in and we'll open an email to Cosora with it. Your report is sent when you send that email.
          </p>
        </div>
      </motion.div>
      <motion.div variants={section}>
        <Card>
          <CardContent className="p-4 space-y-4">
            {FIELDS.map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`fraud-${key}`} className="text-sm font-medium">{label}</Label>
                <Input
                  id={`fraud-${key}`}
                  type={type}
                  placeholder={placeholder}
                  value={fields[key]}
                  onChange={set(key)}
                  className="h-11"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="fraud-message" className="text-sm font-medium">What happened? *</Label>
              <Textarea
                id="fraud-message"
                placeholder="Include what happened, amounts involved, dates, and anything else that helps."
                rows={5}
                value={fields.message}
                onChange={set("message")}
                className="resize-none"
              />
            </div>
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-700 space-y-0.5">
                <p>Have screenshots? Attach them to the email before you send it.</p>
                <p>
                  Please use this only to report fraud. For anything else, see{" "}
                  <Link to="/help" className="underline">Help &amp; Support</Link>.
                </p>
              </div>
            </div>
            <motion.div whileTap={TAP} transition={TAP_T}>
              <Button
                className="w-full bg-destructive text-destructive-foreground h-11 hover:bg-destructive/90"
                onClick={openEmail}
              >
                <Mail className="h-4 w-4 mr-2" /> Email this report
              </Button>
            </motion.div>
            {opened && (
              <p className="text-xs text-muted-foreground text-center" role="status">
                Your email app should open with the report filled in. Nothing reaches Cosora until you send it.
                If it didn't open, email {SUPPORT_EMAIL}.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={section}>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <Phone className="h-4 w-4 text-gray-600 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              Rather talk? Call us on{" "}
              <a href={`tel:${SUPPORT_PHONE}`} className="font-medium underline">{SUPPORT_PHONE_LABEL}</a>.{" "}
              <span className="text-gray-500">{SUPPORT_HOURS_LABEL}</span>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ── The in-app report (P3) ─────────────────────────────────────
type Report = { name: string; phone: string; url: string; city: string; description: string; amount: string; date: string };
const STEPS = ["Who", "What happened", "Evidence", "Check and send"];

function FraudWizard() {
  const [step, setStep] = useState(0);
  const [r, setR] = useState<Report>({ name: "", phone: "", url: "", city: "", description: "", amount: "", date: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketNo: string; failedFiles: number } | null>(null);
  const set = (k: keyof Report) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setR((v) => ({ ...v, [k]: e.target.value }));
  // Today in IST, the date the database checks against.
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  const next = () => {
    if (step === 1) {
      if (!r.description.trim()) return void toast.error("Describe what happened first.");
      if (r.amount && !(Number(r.amount) >= 0)) return void toast.error("The amount should be a number.");
      if (r.date && r.date > today) return void toast.error("The date can't be in the future.");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const keep = [...files];
    for (const f of Array.from(list)) {
      const problem = fileProblem(f);
      if (problem) {
        toast.error(problem);
        continue;
      }
      if (keep.length >= 5) {
        toast.error("Up to 5 files.");
        break;
      }
      keep.push(f);
    }
    setFiles(keep);
  };

  const submit = async () => {
    setBusy("Sending your report…");
    let ticket: { ticket_id: string; ticket_no: string };
    try {
      ticket = await reportFraud({
        description: r.description, reportedName: r.name, reportedPhone: r.phone, reportedUrl: r.url, city: r.city,
        amountInr: r.amount ? Number(r.amount) : null, incidentDate: r.date || null,
      });
    } catch (e) {
      setBusy(null);
      toast.error(supportError(e));
      return;
    }
    // The report is stored. Files go up after it, and a file that fails doesn't undo it.
    let failed = 0;
    const ids: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(files.length > 1 ? `Sending file ${i + 1} of ${files.length}…` : "Sending file…");
      try {
        ids.push(await uploadSupportFile(ticket.ticket_id, f));
      } catch {
        failed += 1;
      }
    }
    if (ids.length) {
      try {
        await postMessage(ticket.ticket_id, null, ids);
      } catch {
        failed = files.length;
      }
    }
    setBusy(null);
    setDone({ ticketNo: ticket.ticket_no, failedFiles: failed });
  };

  if (done) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-base font-semibold text-gray-900">{`We've recorded your report ${done.ticketNo}.`}</p>
          <p className="text-sm text-gray-600">Our team reviews every report. You'll see in My requests when it has been reviewed.</p>
          {done.failedFiles > 0 && (
            <p className="text-sm text-amber-700">
              {done.failedFiles === 1
                ? "1 file didn't upload. You can add it to the report from My requests."
                : `${done.failedFiles} files didn't upload. You can add them to the report from My requests.`}
            </p>
          )}
          <Link
            to={`/help/requests/${done.ticketNo}`}
            className="inline-block rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90"
          >
            See the report
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-clarity-mask="True">
      <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-destructive" />
          <p className="text-base font-bold text-destructive">Report a Potential Fraud</p>
        </div>
        <ol className="mt-3 flex gap-1.5" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-destructive" : "bg-destructive/20"}`} />
              <span className={`mt-1 block text-[10px] ${i === step ? "font-semibold text-destructive" : "text-destructive/70"}`}>{label}</span>
            </li>
          ))}
        </ol>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {step === 0 && (
            <>
              <p className="text-sm text-gray-600">Tell us who it was. Fill in what you know; every field here is optional.</p>
              <Field id="fr-name" label="Name or store name" value={r.name} onChange={set("name")} placeholder="Who did this?" />
              <Field id="fr-phone" label="Their phone number" value={r.phone} onChange={set("phone")} placeholder="The number you suspect" type="tel" />
              <Field id="fr-url" label="A link to them" value={r.url} onChange={set("url")} placeholder="A store page, profile or website" />
              <Field id="fr-city" label="City" value={r.city} onChange={set("city")} placeholder="Where it happened" />
            </>
          )}
          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="fr-description" className="text-sm font-medium">What happened? *</Label>
                <Textarea
                  id="fr-description"
                  rows={6}
                  maxLength={4000}
                  value={r.description}
                  onChange={set("description")}
                  placeholder="Include what happened, amounts involved, dates, and anything else that helps."
                  className="resize-none"
                />
              </div>
              <Field id="fr-amount" label="Amount involved, in ₹ (optional)" value={r.amount} onChange={set("amount")} placeholder="25000" type="number" />
              <Field id="fr-date" label="When it happened (optional)" value={r.date} onChange={set("date")} type="date" max={today} />
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-sm text-gray-600">
                Screenshots of chats, payments or listings help. Only Cosora's team can open them; you'll see how many we received.
              </p>
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-gray-200 p-5 text-center hover:border-destructive/40">
                <ImageIcon className="h-7 w-7 text-gray-400" />
                <span className="text-sm text-gray-700">Add photos or PDFs</span>
                <span className="text-[11px] text-gray-500">Photos up to 5 MB, PDFs up to 10 MB, up to 5 files</span>
                <input
                  type="file"
                  multiple
                  accept={`${PHOTO_TYPES},application/pdf`}
                  className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
              </label>
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <span className="min-w-0 flex-1 truncate" data-no-translate>{f.name}</span>
                      <button type="button" aria-label="Remove file" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {step === 3 && (
            <dl className="space-y-2 text-sm">
              <Row label="Name or store name" value={r.name} />
              <Row label="Their phone number" value={r.phone} />
              <Row label="A link to them" value={r.url} />
              <Row label="City" value={r.city} />
              <Row label="What happened?" value={r.description} />
              <Row label="Amount involved, in ₹ (optional)" value={r.amount} />
              <Row label="When it happened (optional)" value={r.date} />
              <Row label="Files" value={files.length ? String(files.length) : ""} />
            </dl>
          )}

          <div className="flex gap-2 pt-1">
            {step > 0 && (
              <Button variant="outline" className="flex-1 h-11" disabled={Boolean(busy)} onClick={() => setStep((s) => s - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button className="flex-1 h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={next}>Next</Button>
            ) : (
              <Button
                className="flex-1 h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={Boolean(busy)}
                onClick={() => void submit()}
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />{busy}</> : "Send the report"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-gray-500 text-center">
        Only for fraud. For anything else, see <Link to="/help" className="underline">Help &amp; Support</Link>.
      </p>
    </div>
  );
}

function Field(props: {
  id: string; label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string; type?: string; max?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="text-sm font-medium">{props.label}</Label>
      <Input id={props.id} type={props.type ?? "text"} value={props.value} onChange={props.onChange} placeholder={props.placeholder} max={props.max} className="h-11" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-gray-900" data-no-translate>{value.trim() || "–"}</dd>
    </div>
  );
}
