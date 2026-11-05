import type { MDXComponents } from 'mdx/types';
import { ElementSymbol } from '@/components/elements/ElementSymbol';
import { ElementsTable } from '@/components/content/ElementsTable';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    // `<ElementSymbol element="fogo" />` sem import; no texto, inline e decorativo
    // (o nome do elemento vem escrito logo depois).
    ElementSymbol: (props: Parameters<typeof ElementSymbol>[0]) => (
      <ElementSymbol inline={props.size === undefined} decorative {...props} />
    ),
    ElementsTable,
    blockquote: ({ children }) => (
      <blockquote className="not-prose my-6 rounded-md border-l-4 border-crimson bg-crimson/10 px-4 py-3 italic text-ink-muted">
        {children}
      </blockquote>
    ),
  };
}
