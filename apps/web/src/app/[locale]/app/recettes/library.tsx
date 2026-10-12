"use client";

import { Badge, Card, CardBody, cx, Input } from "@culinova/ui";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { formatDuration } from "@/components/recipe/format";
import { Link } from "@/i18n/navigation";
import { matchesQuery, parseLibraryQuery } from "@/lib/library-search";
import type { LibraryCard } from "@/server/library";

type Sort = "recent" | "cost" | "time";
const TIMES = [15, 30, 60] as const;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Mes recettes : recherche en langage courant, filtres en pastilles, favoris, tri. */
export function Library({ cards: initial }: { cards: LibraryCard[] }) {
  const t = useTranslations("Library");
  const tr = useTranslations("Recipe");
  const format = useFormatter();
  const [cards, setCards] = useState(initial);
  const [text, setText] = useState("");
  const [moment, setMoment] = useState<string | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | null>(null);
  const [diet, setDiet] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");

  const moments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const card of cards)
      if (card.momentCode && card.momentLabel) seen.set(card.momentCode, card.momentLabel);
    return [...seen].map(([code, label]) => ({ code, label }));
  }, [cards]);
  const diets = useMemo(() => [...new Set(cards.flatMap((c) => c.diets))].sort(), [cards]);

  const shown = useMemo(() => {
    const query = parseLibraryQuery(text, moments);
    const list = cards.filter(
      (card) =>
        matchesQuery(card, query) &&
        (!moment || card.momentCode === moment) &&
        (time === null || card.totalS <= time * 60) &&
        (!difficulty || card.difficulty === difficulty) &&
        (!diet || card.diets.includes(diet)) &&
        (!favoritesOnly || card.favorite),
    );
    if (sort === "cost") {
      return [...list].sort(
        (a, b) => (a.costPerPortionCents ?? Infinity) - (b.costPerPortionCents ?? Infinity),
      );
    }
    if (sort === "time") return [...list].sort((a, b) => a.totalS - b.totalS);
    return list;
  }, [cards, text, moments, moment, time, difficulty, diet, favoritesOnly, sort]);

  const filtered = text || moment || time || difficulty || diet || favoritesOnly;
  const reset = () => {
    setText("");
    setMoment(null);
    setTime(null);
    setDifficulty(null);
    setDiet(null);
    setFavoritesOnly(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        className="h-12 text-base"
      />
      <div className="flex flex-col gap-2" aria-label={t("filters")}>
        <div className="flex flex-wrap gap-2">
          <Chip active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
            ★ {t("favorites")}
          </Chip>
          {moments.map((m) => (
            <Chip
              key={m.code}
              active={moment === m.code}
              onClick={() => setMoment(moment === m.code ? null : m.code)}
            >
              {m.label}
            </Chip>
          ))}
          {TIMES.map((minutes) => (
            <Chip
              key={minutes}
              active={time === minutes}
              onClick={() => setTime(time === minutes ? null : minutes)}
            >
              {minutes === 60 ? t("under1h") : t("underMinutes", { minutes })}
            </Chip>
          ))}
          {(["easy", "medium", "hard"] as const).map((d) => (
            <Chip
              key={d}
              active={difficulty === d}
              onClick={() => setDifficulty(difficulty === d ? null : d)}
            >
              {tr(`difficulty.${d}`)}
            </Chip>
          ))}
          {diets.map((d) => (
            <Chip key={d} active={diet === d} onClick={() => setDiet(diet === d ? null : d)}>
              {tr.has(`dietNames.${d}`) ? tr(`dietNames.${d}` as "dietNames.vegan") : d}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted" data-testid="library-count">
            {t("count", { count: shown.length })}
            {filtered ? (
              <>
                {" · "}
                <button type="button" className="cursor-pointer text-primary hover:underline" onClick={reset}>
                  {t("reset")}
                </button>
              </>
            ) : null}
          </span>
          <label className="flex items-center gap-2 text-muted">
            {t("sort")}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="cursor-pointer rounded-md border border-border-strong bg-surface px-2 py-1 text-foreground"
            >
              <option value="recent">{t("sortRecent")}</option>
              <option value="cost">{t("sortCost")}</option>
              <option value="time">{t("sortTime")}</option>
            </select>
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted">{t("noMatch")}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="library">
          {shown.map((card) => (
            <li key={card.id} className="relative" data-testid="library-card">
              <Link href={`/app/recettes/${card.id}`} className="block h-full">
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-lifted">
                  <div className="relative aspect-[4/3] bg-soft">
                    {card.imageId ? (
                      <Image
                        src={`/api/images/${card.imageId}`}
                        alt=""
                        fill
                        unoptimized
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center font-display text-5xl text-soft-foreground/60">
                        {card.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <CardBody className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1">
                      {card.momentLabel ? <Badge tone="accent">{card.momentLabel}</Badge> : null}
                      {card.difficulty ? <Badge>{tr(`difficulty.${card.difficulty}`)}</Badge> : null}
                    </div>
                    <h2 className="font-display text-xl leading-snug text-balance">{card.name}</h2>
                    <p className="text-sm text-muted">
                      {[
                        card.totalS > 0 ? formatDuration(card.totalS) : null,
                        tr("servings", { count: card.servings }),
                        card.costPerPortionCents !== null
                          ? t("perPortion", {
                              price: format.number(card.costPerPortionCents / 100, {
                                style: "currency",
                                currency: "EUR",
                              }),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </CardBody>
                </Card>
              </Link>
              <FavoriteButton
                recipeId={card.id}
                initial={card.favorite}
                className="absolute top-3 right-3"
                onChange={(favorite) =>
                  setCards((all) => all.map((c) => (c.id === card.id ? { ...c, favorite } : c)))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
