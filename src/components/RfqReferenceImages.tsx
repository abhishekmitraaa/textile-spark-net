import { useRfqAttachmentUrls } from "@/lib/queries/rfqs";

/**
 * A quote request's reference images. The request stores object paths in a private bucket (migration
 * 20261118130000), so the links are asked for here, for whoever is looking: the buyer, or the seller the request went
 * to. Nothing renders until they arrive.
 */
export function RfqReferenceImages({ stored }: { stored: string[] }) {
  const { data: urls = [] } = useRfqAttachmentUrls(stored);
  if (!urls.length) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {urls.map((src, i) => (
        <a key={src} href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={`Reference ${i + 1}`} className="h-12 w-12 rounded-md border border-gray-200 object-cover" />
        </a>
      ))}
    </span>
  );
}
