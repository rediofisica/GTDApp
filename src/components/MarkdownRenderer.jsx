import React from 'react';
import ReactMarkdown from 'react-markdown';

export default function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words space-y-1.5 ${className}`}>
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:text-indigo-400 underline font-medium"
              onClick={(e) => e.stopPropagation()}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc list-inside space-y-0.5 my-1 pl-1" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-inside space-y-0.5 my-1 pl-1" />
          ),
          li: ({ node, ...props }) => (
            <li {...props} className="leading-snug" />
          ),
          p: ({ node, ...props }) => (
            <p {...props} className="my-1 first:mt-0 last:mb-0" />
          ),
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-semibold text-slate-900 dark:text-slate-100" />
          ),
          em: ({ node, ...props }) => (
            <em {...props} className="italic" />
          ),
          code: ({ node, inline, className, children, ...props }) => (
            <code
              {...props}
              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-indigo-600 dark:text-indigo-300 border border-slate-200 dark:border-slate-700/60"
            >
              {children}
            </code>
          ),
          pre: ({ node, ...props }) => (
            <pre
              {...props}
              className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/90 overflow-x-auto text-[11px] font-mono my-1.5 border border-slate-200 dark:border-slate-700/60"
              onClick={(e) => e.stopPropagation()}
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="border-l-2 border-indigo-500 pl-2.5 italic text-slate-500 dark:text-slate-400 my-1"
            />
          ),
          h1: ({ node, ...props }) => (
            <h1 {...props} className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-2 mb-1" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="font-bold text-xs text-slate-900 dark:text-slate-100 mt-1.5 mb-0.5" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="font-semibold text-xs text-slate-800 dark:text-slate-200 mt-1 mb-0.5" />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
