import { useEffect, useState } from "react";

const WORD_MS = 28;

export default function StreamingText({
  text,
  fill = true,
  animate = true,
}: {
  text: string;
  fill?: boolean;
  animate?: boolean;
}) {
  const words = text.trim() ? text.split(/(\s+)/) : [];
  const [count, setCount] = useState(animate ? 0 : words.length);
  const done = count >= words.length;

  useEffect(() => {
    setCount(animate ? 0 : words.length);
  }, [text, animate, words.length]);

  useEffect(() => {
    if (!animate || done) return;
    const t = setTimeout(() => setCount((c) => c + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [animate, count, done]);

  return (
    <div className={fill ? "w-full" : "w-full max-w-95"}>
      <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
        {words.slice(0, count).join("")}
        {!done && (
          <span
            className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink"
            style={{ animation: "fade-in 150ms ease-out both" }}
          />
        )}
      </p>
    </div>
  );
}
