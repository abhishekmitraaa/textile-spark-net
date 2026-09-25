import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, saveSetting, DEFAULT_SETTINGS } from "@/lib/queries/profile";
import { useProfileState, updateRegional } from "@/lib/profileStore";

/**
 * The one currency setting (MPF-11): buyer_profiles.regional.currency when signed
 * in, the device's Regional Settings when signed out. The buyer menu drawer reads
 * and writes it here; Regional Settings writes the same field together with its
 * other regional fields. One real setting, not two. DisplayCurrencyContext reads
 * the same value to convert prices.
 *
 * `ready` is false until a signed-in buyer's settings have loaded: saving before
 * then would write the defaults over their timezone and language.
 */
export function useCurrencySetting() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useSettings(user?.id);
  const { regional } = useProfileState();

  const value = user ? (settings?.regional ?? DEFAULT_SETTINGS.regional).currency : regional.currency;
  const ready = !user || Boolean(settings);

  const save = async (currency: string): Promise<void> => {
    if (!user) {
      updateRegional({ currency });
      return;
    }
    if (!settings) throw new Error("Your settings are still loading. Try again in a moment.");
    await saveSetting(user.id, "regional", { ...settings.regional, currency });
    await queryClient.invalidateQueries({ queryKey: ["profile_settings", user.id] });
  };

  return { value, ready, save };
}
