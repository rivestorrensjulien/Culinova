import assert from "node:assert/strict";
import { test } from "node:test";
import {
  carouselPages,
  EXAMPLE_CAROUSEL,
  MAX_INGREDIENTS,
  MAX_SLIDES,
  MAX_SUMMARY,
  summaryLines,
} from "./carousel.ts";

test("4 images : couverture, ingrédients, la recette en bref, fin", () => {
  const pages = carouselPages(EXAMPLE_CAROUSEL);
  assert.deepEqual(
    pages.map((p) => p.kind),
    ["cover", "ingredients", "summary", "end"],
  );
});

test("jamais plus de 4 images, même pour une longue recette", () => {
  const long = {
    ingredients: Array.from({ length: 30 }, (_, i) => ({ label: `Ingrédient ${i}`, amount: "10 g" })),
    steps: Array.from({ length: 40 }, (_, i) => `Étape ${i} : ${"mélanger doucement ".repeat(8)}`),
  };
  const pages = carouselPages(long);
  assert.equal(pages.length, MAX_SLIDES);
  const ingredients = pages.find((p) => p.kind === "ingredients");
  assert.equal(ingredients?.kind === "ingredients" && ingredients.items.length, MAX_INGREDIENTS - 1);
  assert.equal(ingredients?.kind === "ingredients" && ingredients.more, 30 - (MAX_INGREDIENTS - 1));
  const summary = pages.find((p) => p.kind === "summary");
  assert.equal(summary?.kind === "summary" && summary.items.length, MAX_SUMMARY);
  assert.equal(summary?.kind === "summary" && summary.total, 40);
});

test("la recette en bref reprend le script TikTok, sans la ligne des ingrédients", () => {
  const lines = summaryLines({
    steps: ["Étape longue (300 g)."],
    summary: [
      "Disposer le pain, l'avocat et les œufs sur le plan de travail",
      "Griller le pain",
      "Écraser l'avocat au citron",
      "Pocher les œufs.",
    ],
  });
  assert.deepEqual(lines, ["Griller le pain", "Écraser l'avocat au citron", "Pocher les œufs"]);
});

test("sans script : première phrase des étapes, sans les quantités", () => {
  const lines = summaryLines({
    steps: [
      "Mixer la semoule fine (250 g) avec l'eau tiède (500 g) pendant 2 minutes. Laisser reposer.",
      "Cuire une louche de pâte dans une poêle bien chaude, d'un seul côté, jusqu'à ce que la surface soit sèche et criblée de trous.",
    ],
  });
  assert.equal(lines[0], "Mixer la semoule fine avec l'eau tiède pendant 2 minutes");
  assert.ok(lines[1]!.endsWith("…"));
  assert.ok(lines[1]!.length <= 91);
});
