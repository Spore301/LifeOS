'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
  className?: string;
  variant?: 'light' | 'dark';
}

/**
 * Renders chat message content as GitHub-flavored Markdown (headings, lists,
 * emphasis, links, tables, task lists, inline & fenced code with language hints).
 * `variant` controls the color scheme so it works on both the light assistant
 * bubble and the dark-indigo user bubble.
 */
export default function Markdown({ children, className = '', variant = 'light' }: MarkdownProps) {
  const dark = variant === 'dark';
  const base = dark ? 'text-white' : 'text-slate-800';

  return (
    <div className={`markdown-body text-sm leading-relaxed ${base} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className={`text-lg font-bold mt-3 mb-1.5 ${dark ? 'text-white' : 'text-slate-900'}`} {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className={`text-base font-bold mt-3 mb-1.5 ${dark ? 'text-white' : 'text-slate-900'}`} {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className={`text-sm font-bold mt-2.5 mb-1 ${dark ? 'text-white' : 'text-slate-900'}`} {...props} />
          ),
          p: ({ node, ...props }) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-1.5 space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-1.5 space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          strong: ({ node, ...props }) => (
            <strong className={dark ? 'font-semibold text-white' : 'font-semibold text-slate-900'} {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          del: ({ node, ...props }) => <del className="line-through opacity-70" {...props} />,
          a: ({ node, ...props }) => (
            <a
              className={dark ? 'text-indigo-200 underline hover:text-white' : 'text-indigo-600 underline hover:text-indigo-800'}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          hr: ({ node, ...props }) => (
            <hr className={`my-3 border-t ${dark ? 'border-indigo-400/30' : 'border-slate-200'}`} {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className={`border-l-4 pl-3 my-2 italic ${dark ? 'border-indigo-400/40 text-indigo-200' : 'border-slate-300 text-slate-500'}`}
              {...props}
            />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const content = String(children).replace(/\n$/, '');

            if (inline) {
              return (
                <code
                  className={`px-1.5 py-0.5 rounded text-[0.85em] font-mono ${
                    dark ? 'bg-white/15 text-white' : 'bg-slate-100 text-rose-600'
                  }`}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <div className={`my-2.5 rounded-lg overflow-hidden ${dark ? 'bg-black/30' : 'bg-slate-950'}`}>
                {lang && (
                  <div className={`px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${dark ? 'bg-white/10 text-indigo-200' : 'bg-slate-800 text-slate-400'}`}>
                    {lang}
                  </div>
                )}
                <pre className={`p-3 overflow-x-auto text-xs leading-relaxed font-mono ${dark ? 'text-indigo-100' : 'text-slate-100'}`}>
                  <code className="font-mono" {...props}>
                    {content}
                  </code>
                </pre>
              </div>
            );
          },
          table: ({ node, ...props }) => (
            <div className="my-2.5 overflow-x-auto">
              <table className={`w-full text-xs border-collapse ${dark ? 'text-white' : 'text-slate-800'}`} {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className={dark ? 'text-white' : 'text-slate-700'} {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className={`px-2 py-1 text-left font-semibold border ${dark ? 'border-indigo-400/30 bg-white/10' : 'border-slate-300 bg-slate-100'}`}
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className={`px-2 py-1 border ${dark ? 'border-indigo-400/30' : 'border-slate-200'}`} {...props} />
          ),
          input: ({ node, checked, ...props }: any) => (
            <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 accent-indigo-600 align-middle" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
