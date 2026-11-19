import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessage";
import { SOCIAL_PLATFORMS, normaliseSocialLink } from "@/lib/socialLinks";

interface Card { name: string; company: string | null; city: string | null; member_since: string }


/**
 * The buyer a seller is chatting with (Seller Home audit SH-107; Mitra, 2026-11-17, "Small buyer card"): name,
 * company, city and member since, from chat_buyer_card(), which answers only to the other person in the conversation
 * and never while either has blocked the other. "View Buyer Profile" used to open /vendor/<buyer>, "Seller not found".
 */
export function BuyerCard({ buyerId, open, onOpenChange }: { buyerId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({
    queryKey: ["chat_buyer_card", buyerId],
    queryFn: async (): Promise<Card | null> => {
      const { data, error } = await supabase.rpc("chat_buyer_card", { p_other: buyerId });
      if (error) throw error;
      return ((data ?? []) as Card[])[0] ?? null;
    },
    enabled: open && Boolean(buyerId),
  });
  // The buyer's own web links (Mitra, 2026-11-19, review M-50), under the same rule as the card.
  const links = useQuery({
    queryKey: ["chat_buyer_social", buyerId],
    queryFn: async (): Promise<[string, string][]> => {
      const { data, error } = await supabase.rpc("chat_buyer_social", { p_other: buyerId });
      if (error) throw error;
      // The seller's link rules again (chat_buyer_social applies them too): each link under its own platform.
      return Object.entries((data ?? {}) as Record<string, string>)
        .map(([key, url]): [string, string | null] => [key, normaliseSocialLink(key, url)])
        .filter((e): e is [string, string] => e[1] !== null);
    },
    enabled: open && Boolean(buyerId),
  });
  const card = q.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="buyer-card">
        <DialogHeader>
          <DialogTitle>Buyer</DialogTitle>
          <DialogDescription>What this buyer shares with sellers on Cosora.</DialogDescription>
        </DialogHeader>
        {q.isPending ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : q.error ? (
          <p className="text-sm text-red-600">{errorMessage(q.error)}</p>
        ) : !card ? (
          <p className="text-sm text-gray-600">This buyer's details aren't available.</p>
        ) : (
          <dl className="divide-y divide-gray-100 text-sm">
            <div className="flex justify-between gap-4 py-2"><dt className="text-gray-500">Name</dt><dd className="font-medium text-gray-900" data-no-translate>{card.name}</dd></div>
            {card.company && <div className="flex justify-between gap-4 py-2"><dt className="text-gray-500">Company</dt><dd className="font-medium text-gray-900" data-no-translate>{card.company}</dd></div>}
            {card.city && <div className="flex justify-between gap-4 py-2"><dt className="text-gray-500">City</dt><dd className="font-medium text-gray-900" data-no-translate>{card.city}</dd></div>}
            {(links.data ?? []).length > 0 && (
              <div className="py-2">
                <dt className="text-gray-500">Online</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {(links.data ?? []).map(([key, url]) => (
                    <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow ugc"
                      className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-brand-vendor hover:underline">
                      {SOCIAL_PLATFORMS.find((p) => p.key === key)?.label ?? "Link"}
                    </a>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-2"><dt className="text-gray-500">On Cosora since</dt><dd className="font-medium text-gray-900">{new Date(card.member_since).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</dd></div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
