import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders assistant markdown (links, lists, code, emphasis). */
export default function MarkdownMessage({ text }: { text: string }) {
  if (!text.trim()) return null;

  return (
    <div className="markdown-body text-[14px] leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
            >
              {children}
            </a>
          ),
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ className, children }) => {
            const block = Boolean(className);
            if (block) {
              return (
                <code className="block overflow-x-auto rounded-[8px] bg-field px-2.5 py-2 font-mono text-[12.5px] text-ink">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded-[4px] bg-field px-1 py-0.5 font-mono text-[12.5px] text-ink">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto last:mb-0">{children}</pre>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 text-[16px] font-semibold text-ink">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-[15px] font-semibold text-ink">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 text-[14px] font-semibold text-ink">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-line pl-3 text-ink-2 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-line" />,
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-[13px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-line px-2 py-1 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line/60 px-2 py-1">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
