import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_FRAMES,
  explodedFrames,
  explodedImagePrompt,
  explodedTimeline,
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
