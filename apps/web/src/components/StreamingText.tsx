import { useEffect, useState } from "react";

const WORDS_PER_FRAME = 5;

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

  useEffect(() => {
    if (!animate) {
      setCount(words.length);
      return;
    }
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
    <div className={fill ? "w-full motion-gpu" : "w-full max-w-95 motion-gpu"}>
      <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
        {words.slice(0, count).join("")}
        {!done && (
          <span className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink" />
        )}
      </p>
    </div>
  );
}
