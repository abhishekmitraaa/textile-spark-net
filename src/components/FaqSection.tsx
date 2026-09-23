import { MessageSquare, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useFaqs, type FaqSurface } from "@/lib/queries/faqs";

// One surface's admin-editable FAQs as a card with an accordion (Phase 9,
// 2026-09-23). Used on the vendor Subscription page. Built to be dropped into
// the vendor onboarding page once its placement is confirmed, as
// <FaqSection surface="seller_registration" />, with no query logic to rebuild.
// Buyer Help keeps its own layout and reads the same data through useFaqs().

export interface FaqContact {
  label: string;
  href: string;
  /** One line above the button, e.g. "Still have a question?". */
  hint?: string;
}

export function FaqSection({
  surface,
  title = "Frequently Asked Questions",
  description,
  contact,
}: {
  surface: FaqSurface;
  title?: string;
  description?: string;
  contact?: FaqContact;
}) {
  const { data: faqs, isPending, error } = useFaqs(surface);

  // No questions and nothing to contact: render nothing rather than an empty card.
  if (!isPending && !error && (faqs?.length ?? 0) === 0 && !contact) return null;

  return (
    <Card data-faq-surface={surface}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent" />
          <CardTitle>{title}</CardTitle>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading questions…</p>
        ) : error ? (
          <p className="text-sm text-muted-foreground">Questions couldn't be loaded right now.</p>
        ) : (
          faqs.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger className="text-left text-foreground hover:text-accent">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground whitespace-pre-line">{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )
        )}

        {contact && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">{contact.hint ?? "Still have a question?"}</p>
            <Button asChild variant="outline" size="sm">
              <a href={contact.href}>
                <Mail className="mr-1.5 h-4 w-4" /> {contact.label}
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
