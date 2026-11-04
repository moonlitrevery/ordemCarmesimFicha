import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    blockquote: ({ children }) => (
      <blockquote className="not-prose my-6 rounded-md border-l-4 border-crimson bg-crimson/10 px-4 py-3 italic text-ink-muted">
        {children}
      </blockquote>
    ),
  };
}