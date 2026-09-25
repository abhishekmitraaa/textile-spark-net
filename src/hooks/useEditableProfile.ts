import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileFull, saveProfileFull, profileChanges, uploadAvatar } from "@/lib/queries/profile";
import type { ProfileData } from "@/lib/profileStore";

// Shared by /profile/edit and /profile/business-details (see
// components/buyer/ProfileEditKit.tsx for their shared UI parts).

/**
 * The signed-in buyer's editable profile, its save and its photo upload.
 *
 * `form` stays null until the real row has loaded, and pages render no inputs
 * before then. It is seeded once: re-seeding on a refetch would wipe what the
 * buyer is typing.
 *
 * A save writes only what the buyer changed (MPF-9). `baseline` is the form as
 * it was seeded, and after each save, as it was saved; save() diffs the form
 * against it and sends just the fields that differ. A field emptied on purpose
 * differs, so it is saved as NULL. One left alone isn't sent at all.
 *
 * The photo shows the Google picture when none is stored. That is display
 * only: it's in the baseline too, so it becomes the stored avatar only if the
 * buyer picks a photo.
 */
export function useEditableProfile() {
  const { profile: authProfile, session, loading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const userId = authProfile?.id;
  const { data: dbProfile } = useProfileFull(userId);
  const meta = (session?.user?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  const googlePicture = meta.avatar_url || meta.picture || "";

  const [form, setForm] = useState<ProfileData | null>(null);
  const [baseline, setBaseline] = useState<ProfileData | null>(null);
  useEffect(() => {
    if (dbProfile && !form) {
      const seeded = { ...dbProfile, avatar: dbProfile.avatar || googlePicture };
      setForm(seeded);
      setBaseline(seeded);
    }
  }, [dbProfile, form, googlePicture]);

  const set = (patch: Partial<ProfileData>) => setForm((f) => (f ? { ...f, ...patch } : f));

  /** Saves the changed fields and returns how many there were (0 writes nothing). */
  const save = async (): Promise<number> => {
    if (!userId || !form || !baseline) throw new Error("Your profile hasn't loaded yet");
    const changes = profileChanges(baseline, form);
    const count = Object.keys(changes).length;
    if (!count) return 0;
    await saveProfileFull(userId, changes);
    setBaseline(form);
    await queryClient.invalidateQueries({ queryKey: ["profile_full", userId] });
    await refreshProfile();
    return count;
  };

  const uploadPhoto = async (file: File): Promise<string> => {
    if (!userId) throw new Error("Sign in to change your photo");
    return uploadAvatar(userId, file);
  };

  return { signedOut: !loading && !session, form, set, save, uploadPhoto };
}
