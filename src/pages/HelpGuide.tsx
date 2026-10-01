import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { labelIn, useHelpGuides } from "@/lib/queries/support";
import { CallOrEmail, SupportFrame, useSupportSide } from "@/components/support/SupportFrame";

/**
 * A Quick Guide (plan P3d): written in Cosora-Admin's FAQs → Quick Guides, in
 * English with optional Hindi and Gujarati. Signed-out visitors read active guides
 * (help_guides_select_active). The body is one step per line; this page numbers them.
 * The guide's own text is already in the reader's language, so the page translator
 * leaves it alone (data-no-translate).
 */
export default function HelpGuide() {
  const { slug } = useParams<{ slug: string }>();
  const lang = useLang();
  const { accent } = useSupportSide();
  const guides = useHelpGuides();
  const g = guides.data?.find((x) => x.slug === slug);

  return (
    <SupportFrame title="Quick Guide">
      {guides.isPending ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !g ? (
        <p className="text-sm text-gray-600">This guide isn't available. <Link to="/help" className="underline">Back to Help</Link></p>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900" data-no-translate>{labelIn(g.title, lang)}</h2>
          <Card>
            <CardContent className="p-4">
              <ol className="space-y-3" data-no-translate>
                {labelIn(g.body, lang).split("\n").map((l) => l.trim()).filter(Boolean).map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-800">
                    <span className={cn("w-6 h-6 shrink-0 rounded-full text-xs font-bold text-white flex items-center justify-center", accent.bg)}>{i + 1}</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm text-gray-700">Still stuck?</p>
              <CallOrEmail />
            </CardContent>
          </Card>
        </div>
      )}
    </SupportFrame>
  );
}
