"use client";

import { cx } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { normalize } from "@/lib/library-search";
import { commandIndexAction } from "@/server/actions/library";

interface Item {
  key: string;
  label: string;
  hint: string;
  href: string;
}

const PAGES = [
  { key: "dashboard", href: "/app" },
  { key: "create", href: "/app/creer" },
  { key: "recipes", href: "/app/recettes" },
  { key: "bases", href: "/app/bases" },
  { key: "menus", href: "/app/menus" },
  { key: "shopping", href: "/app/courses" },
  { key: "ingredients", href: "/app/ingredients" },
  { key: "settings", href: "/app/reglages" },
  { key: "account", href: "/app/compte" },
  { key: "security", href: "/app/compte/securite" },
] as const;

/** Recherche rapide (Ctrl+K ou ⌘K) : recettes, bases et pages de l'application. */
export function CommandPalette() {
  const t = useTranslations("Command");
  const nav = useTranslations("App.nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; kind: "dish" | "base" }> | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);

  const show = useCallback(async () => {
    setOpen(true);
    setQuery("");
    setActive(0);
    // Liste rechargée à chaque ouverture : une recette créée entre-temps y figure.
    const list = await commandIndexAction().catch(() => null);
    if (list) setRecipes(list);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void show();
      }
    };
    const onOpen = () => void show();
    window.addEventListener("keydown", onKey);
    window.addEventListener("culinova:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("culinova:command", onOpen);
    };
  }, [show]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...(recipes ?? []).map((r) => ({
        key: r.id,
        label: r.name,
        hint: r.kind === "base" ? t("base") : t("recipe"),
        href: `/app/recettes/${r.id}`,
      })),
      ...PAGES.map((p) => ({ key: p.key, label: nav(p.key), hint: t("page"), href: p.href })),
    ];
    const words = normalize(query).split(" ").filter(Boolean);
    if (words.length === 0) return all.slice(0, 12);
    return all.filter((item) => words.every((w) => normalize(item.label).includes(w))).slice(0, 12);
  }, [recipes, query, nav, t]);

  if (!open) return null;

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-lifted"
        data-testid="command-palette"
      >
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          className="h-14 w-full border-b border-border bg-transparent px-5 text-base text-foreground placeholder:text-muted focus:outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {recipes === null ? t("loading") : t("empty")}
            </li>
          ) : (
            items.map((item, index) => (
              <li key={item.key} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                  className={cx(
                    "flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                    index === active ? "bg-raised" : "",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="shrink-0 text-xs text-muted">{item.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-border px-5 py-2 text-xs text-muted">{t("help")}</p>
      </div>
    </div>
  );
}

/** Bouton du menu qui ouvre la recherche rapide. */
export function CommandButton() {
  const t = useTranslations("Command");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("culinova:command"))}
      className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
    >
      {t("button")}
      <kbd className="rounded border border-border px-1.5 text-xs">Ctrl K</kbd>
    </button>
  );
}
