import assert from "node:assert/strict";
import { test } from "node:test";
import { EXAMPLE_PROPS } from "./timeline.ts";
import { hookImagePrompt, realisticFrames, realisticTimeline, shotImagePrompt } from "./realistic.ts";

test("version réaliste : un clip par plan, entre l'accroche et la photo", () => {
  const segments = realisticTimeline({ ...EXAMPLE_PROPS, photoUrl: "x" });
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["hook", ...EXAMPLE_PROPS.shots.map(() => "shot"), "reveal", "end"],
  );
  const seconds = realisticFrames({ ...EXAMPLE_PROPS, photoUrl: "x" }) / 30;
  assert.ok(seconds > 20 && seconds < 45, `durée ${seconds} s`);
});

test("les consignes gardent Chef Ju et le plat de la photo", () => {
  const prompt = shotImagePrompt("Baghrir", "Napper de beurre au miel", "verser");
  assert.match(prompt, /image 1/);
  assert.match(prompt, /Napper de beurre au miel/);
  assert.match(prompt, /pouring/);
  assert.match(shotImagePrompt("Baghrir", "Dresser", "dresser"), /exactly as shown in image 2/);
  assert.match(hookImagePrompt("Baghrir"), /presents the finished dish/);
});
