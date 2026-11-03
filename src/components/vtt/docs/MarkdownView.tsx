'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Sem `rehype-raw`: HTML dentro do .md aparece como texto, nunca como marcação. */
export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="prose prose-invert prose-sm mx-auto max-w-3xl break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
