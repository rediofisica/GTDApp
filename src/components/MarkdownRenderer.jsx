import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownRenderer({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={`text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words space-y-1.5 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
          ul: ({ node, className, ...props }) => {
            const isTaskList = className?.includes('contains-task-list');
            return (
              <ul
                {...props}
                className={`my-1 ${isTaskList ? 'list-none pl-0 space-y-1' : 'list-disc list-inside space-y-0.5 pl-1'}`}
              />
            );
          },
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-inside space-y-0.5 my-1 pl-1" />
          ),
          li: ({ node, className, children, ...props }) => {
            const isTask = className?.includes('task-list-item');
            return (
              <li
                {...props}
                className={`leading-snug ${isTask ? 'list-none flex items-start gap-2 my-0.5' : ''}`}
              >
                {children}
              </li>
            );
          },
          input: ({ node, ...props }) => {
            if (props.type === 'checkbox') {
              return (
                <input
                  {...props}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 accent-indigo-600 shrink-0 cursor-default"
                  readOnly
                  onClick={(e) => e.stopPropagation()}
                />
              );
            }
            return <input {...props} />;
          },
          p: ({ node, ...props }) => (
            <p {...props} className="my-1 first:mt-0 last:mb-0" />
          ),
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-semibold text-slate-900 dark:text-slate-100" />
          ),
          em: ({ node, ...props }) => (
            <em {...props} className="italic" />
          ),
          del: ({ node, ...props }) => (
            <del {...props} className="line-through opacity-70 text-slate-500 dark:text-slate-400" />
          ),
          table: ({ node, ...props }) => (
            <div
              className="overflow-x-auto my-2 rounded-lg border border-slate-200 dark:border-slate-700/80"
              onClick={(e) => e.stopPropagation()}
            >
              <table {...props} className="min-w-full divide-y divide-slate-200 dark:divide-slate-700/80 text-xs" />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead {...props} className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200" />
          ),
          tbody: ({ node, ...props }) => (
            <tbody {...props} className="divide-y divide-slate-200 dark:divide-slate-800/80 bg-white/50 dark:bg-slate-900/50" />
          ),
          tr: ({ node, ...props }) => (
            <tr {...props} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30" />
          ),
          th: ({ node, ...props }) => (
            <th {...props} className="px-2.5 py-1.5 text-left font-semibold text-slate-900 dark:text-slate-100" />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300" />
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
