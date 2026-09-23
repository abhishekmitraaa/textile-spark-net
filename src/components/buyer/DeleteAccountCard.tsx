import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import {
  useOpenDeletionRequest,
  sendDeletionCode,
  confirmDeletion,
  cancelDeletion,
  deletionCopy,
  formatDeletionDate,
  type DeletionCopy,
} from "@/lib/queries/accountDeletion";

// The "Delete my account" block on /profile/help. It replaces a button that only
// toasted "Delete account request submitted" and did nothing (2026-09-23).
//
// States: signed out → sign in first. Scheduled → the date and a Cancel button
// (the same banner lives on /profile). A code already sent → the dialog opens on
// the code step. Otherwise → an explanation first, then the code.

const CODE_LENGTH = 6;

export function DeleteAccountCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: open, isPending } = useOpenDeletionRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"explain" | "code">("explain");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<DeletionCopy | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["account_deletion", user?.id] });

  const openDialog = () => {
    if (!user) {
      toast("Sign in to delete your account");
      navigate("/auth/login");
      return;
    }
    setProblem(null);
    setCode("");
    // A code from earlier is still waiting: go straight to entering it.
    setStep(open?.status === "pending_confirmation" ? "code" : "explain");
    setDialogOpen(true);
  };

  const onSendCode = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await sendDeletionCode();
      if (r.status === "sent") {
        setSentTo(r.to ?? null);
        setCode("");
        setStep("code");
        void refresh();
      } else {
        setProblem(deletionCopy(r));
        if (r.status === "already_scheduled") void refresh();
      }
    } catch (e) {
      setProblem({ title: "We couldn't send the code", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (code.length !== CODE_LENGTH) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await confirmDeletion(code);
      if (r.status === "scheduled") {
        await refresh();
        setDialogOpen(false);
        toast.success("Your account is scheduled for deletion", {
          description: `On ${formatDeletionDate(r.scheduled_for)}. You can cancel from your profile until then.`,
        });
        navigate("/profile");
      } else {
        setProblem(deletionCopy(r));
        setCode("");
      }
    } catch (e) {
      setProblem({ title: "We couldn't confirm the code", description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const onCancelScheduled = async () => {
    setBusy(true);
    try {
      const r = await cancelDeletion();
      await refresh();
      if (r.status === "cancelled") toast.success("Account deletion cancelled");
      else toast.error(deletionCopy(r).title);
    } catch (e) {
      toast.error("We couldn't cancel the deletion", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (user && !isPending && open?.status === "cooling_off") {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-4">
        <p className="text-xs text-gray-600 mb-2">
          Your account is scheduled for deletion on{" "}
          <span className="font-semibold text-gray-900">{formatDeletionDate(open.scheduledFor)}</span>.
        </p>
        <button
          onClick={onCancelScheduled}
          disabled={busy}
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
        >
          {busy ? "Cancelling…" : "Cancel deletion"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs text-gray-500 mb-2">Do you want to delete your account?</p>
        <button
          onClick={openDialog}
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Delete my account
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!busy) setDialogOpen(v); }}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{step === "explain" ? "Delete your account?" : "Enter your code"}</DialogTitle>
          </DialogHeader>

          {step === "explain" ? (
            <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
              <li>We'll email a 6-digit code to the email address on your account. Enter it to confirm.</li>
              <li>Your account is deleted <span className="font-semibold">14 days</span> after that. Until then you can cancel from your profile.</li>
              <li>Deleting removes your name, email, phone, photo and business details, and signs you out everywhere.</li>
              <li>Your requests, quotes, chats and reviews stay with the sellers you dealt with, shown as “Deleted user”.</li>
            </ul>
          ) : (
            <div>
              <p className="text-sm text-gray-700 mb-4">
                We sent a code to <span className="font-semibold">{sentTo ?? "your email"}</span>. It expires in 10 minutes.
              </p>
              <InputOTP
                maxLength={CODE_LENGTH}
                value={code}
                onChange={(v) => { setCode(v.replace(/\D/g, "")); setProblem(null); }}
                inputMode="numeric"
                autoFocus
                containerClassName="justify-center mb-2"
                aria-label="Deletion code"
              >
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className={cn(
                        "w-9 h-11 text-lg font-bold rounded-lg border-0 border-b-2 first:border-l-0 first:rounded-l-lg last:rounded-r-lg",
                        code[i] ? "border-red-600 text-gray-900" : "border-gray-300 text-gray-400",
                      )}
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <button
                onClick={onSendCode}
                disabled={busy}
                className="mx-auto block text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-60"
              >
                Send a new code
              </button>
            </div>
          )}

          {problem && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <div className="text-xs text-red-700">
                <p className="font-semibold">{problem.title}</p>
                {problem.description && <p>{problem.description}</p>}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDialogOpen(false)}
              disabled={busy}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Keep my account
            </button>
            {step === "explain" ? (
              <button
                onClick={onSendCode}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Email me a code
              </button>
            ) : (
              <button
                onClick={onConfirm}
                disabled={busy || code.length !== CODE_LENGTH}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Delete my account
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
