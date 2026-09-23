import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Shared by /profile/edit (ProfileEdit.tsx) and /profile/business-details
// (ProfileBusinessDetails.tsx), which replaced the Edit Profile modal on
// /profile (2026-09-23). These parts plus one hook (hooks/useEditableProfile.ts),
// so the two pages cannot drift into two versions of the same form.
// ─────────────────────────────────────────────────────────────

export const inputCls =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#ef4d62] transition-colors";

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function ProfileSubpageHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/profile")} aria-label="Back" className="-ml-1 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
      </div>
    </div>
  );
}

export function ProfileSignedOut() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto px-4 pt-24 pb-24 text-center">
      <h2 className="text-lg font-bold text-gray-900">You're signed out</h2>
      <p className="mt-1 text-sm text-gray-500">Sign in to edit your profile.</p>
      <button
        onClick={() => navigate("/login")}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#ef4d62] px-6 py-3 text-sm font-bold text-white hover:bg-[#ef4d62]/90 transition-colors"
      >
        Sign In
      </button>
    </div>
  );
}

export function ProfileFormLoading() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 flex items-center justify-center gap-2 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading your profile…
    </div>
  );
}

export function ProfileFormActions({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex gap-3">
      <button onClick={onCancel} disabled={saving} className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60">
        Cancel
      </button>
      <button onClick={onSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#ef4d62] hover:bg-[#ef4d62]/90 text-white text-sm font-bold transition-colors disabled:opacity-60">
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
