import { useEffect, useRef, useState } from "react";

const WORDS_PER_FRAME = 5;

/**
 * Renders assistant text. Growing streams (SSE deltas) must not restart the
 * word animation — that caused the “writing” flicker/reset bug.
 */
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
  const prevTextRef = useRef("");

  useEffect(() => {
    if (!animate) {
      setCount(words.length);
      prevTextRef.current = text;
      return;
    }

    const prev = prevTextRef.current;
    // Stream growth: keep showing everything already typed, no reset.
    if (prev && text.startsWith(prev)) {
      setCount(words.length);
      prevTextRef.current = text;
      return;
    }

    prevTextRef.current = text;
    let cancelled = false;
    let shown = 0;
    setCount(0);
    const tick = () => {
      if (cancelled) return;
      shown = Math.min(words.length, shown + WORDS_PER_FRAME);
      setCount(shown);
      if (shown < words.length) requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [animate, text, words.length]);

  const done = count >= words.length;

  return (
    <div className={fill ? "w-full motion-gpu" : "motion-gpu"}>
      <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">
        {words.slice(0, count).join("")}
        {!done && (
          <span className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink" />
        )}
      </p>
    </div>
  );
}
