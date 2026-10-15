import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Flag, Loader2, CheckCircle2, FileText, Image as ImageIcon, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  PHOTO_TYPES, fileProblem, fraudTargetFromLink, fraudTargetFromParams, postMessage, reportFraud, supportError,
  uploadSupportFile, type FraudTarget,
} from "@/lib/queries/support";
import { ReceiptLine, SignInForSupport, SupportFrame } from "@/components/support/SupportFrame";

/**
 * Report a potential fraud.
 *
 * Signed in, it's a short wizard that stores the report (support_report_fraud, plan P3d).
 * The team reviews it in Cosora-Admin's restricted Fraud reports board, and the reporter
 * later learns only that it was reviewed, never the outcome. Evidence is write-only:
 * Cosora's team can open the files, the reporter is told how many were received.
 *
 * Signed out, it asks them to sign in. Reports reach Cosora-Admin only through the app
 * (Mitra, 2026-10-16: "the report option should get all the reports in the admin panel and
 * not via email"). Until then a signed-out visitor, and everyone the support rollout didn't
 * admit (it has been Off since launch, so everyone), got a form that opened an email.
 *
 * Reachable signed out (the landing page's footer). SupportFrame follows the role:
 * the seller dashboard for sellers, the plain back header otherwise.
 *
 * What it's about (2026-10-02): "Report this seller" and "Report this listing" open it
 * with ?entity_type=vendor|product&entity_id=…, and a Cosora store or listing link typed
 * into "A link to them" counts the same. The report then names that account, so a
 * confirmed-fraud record can say whose account it was and what happened to it.
 */

export default function ReportFraud() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <SupportFrame title="Report fraud">
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      </SupportFrame>
    );
  }
  if (!user) {
    return (
      <SupportFrame title="Report fraud">
        <SignInForSupport title="Sign in to report fraud. Your report goes straight to Cosora's team." contact={false} />
      </SupportFrame>
    );
  }
  return (
    <SupportFrame title="Report fraud">
      <FraudWizard />
    </SupportFrame>
  );
}

// ── The in-app report (P3) ─────────────────────────────────────
type Report = { name: string; phone: string; url: string; city: string; description: string; amount: string; date: string };
const STEPS = ["Who", "What happened", "Evidence", "Check and send"];

const TARGET_TEXT: Record<FraudTarget["type"], string> = {
  vendor: "This report is about the seller whose page you came from.",
  product: "This report is about the listing you came from.",
};
const LINKED_TEXT: Record<FraudTarget["type"], string> = {
  vendor: "A seller on Cosora",
  product: "A listing on Cosora",
};

function FraudWizard() {
  const [params] = useSearchParams();
  const fromPage = fraudTargetFromParams(params);
  const [step, setStep] = useState(0);
  const [r, setR] = useState<Report>({ name: "", phone: "", url: "", city: "", description: "", amount: "", date: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketNo: string; failedFiles: number } | null>(null);
  const set = (k: keyof Report) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setR((v) => ({ ...v, [k]: e.target.value }));
  // The page it came from wins; otherwise a Cosora link they typed.
  const target: FraudTarget | null = fromPage ?? fraudTargetFromLink(r.url);
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
        amountInr: r.amount ? Number(r.amount) : null, incidentDate: r.date || null, target,
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
          <ReceiptLine ticketNo={done.ticketNo} />
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
              {fromPage && (
                <p className="rounded-lg bg-destructive/5 px-3 py-2 text-sm text-gray-700">{TARGET_TEXT[fromPage.type]}</p>
              )}
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
              {target && (
                <div>
                  <dt className="text-[11px] text-gray-500">About</dt>
                  <dd className="text-gray-900">{LINKED_TEXT[target.type]}</dd>
                </div>
              )}
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
