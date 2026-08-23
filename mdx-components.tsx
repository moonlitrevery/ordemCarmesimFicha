import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => (
      <h1 className="font-display text-3xl text-parchment mb-4 mt-8" {...props} />
    ),
    h2: (props) => (
      <h2 className="font-display text-2xl text-parchment mb-3 mt-8 border-b border-ink-border pb-2" {...props} />
    ),
    h3: (props) => (
      <h3 className="font-display text-xl text-parchment mb-2 mt-6" {...props} />
    ),
    p: (props) => <p className="mb-4 leading-relaxed text-parchment/85" {...props} />,
    ul: (props) => <ul className="mb-4 list-disc pl-6 space-y-1 text-parchment/85" {...props} />,
    ol: (props) => <ol className="mb-4 list-decimal pl-6 space-y-1 text-parchment/85" {...props} />,
    li: (props) => <li className="leading-relaxed" {...props} />,
    a: (props) => (
      <a className="text-crimson-soft underline underline-offset-2 hover:text-crimson-glow" {...props} />
    ),
    blockquote: (props) => (
      <blockquote className="border-l-2 border-crimson/60 pl-4 italic text-ink-muted my-4" {...props} />
    ),
    code: (props) => (
      <code className="rounded bg-ink-raised px-1.5 py-0.5 text-sm text-crimson-glow" {...props} />
    ),
    ...components,
  };
}
