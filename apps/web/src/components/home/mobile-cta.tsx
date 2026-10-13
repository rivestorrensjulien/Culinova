"use client";

import { buttonClasses, cx } from "@culinova/ui";
import { useEffect, useState } from "react";

/**
 * Sur téléphone : bouton « Demander une invitation » collé en bas de l'écran, affiché
 * après l'accroche et masqué quand le formulaire est à l'écran.
 */
export function MobileCta({ label }: { label: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.8);
    window.addEventListener("scroll", onScroll, { passive: true });
    const form = document.getElementById("invitation");
    const observer = form
      ? new IntersectionObserver((entries) => setFormVisible(entries.some((e) => e.isIntersecting)))
      : null;
    if (form) observer?.observe(form);
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  const shown = scrolled && !formVisible;
  return (
    <div
      aria-hidden={!shown}
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur transition-transform duration-300 md:hidden",
        shown ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <a
        href="#invitation"
        tabIndex={shown ? 0 : -1}
        className={cx(buttonClasses("primary", "lg"), "w-full")}
      >
        {label}
      </a>
    </div>
  );
}
