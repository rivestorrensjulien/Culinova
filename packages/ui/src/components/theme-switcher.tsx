"use client";

import { useEffect, useState } from "react";
import { cx } from "../cx";
import { applyTheme, readThemePreference, type ThemePreference } from "../theme";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
  { value: "system", label: "Système" },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    setTheme(readThemePreference());
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Thème"
      className={cx("inline-flex rounded-full border border-border bg-surface p-1", className)}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          onClick={() => {
            applyTheme(option.value);
            setTheme(option.value);
          }}
          className={cx(
            "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
            theme === option.value ? "bg-foreground text-background" : "text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
