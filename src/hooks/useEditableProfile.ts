import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProfileFull, saveProfileFull, profileChanges, uploadAvatar, shrinkAvatar, removeOwnAvatar } from "@/lib/queries/profile";
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
 *
 * A picked photo is shrunk and shown at once, and uploaded only when the buyer saves (review L-48: it was uploaded at
 * full size on pick, and left in Storage when the page was left unsaved). A save that fails removes the upload; one that
 * succeeds removes the photo it replaced.
 */
export function useEditableProfile() {
  const { profile: authProfile, session, loading, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const userId = authProfile?.id;
  const profileQuery = useProfileFull(userId);
  const dbProfile = profileQuery.data;
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

  // The picked photo, shrunk, waiting for Save; `preview` is a local address for showing it.
  const [photo, setPhoto] = useState<{ blob: Blob; ext: string; preview: string } | null>(null);
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  /** Shrinks a picked photo and shows it; nothing is uploaded until save(). */
  const pickPhoto = async (file: File): Promise<void> => {
    if (!userId) throw new Error("Sign in to change your photo");
    const shrunk = await shrinkAvatar(file);
    const preview = URL.createObjectURL(shrunk.blob);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = preview;
    setPhoto({ ...shrunk, preview });
  };

  /** Saves the changed fields and returns how many there were (0 writes nothing). */
  const save = async (): Promise<number> => {
    if (!userId || !form || !baseline) throw new Error("Your profile hasn't loaded yet");
    let uploaded: string | null = null;
    let next = form;
    if (photo) {
      uploaded = await uploadAvatar(userId, photo);
      next = { ...form, avatar: uploaded };
    }
    const changes = profileChanges(baseline, next);
    const count = Object.keys(changes).length;
    if (!count) return 0;
    try {
      await saveProfileFull(userId, changes);
    } catch (e) {
      if (uploaded) void removeOwnAvatar(userId, uploaded);
      throw e;
    }
    if (uploaded) void removeOwnAvatar(userId, baseline.avatar);
    setForm(next);
    setBaseline(next);
    setPhoto(null);
    await queryClient.invalidateQueries({ queryKey: ["profile_full", userId] });
    await refreshProfile();
    return count;
  };

  return {
    signedOut: !loading && !session,
    form,
    set,
    save,
    pickPhoto,
    /** The photo to show: the picked one, else the saved one. */
    photoSrc: photo?.preview ?? form?.avatar ?? "",
    photoPending: Boolean(photo),
    // A failed read is said as such, with Retry, never an endless spinner (review L-41).
    loadFailed: Boolean(userId) && profileQuery.isError && !dbProfile,
    retry: () => void profileQuery.refetch(),
  };
}
