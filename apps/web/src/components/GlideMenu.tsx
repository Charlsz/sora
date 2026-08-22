import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type GlideMenuProps = {
  children: ReactNode;
  className?: string;
  highlightClassName?: string;
  rowSelector?: string;
};

/** Single sliding highlight behind hovered/active rows. */
export default function GlideMenu({
  children,
  className = "",
  highlightClassName = "rounded-[7px] bg-hover-2",
  rowSelector = "[data-row], [data-menu-row]",
}: GlideMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onMove = (event: PointerEvent) => {
      const target = (event.target as Element).closest(rowSelector);
      if (!target || !root.contains(target)) {
        setVisible(false);
        return;
      }
      const row = target as HTMLElement;
      setBox({ top: row.offsetTop, height: row.offsetHeight });
      setVisible(true);
    };
    const onLeave = () => setVisible(false);

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [rowSelector]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 z-0 ${highlightClassName}`}
        style={{
          top: box?.top ?? 0,
          height: box?.height ?? 0,
          opacity: visible && box ? 1 : 0,
          transition:
            "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
        }}
      />
      {children}
    </div>
  );
}
