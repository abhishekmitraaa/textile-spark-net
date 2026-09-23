import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  Field, inputCls, ProfileSubpageHeader, ProfileSignedOut, ProfileFormLoading, ProfileFormActions,
} from "@/components/buyer/ProfileEditKit";
import { useEditableProfile } from "@/hooks/useEditableProfile";
import { BUSINESS_TYPES, INDUSTRIES } from "@/lib/profileStore";
import { errorMessage } from "@/lib/errorMessage";

// /profile/business-details: the Business tab of the former Edit Profile modal,
// now a real route (2026-09-23). Same fields, same saveProfileFull() write, via
// the hook ProfileEdit.tsx also uses.

const ProfileBusinessDetails = () => {
  const navigate = useNavigate();
  const { signedOut, form, set, save } = useEditableProfile();
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save();
      toast.success("Business details updated");
      navigate("/profile");
    } catch (e) {
      toast.error("Couldn't save business details", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileSubpageHeader title="Business details" />
      {signedOut ? (
        <ProfileSignedOut />
      ) : (
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
          {!form ? (
            <ProfileFormLoading />
          ) : (
            <>
              <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
                <h2 className="text-sm font-bold text-gray-900">Business</h2>
                <Field label="Business Name" htmlFor="bd-name">
                  <input id="bd-name" className={inputCls} value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
                </Field>
                <Field label="Business Type" htmlFor="bd-type">
                  <select id="bd-type" className={inputCls} value={form.businessType} onChange={(e) => set({ businessType: e.target.value })}>
                    {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Website" htmlFor="bd-web">
                  <input id="bd-web" className={inputCls} value={form.website} onChange={(e) => set({ website: e.target.value })} />
                </Field>
                <Field label="Industry" htmlFor="bd-industry">
                  <select id="bd-industry" className={inputCls} value={form.industry} onChange={(e) => set({ industry: e.target.value })}>
                    {INDUSTRIES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
                <h2 className="text-sm font-bold text-gray-900">Business Address</h2>
                <Field label="Street Address" htmlFor="bd-street">
                  <input id="bd-street" className={inputCls} value={form.street} onChange={(e) => set({ street: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" htmlFor="bd-city">
                    <input id="bd-city" className={inputCls} value={form.businessCity} onChange={(e) => set({ businessCity: e.target.value })} />
                  </Field>
                  <Field label="State/Province" htmlFor="bd-state">
                    <input id="bd-state" className={inputCls} value={form.state} onChange={(e) => set({ state: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Postal Code" htmlFor="bd-postal">
                    <input id="bd-postal" className={inputCls} value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
                  </Field>
                  <Field label="Country" htmlFor="bd-country">
                    <input id="bd-country" className={inputCls} value={form.country} onChange={(e) => set({ country: e.target.value })} />
                  </Field>
                </div>
                <Field label="GSTIN" htmlFor="bd-gstin">
                  <input id="bd-gstin" className={inputCls} value={form.gstin} onChange={(e) => set({ gstin: e.target.value })} />
                </Field>
                <Field label="PAN Number" htmlFor="bd-pan">
                  <input id="bd-pan" className={inputCls} value={form.pan} onChange={(e) => set({ pan: e.target.value })} />
                </Field>
              </section>

              <ProfileFormActions saving={saving} onCancel={() => navigate("/profile")} onSave={onSave} />
            </>
          )}
        </div>
      )}
      <MobileBottomNav />
    </div>
  );
};

export default ProfileBusinessDetails;
