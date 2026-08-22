export type ContextChunk = {
  title: string;
  chars?: string;
  body: string;
  source?: string;
  badge?: string;
};

export default function ContextCards({ chunks }: { chunks: ContextChunk[] }) {
  if (!chunks.length) {
    return (
      <p className="text-[13px] text-ink-3">
        Context from tools and skills will appear here.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-[13px] font-semibold text-ink">Context</span>
        <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline tabular-nums">
          {chunks.length}
        </span>
      </div>

      {chunks.map((chunk, i) => (
        <div
          key={`${chunk.title}-${i}`}
          className="overflow-hidden rounded-card bg-surface shadow-card"
          style={{
            animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 100}ms both`,
          }}
        >
          <div className="primitive-card-bar flex items-center gap-2.5 border-b border-line">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
              <span className="truncate">{chunk.title}</span>
            </span>
            {chunk.chars && (
              <span className="ml-auto shrink-0 text-[12px] text-ink-3 tabular-nums">
                {chunk.chars}
              </span>
            )}
          </div>
          <p className="px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2">
            {chunk.body}
          </p>
          {chunk.source && (
            <div className="px-3 pb-3">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn">
                {chunk.badge && (
                  <span className="flex size-3.5 items-center justify-center rounded-[4px] bg-accent text-[7px] font-bold text-white">
                    {chunk.badge}
                  </span>
                )}
                {chunk.source}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
