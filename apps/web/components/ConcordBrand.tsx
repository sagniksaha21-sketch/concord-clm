import { Fragment } from 'react';

/** The product name stays selectable text, with one treatment at every scale. */
export function ConcordWordmark({ variant = 'inline' }: {
  variant?: 'inline' | 'display' | 'hero';
}) {
  return <span className={`concord-wordmark concord-wordmark--${variant}`}>Concord</span>;
}

/** Only use for authored UI copy; never transform account names or API records. */
export function ConcordText({ children }: { children: string }) {
  return <>{children.split(/\b(Concord)\b/g).map((part, index) => (
    <Fragment key={index}>{part === 'Concord' ? <ConcordWordmark /> : part}</Fragment>
  ))}</>;
}
