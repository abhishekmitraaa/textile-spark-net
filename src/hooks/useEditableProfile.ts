import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileFull, saveProfileFull, uploadAvatar } from "@/lib/queries/profile";
import type { ProfileData } from "@/lib/profileStore";

// Shared by /profile/edit and /profile/business-details (see
// components/buyer/ProfileEditKit.tsx for their shared UI parts).

/**
 * The signed-in buyer's editable profile, and the same save and upload the modal
 * used: saveProfileFull() and uploadAvatar(), unchanged.
 *
 * `form` stays null until the real row has loaded, and pages render no inputs
 * before then. saveProfileFull() writes EVERY field, so a form seeded from blanks
 * and saved early would overwrite real data. It is seeded once: re-seeding on a
 * refetch would wipe what the buyer is typing.
 *
 * The photo falls back to the Google picture, as the modal did, so saving
 * adopts it as the stored avatar exactly as before.
 */
export function useEditableProfile() {
  const { profile: authProfile, session, loading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const userId = authProfile?.id;
  const { data: dbProfile } = useProfileFull(userId);
  const meta = (session?.user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  const googlePicture = meta.avatar_url || meta.picture || "";

  const [form, setForm] = useState<ProfileData | null>(null);
  useEffect(() => {
    if (dbProfile && !form) setForm({ ...dbProfile, avatar: dbProfile.avatar || googlePicture });
  }, [dbProfile, form, googlePicture]);

  const set = (patch: Partial<ProfileData>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    if (!userId || !form) throw new Error("Your profile hasn't loaded yet");
    await saveProfileFull(userId, form);
    await queryClient.invalidateQueries({ queryKey: ["profile_full", userId] });
    await refreshProfile();
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    if (!userId) throw new Error("Sign in to change your photo");
    return uploadAvatar(userId, file);
  };

  return { signedOut: !loading && !session, form, set, save, uploadPhoto };
}
