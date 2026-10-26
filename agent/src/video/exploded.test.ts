import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLIP_FRAMES,
  CUT_FRAMES,
  CUT_KNIFE_MOTION,
  cutEndPrompt,
  cutMidPrompt,
  cutMotion,
  cutStartPrompt,
  EMPTY_FRAMES,
  explodedFrames,
  explodedImagePrompt,
  explodedTimeline,
  gestureEndPrompt,
  gestureMotion,
  gestureStartPrompt,
  HOLD_FRAMES,
  isShortFormat,
  LAYER_FRAMES,
  layerAt,
  topAddPrompt,
  voilaImagePrompt,
} from "./exploded.ts";

const script = {
  container: "a light oak board",
  layered: true,
  layers: [
    { name: "Pain grillé", look: "two slices of toasted bread" },
    { name: "Avocat écrasé", look: "smashed avocado spread on the bread" },
    { name: "Œuf poché", look: "a poached egg on each slice" },
  ],
};

test("déroulé : photo, éclaté, vue du dessus couche par couche, photo, « Et voilà ! », fin", () => {
  const segments = explodedTimeline({ layerNames: script.layers.map((l) => l.name) });
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["photo", "explode", "assemble", "final", "voila", "end"],
  );
  assert.equal(segments[2]!.frames, EMPTY_FRAMES + 3 * LAYER_FRAMES);
  const seconds = explodedFrames({ layerNames: ["a", "b", "c", "d", "e"] }) / 30;
  assert.ok(seconds > 18 && seconds < 26, `durée ${seconds} s`);
});

test("les couches se posent une à une", () => {
  assert.equal(layerAt(0, 3), -1);
  assert.equal(layerAt(EMPTY_FRAMES, 3), 0);
  assert.equal(layerAt(EMPTY_FRAMES + LAYER_FRAMES, 3), 1);
  assert.equal(layerAt(10_000, 3), 2);
});

test("consignes : ordre des couches, contenant du dressage, baiser du chef", () => {
  const prompt = explodedImagePrompt(script);
  assert.match(prompt, /1\. two slices of toasted bread 2\. smashed avocado/);
  assert.match(prompt, /light oak board/);
  assert.match(topAddPrompt(script.layers[2]!), /poached egg/);
  assert.match(voilaImagePrompt(), /chef's kiss/);
  assert.match(voilaImagePrompt(), /'JU'/);
});

test("coupe, vue du dessus et geste : même début et même fin, cœur adapté au plat", () => {
  const names = ["Aubergines", "Viande", "Béchamel"];
  const kinds = (format: "coupe" | "dessus" | "geste") =>
    explodedTimeline({ layerNames: names, format }).map((s) => s.kind);
  assert.deepEqual(kinds("coupe"), ["photo", "explode", "final", "voila", "end"]);
  assert.deepEqual(kinds("geste"), ["photo", "explode", "final", "voila", "end"]);
  assert.deepEqual(kinds("dessus"), ["photo", "assemble", "final", "voila", "end"]);
  // Coupe : deux plans enchaînés ; geste : un plan de 5 s.
  // + la tenue du résultat avant le plan suivant (retour de Julien du 25/10).
  assert.equal(explodedTimeline({ layerNames: names, format: "coupe" })[1]!.frames, CUT_FRAMES + HOLD_FRAMES);
  assert.equal(
    explodedTimeline({ layerNames: names, format: "geste" })[1]!.frames,
    CLIP_FRAMES + HOLD_FRAMES,
  );
  assert.ok(isShortFormat("coupe") && !isShortFormat("animee"));
});

test("consignes de la coupe et du geste", () => {
  const moussaka = {
    ...script,
    cut: {
      vessel: "a rectangular terracotta baking dish, golden bechamel top",
      start: "the whole moussaka untouched, a knife and a spatula beside it",
      end: "a neat square portion lifted on a spatula",
      motion: "Slices through the moussaka and lifts a portion in slow motion.",
      strata: ["Aubergines", "Viande", "Béchamel"],
    },
    gesture: {
      action: "Napper de sauce",
      start: "the dish just before the sauce",
      end: "the sauce glossy on top",
      motion: "Pours the sauce slowly over the dish.",
    },
  };
  // Retour de Julien (24/10) : plat entier au départ, puis la même part découpée, puis soulevée.
  assert.match(cutStartPrompt(moussaka), /whole and completely untouched/);
  assert.match(cutStartPrompt(moussaka), /no missing portion/);
  assert.match(cutStartPrompt(moussaka), /terracotta baking dish/);
  assert.match(cutMidPrompt(), /still fully in place/);
  assert.match(cutMidPrompt(), /front-right corner portion/);
  assert.match(cutEndPrompt(moussaka), /front-right corner portion/);
  assert.match(cutEndPrompt(moussaka), /exact spot/);
  assert.match(cutEndPrompt(moussaka), /Aubergines, Viande, Béchamel/);
  assert.match(CUT_KNIFE_MOTION, /nothing is lifted/);
  assert.match(cutMotion(moussaka), /already under the cut portion/);
  assert.match(gestureStartPrompt(moussaka), /never a face/);
  assert.match(gestureEndPrompt(moussaka), /sauce glossy/);
  // Ce qui est versé reste visible (25/10) ; un seul liquide, rien qui tombe en morceaux (26/10).
  assert.match(gestureStartPrompt(moussaka), /solid garnishes .* already in place/);
  assert.match(gestureEndPrompt(moussaka), /nothing has disappeared/);
  assert.match(gestureMotion(moussaka), /stays there/);
  assert.match(gestureMotion(moussaka), /Nothing else falls/);
});
