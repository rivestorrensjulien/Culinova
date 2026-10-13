"use client";

import { cx } from "@culinova/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Fait apparaître son contenu en douceur quand il entre à l'écran. Sans JavaScript
 * ou avec « animations réduites », le contenu est affiché directement.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    // Déjà visible au chargement : rien à animer.
    if (rect.top < window.innerHeight * 0.9) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    const frame = window.requestAnimationFrame(() => {
      setState("hidden");
      observer.observe(node);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={state === "static" ? undefined : { transitionDelay: `${delay}ms` }}
      className={cx(
        state !== "static" && "transition-[opacity,transform] duration-700 ease-out",
        state === "hidden" && "translate-y-6 opacity-0",
        state === "shown" && "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
