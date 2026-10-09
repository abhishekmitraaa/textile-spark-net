import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Check, Loader2, MessageCircle, StickyNote, Trash2, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { errorMessage } from "@/lib/errorMessage";
import {
  CRM_STAGES, SOURCE_LABEL, STAGE_LABEL, addFollowUp, addNote, deleteFollowUp, deleteLead, setFollowUpDone, updateLead,
  useCrmLeadDetail, useCrmRefresh, type CrmLead, type CrmNote, type CrmStage,
} from "@/lib/queries/crm";

// One CRM lead, opened from the board, the list or a follow-up (subscriptions P8): its
// details, stage, follow-ups and history. A side panel on desktop, a sheet from the bottom on
// a phone. Every change is a crm_* function; the history records stage moves by the vendor
// and by the database (a quote sent, the buyer's answer, a chat opened).

const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-colors focus:outline-none focus:border-brand-vendor focus:ring-1 focus:ring-brand-vendor/20";
const WHEN = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** "2026-10-10T10:00" for a datetime-local input, in the reader's own time. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function historyLine(n: CrmNote): string {
  if (n.kind === "note") return n.body;
  if (n.kind === "follow_up") return `Followed up: ${n.body}`;
  const to = STAGE_LABEL[(n.meta.to ?? n.body) as CrmStage] ?? n.body;
  if (!n.meta.from) return n.meta.by === "system" ? `Added to your CRM as ${to}` : `You added it as ${to}`;
  return n.meta.by === "system" ? `Moved to ${to}` : `You moved it to ${to}`;
}

export default function CrmLeadSheet({ lead, onClose }: { lead: CrmLead | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const refresh = useCrmRefresh();
  const { data: detail, isLoading } = useCrmLeadDetail(lead?.id ?? null);

  const [form, setForm] = useState({ title: "", buyerName: "", value: "", tags: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState("");
  const [due, setDue] = useState(() => localInput(new Date(Date.now() + 24 * 3600_000)));
  const [dueNote, setDueNote] = useState("");

  useEffect(() => {
    if (!lead) return;
    setForm({
      title: lead.title, buyerName: lead.buyerName ?? "", value: lead.valueInr == null ? "" : String(lead.valueInr),
      tags: lead.tags.join(", "),
    });
    setNote(""); setDueNote(""); setLostReason(""); setLostOpen(false);
  }, [lead]);

  if (!lead) return null;

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
      return true;
    } catch (e) {
      toast.error("Couldn't save that", { description: errorMessage(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const value = form.value.trim() === "" ? null : Number(form.value.replace(/[,\s₹]/g, ""));
  const changed =
    form.title.trim() !== lead.title || (form.buyerName.trim() || null) !== lead.buyerName
    || value !== lead.valueInr || tags.join("|") !== lead.tags.join("|");

  const saveDetails = () => {
    if (value != null && !(value >= 0)) { toast.error("Enter the value as a number"); return; }
    const patch: Parameters<typeof updateLead>[1] = {};
    if (form.title.trim() !== lead.title) patch.title = form.title.trim();
    if ((form.buyerName.trim() || null) !== lead.buyerName) patch.buyer_name = form.buyerName.trim() || null;
    if (value !== lead.valueInr) patch.value_inr = value;
    if (tags.join("|") !== lead.tags.join("|")) patch.tags = tags;
    void run("details", () => updateLead(lead.id, patch), "Lead saved");
  };

  const setStage = (stage: CrmStage) => {
    if (stage === lead.stage) return;
    if (stage === "lost") { setLostOpen(true); return; }
    void run("stage", () => updateLead(lead.id, { stage }), `Moved to ${STAGE_LABEL[stage]}`);
  };

  const open = (detail?.followUps ?? []).filter((f) => !f.doneAt);
  const done = (detail?.followUps ?? []).filter((f) => f.doneAt);

  return (
    <Sheet open={Boolean(lead)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "max-h-[92vh] overflow-y-auto rounded-t-2xl p-4" : "w-full overflow-y-auto sm:max-w-lg"}
        data-testid="crm-lead-sheet"
      >
        <SheetHeader className="text-left">
          <SheetTitle data-no-translate className="pr-6 text-base leading-snug">{lead.title}</SheetTitle>
          <SheetDescription>
            {SOURCE_LABEL[lead.source]}
            {lead.closedAt ? ` · closed ${WHEN.format(new Date(lead.closedAt))}` : ` · since ${WHEN.format(new Date(lead.createdAt))}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* Stage */}
          <section>
            <label htmlFor="crm-stage" className="mb-1 block text-xs font-semibold text-gray-500">Stage</label>
            <select id="crm-stage" className={input} value={lead.stage} disabled={busy === "stage"}
              onChange={(e) => setStage(e.target.value as CrmStage)} data-testid="crm-stage-select">
              {CRM_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
            {lead.stage === "lost" && lead.lostReason && (
              <p className="mt-1 text-xs text-gray-500">Reason: <span data-no-translate>{lead.lostReason}</span></p>
            )}
            {(lead.buyerId || (lead.rfqId && !lead.closedAt)) && (
              <div className="mt-2 flex flex-wrap gap-3">
                {lead.buyerId && (
                  <Link to={`/chats/${lead.buyerId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-vendor hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" /> Chat with the buyer
                  </Link>
                )}
                {lead.rfqId && !lead.closedAt && (
                  <Link to="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-vendor hover:underline">
                    See it on Leads
                  </Link>
                )}
              </div>
            )}
          </section>

          {/* Details */}
          <section className="space-y-2.5">
            <div>
              <label htmlFor="crm-title" className="mb-1 block text-xs font-semibold text-gray-500">Name</label>
              <input id="crm-title" className={input} maxLength={200} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="crm-buyer" className="mb-1 block text-xs font-semibold text-gray-500">Buyer</label>
                <input id="crm-buyer" className={input} maxLength={120} placeholder="Company or person" value={form.buyerName}
                  onChange={(e) => setForm((f) => ({ ...f, buyerName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-value" className="mb-1 block text-xs font-semibold text-gray-500">Value (₹)</label>
                <input id="crm-value" className={input} inputMode="decimal" placeholder="Expected order value" value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} data-testid="crm-value" />
              </div>
            </div>
            <div>
              <label htmlFor="crm-tags" className="mb-1 block text-xs font-semibold text-gray-500">Tags, separated by commas</label>
              <input id="crm-tags" className={input} placeholder="export, repeat buyer" value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            </div>
            <button type="button" onClick={saveDetails} disabled={!changed || busy === "details" || !form.title.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-vendor px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              data-testid="crm-save-details">
              {busy === "details" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
            </button>
          </section>

          {/* Follow-ups */}
          <section data-testid="crm-follow-ups">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
              <CalendarClock className="h-3.5 w-3.5" /> Follow-ups
            </h3>
            {open.length === 0 && !isLoading && <p className="mb-2 text-xs text-gray-500">None planned.</p>}
            <ul className="space-y-1.5">
              {open.map((f) => {
                const overdue = new Date(f.dueAt).getTime() < Date.now();
                return (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2">
                    <button type="button" aria-label="Mark done" onClick={() => void run(`fu-${f.id}`, () => setFollowUpDone(f.id, true), "Marked done")}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 hover:border-brand-vendor" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold ${overdue ? "text-red-700" : "text-gray-900"}`}>{WHEN.format(new Date(f.dueAt))}{overdue ? " · overdue" : ""}</p>
                      {f.note && <p data-no-translate className="truncate text-xs text-gray-600">{f.note}</p>}
                    </div>
                    <button type="button" aria-label="Remove follow-up" onClick={() => void run(`fu-${f.id}`, () => deleteFollowUp(f.id))}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                );
              })}
              {done.slice(-3).map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-2.5 py-1 text-xs text-gray-400">
                  <Check className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate line-through">{WHEN.format(new Date(f.dueAt))}{f.note ? ` · ${f.note}` : ""}</span>
                  <button type="button" aria-label="Not done" onClick={() => void run(`fu-${f.id}`, () => setFollowUpDone(f.id, false))}
                    className="rounded p-1 hover:bg-gray-100 hover:text-gray-600"><Undo2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[auto_1fr_auto]">
              <input type="datetime-local" aria-label="When" className={`${input} col-span-2 sm:col-span-1`} value={due} onChange={(e) => setDue(e.target.value)} />
              <input aria-label="What to do" className={input} maxLength={280} placeholder="What to do" value={dueNote} onChange={(e) => setDueNote(e.target.value)} />
              <button type="button" disabled={!due || busy === "add-fu"}
                onClick={async () => { if (await run("add-fu", () => addFollowUp(lead.id, new Date(due), dueNote.trim()), "Follow-up planned")) setDueNote(""); }}
                className="rounded-lg border border-brand-vendor px-3 py-2 text-xs font-bold text-brand-vendor hover:bg-brand-vendor/5 disabled:opacity-40"
                data-testid="crm-add-follow-up">
                Plan
              </button>
            </div>
          </section>

          {/* Notes and history */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
              <StickyNote className="h-3.5 w-3.5" /> Notes and history
            </h3>
            <div className="flex gap-2">
              <textarea aria-label="New note" className={input} rows={2} maxLength={2000} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" disabled={!note.trim() || busy === "note"}
                onClick={async () => { if (await run("note", () => addNote(lead.id, note.trim()))) setNote(""); }}
                className="self-end rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-40"
                data-testid="crm-add-note">
                Add
              </button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
            ) : (
              <ol className="mt-3 space-y-2 border-l border-gray-200 pl-3" data-testid="crm-history">
                {(detail?.notes ?? []).map((n) => (
                  <li key={n.id} className="relative">
                    <span className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ${n.kind === "note" ? "bg-brand-vendor" : "bg-gray-300"}`} />
                    <p className={`text-xs ${n.kind === "note" ? "whitespace-pre-wrap text-gray-900" : "text-gray-600"}`} data-no-translate={n.kind === "note" ? true : undefined}>
                      {historyLine(n)}
                      {n.meta.reason && n.kind === "stage" ? <span className="text-gray-400">{` · ${n.meta.reason}`}</span> : null}
                    </p>
                    <p className="text-[11px] text-gray-400">{WHEN.format(new Date(n.createdAt))}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <button type="button" onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline">
            <Trash2 className="h-3.5 w-3.5" /> Remove from your CRM
          </button>
        </div>

        <AlertDialog open={lostOpen} onOpenChange={setLostOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Mark this lead lost?</AlertDialogTitle>
              <AlertDialogDescription>A reason helps you see later why deals slip. It's optional.</AlertDialogDescription>
            </AlertDialogHeader>
            <input className={input} aria-label="Reason" maxLength={200} placeholder="Price, timing, another supplier…" value={lostReason}
              onChange={(e) => setLostReason(e.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run("stage", () => updateLead(lead.id, { stage: "lost", lost_reason: lostReason.trim() || null }), "Marked lost")}>
                Mark lost
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this lead from your CRM?</AlertDialogTitle>
              <AlertDialogDescription>Its notes and follow-ups go with it. The requirement itself, and any quote you sent, stay as they are.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction className="bg-red-700 hover:bg-red-800"
                onClick={async () => { if (await run("delete", () => deleteLead(lead.id), "Removed")) onClose(); }}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
