import { Fragment } from "react";
import { Link } from "react-router-dom";
import type { PolicySection } from "@/data/privacyPolicy";

/**
 * Renders a legal page's sections (Privacy Policy, Refund Policy). The text is a legal record in English
 * (data-no-translate). A value still to be filled is written "[PLACEHOLDER: …]" and highlighted, so it can't
 * go unnoticed on the page.
 */
const PLACEHOLDER = /(\[PLACEHOLDER:[^\]]*\])/g;

function Text({ text }: { text: string }) {
  const parts = text.split(PLACEHOLDER);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[PLACEHOLDER:") ? (
          <mark key={i} className="rounded bg-amber-100 px-1 font-semibold text-amber-900">{part}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const P = ({ text }: { text: string }) => (
  <p className="mt-2 text-sm leading-relaxed text-gray-700"><Text text={text} /></p>
);

export function PolicyBody({ sections }: { sections: PolicySection[] }) {
  return (
    <div className="mt-6 space-y-6" data-no-translate>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-16">
          <h2 className="text-sm font-bold text-gray-900">{s.heading}</h2>
          {s.paragraphs?.map((p, i) => <P key={i} text={p} />)}
          {s.bulletsIntro && <P text={s.bulletsIntro} />}
          {s.bullets && (
            <ul className="mt-2 space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-gray-700">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-buyer" />
                  <span><Text text={b} /></span>
                </li>
              ))}
            </ul>
          )}
          {s.after?.map((p, i) => <P key={i} text={p} />)}
          {s.links && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {s.links.map((l) =>
                l.external ? (
                  <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">{l.label}</a>
                ) : (
                  <Link key={l.href} to={l.href} className="font-medium text-blue-600 hover:underline">{l.label}</Link>
                ),
              )}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
