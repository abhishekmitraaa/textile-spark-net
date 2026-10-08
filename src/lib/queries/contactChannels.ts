import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ─────────────────────────────────────────────────────────────
// Where Cosora reaches you, and your WhatsApp and SMS opt-ins (subscriptions P2,
// 2026-10-08).
//
// my_contact_channels() answers the masked addresses messages would go to (the business
// profile's owner email, else the sign-in email; the WhatsApp number, else the phone),
// whether delivery is switched on for this account (the notification_delivery switch),
// and the opt-ins. set_contact_consent() records an opt-in or opt-out, and every change is
// kept (admin.contact_consent_log): WhatsApp and SMS need it before anything is sent.
// ─────────────────────────────────────────────────────────────

export interface ContactChannels {
  deliveryOn: boolean;
  email: string | null;
  whatsapp: string | null;
  sms: string | null;
  consent: { whatsapp: boolean; sms: boolean };
}

interface Raw {
  delivery_on: boolean;
  email: string | null;
  whatsapp: string | null;
  sms: string | null;
  consent: { whatsapp: boolean; sms: boolean };
}

export function useContactChannels(enabled = true) {
  return useQuery({
    queryKey: ["contact_channels"],
    enabled,
    queryFn: async (): Promise<ContactChannels | null> => {
      const { data, error } = await supabase.rpc("my_contact_channels");
      // Before the P2 migration the function doesn't exist: show nothing.
      if (error?.code === "PGRST202") return null;
      if (error) throw error;
      const r = data as unknown as Raw;
      return { deliveryOn: Boolean(r.delivery_on), email: r.email, whatsapp: r.whatsapp, sms: r.sms, consent: r.consent };
    },
  });
}

export async function setContactConsent(channel: "whatsapp" | "sms", optedIn: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_contact_consent", { p_channel: channel, p_opted_in: optedIn, p_source: "vendor_settings" });
  if (error) throw error;
}
