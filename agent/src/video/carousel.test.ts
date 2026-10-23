import assert from "node:assert/strict";
import { test } from "node:test";
import { carouselPages, EXAMPLE_CAROUSEL, MAX_SLIDES } from "./carousel.ts";

test("couverture, ingrédients, étapes, fin", () => {
  const pages = carouselPages(EXAMPLE_CAROUSEL);
  assert.deepEqual(
    pages.map((p) => p.kind),
    ["cover", "ingredients", "steps", "steps", "steps", "end"],
  );
  const steps = pages.filter((p) => p.kind === "steps");
  assert.deepEqual(
    steps.flatMap((p) => (p.kind === "steps" ? p.items.map((i) => i.number) : [])),
    [1, 2, 3, 4, 5],
  );
});

test("jamais plus de 10 images, même pour une longue recette", () => {
  const long = {
    ingredients: Array.from({ length: 30 }, (_, i) => ({ label: `Ingrédient ${i}`, amount: "10 g" })),
    steps: Array.from({ length: 40 }, (_, i) => `Étape ${i} : ${"mélanger doucement ".repeat(8)}`),
  };
  const pages = carouselPages(long);
  assert.ok(pages.length <= MAX_SLIDES);
  assert.equal(pages.filter((p) => p.kind === "ingredients").length, 2);
  const last = pages.filter((p) => p.kind === "steps").at(-1);
  assert.equal(last?.kind === "steps" && last.more, true);
});
