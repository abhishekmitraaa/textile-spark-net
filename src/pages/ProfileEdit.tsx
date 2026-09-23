import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Loader2, Upload } from "lucide-react";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import {
  Field, inputCls, ProfileSubpageHeader, ProfileSignedOut, ProfileFormLoading, ProfileFormActions,
} from "@/components/buyer/ProfileEditKit";
import { useEditableProfile } from "@/hooks/useEditableProfile";
import { errorMessage } from "@/lib/errorMessage";
import noUserPicture from "@/assets/Buyer/profile section/No user Picture.jpg";

// /profile/edit: photo + personal details. It was the Photo and Personal tabs of
// the Edit Profile modal on /profile, now a real route that survives a refresh
// or a shared link (2026-09-23). Business details are at /profile/business-details.
//
// The modal's email "Verify" did not come across: it sent nothing and accepted
// any 4-digit code, and its "Verified" badge showed for any email typed in.
// That is a status nobody earned, which this project removes on sight
// (claude.md, "Business Rules — Discovered"). Email here is a plain field.

const ProfileEdit = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signedOut, form, set, save, uploadPhoto } = useEditableProfile();
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadPhoto(file);
      set({ avatar: url });
      toast.success("Photo uploaded — press Save Changes to apply");
    } catch (err) {
      toast.error("Upload failed", { description: errorMessage(err) });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save();
      toast.success("Profile updated");
      navigate("/profile");
    } catch (e) {
      toast.error("Couldn't save profile", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileSubpageHeader title="Edit profile" />
      {signedOut ? (
        <ProfileSignedOut />
      ) : (
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 space-y-4">
          {!form ? (
            <ProfileFormLoading />
          ) : (
            <>
              {/* PHOTO */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Photo</h2>
                <div className="flex flex-col items-center text-center">
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                  <button type="button" onClick={() => photoRef.current?.click()} disabled={uploadingPhoto} className="relative" aria-label="Change photo">
                    <img src={form.avatar || noUserPicture} alt="Profile" className="w-28 h-28 rounded-full object-cover bg-gray-100" />
                    <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#ef4d62] flex items-center justify-center">
                      {uploadingPhoto ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
                    </span>
                  </button>
                  <p className="text-xs text-gray-500 mt-3">Tap the photo to change it</p>
                  <button
                    onClick={() => photoRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-300 transition-colors disabled:opacity-60"
                  >
                    <Upload className="w-4 h-4" /> {uploadingPhoto ? "Uploading…" : "Upload New Photo"}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-2">Recommended: Square image, at least 200x200px</p>
                </div>
              </section>

              {/* PERSONAL */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
                <h2 className="text-sm font-bold text-gray-900">Personal details</h2>
                <Field label="Full Name" htmlFor="pe-name">
                  <input id="pe-name" className={inputCls} value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} />
                </Field>
                <Field label="Email Address" htmlFor="pe-email">
                  <input id="pe-email" type="email" className={inputCls} value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </Field>
                <Field label="Phone Number" htmlFor="pe-phone">
                  <input id="pe-phone" className={inputCls} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
                </Field>
                <Field label="City" htmlFor="pe-city">
                  <input
                    id="pe-city"
                    className={inputCls}
                    value={form.city}
                    onChange={(e) => set({ city: e.target.value })}
                    autoFocus={params.get("focus") === "city"}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Job Title" htmlFor="pe-job">
                    <input id="pe-job" className={inputCls} value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
                  </Field>
                  <Field label="Department" htmlFor="pe-dept">
                    <input id="pe-dept" className={inputCls} value={form.department} onChange={(e) => set({ department: e.target.value })} />
                  </Field>
                </div>
              </section>

              <ProfileFormActions saving={saving || uploadingPhoto} onCancel={() => navigate("/profile")} onSave={onSave} />
            </>
          )}
        </div>
      )}
      <MobileBottomNav />
    </div>
  );
};

export default ProfileEdit;
