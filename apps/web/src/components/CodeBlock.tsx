import { useCallback, useState } from "react";

export default function CodeBlock({
  filename = "output.ts",
  language = "TypeScript",
  code,
}: {
  filename?: string;
  language?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="w-full max-w-95 overflow-hidden rounded-card bg-surface shadow-hairline">
      <div className="primitive-card-bar flex items-center justify-between border-b border-line">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[12px] font-medium text-ink">
            {filename}
          </span>
          <span className="text-[11.5px] text-ink-3">{language}</span>
        </span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={copy}
          className={`flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] font-medium transition-colors duration-100 hover:bg-hover ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto bg-inset px-3 py-2.5 font-mono text-[11.5px] leading-[1.7]">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="w-5 shrink-0 text-right text-[10.5px] leading-[1.86] text-ink-3/60 select-none">
              {i + 1}
            </span>
            <span className="pl-2.5 whitespace-pre text-ink-2">{line || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
