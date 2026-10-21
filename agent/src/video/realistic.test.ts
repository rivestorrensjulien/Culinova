import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bandFontSize,
  joinMotions,
  keyPlans,
  STILL_FRAMES,
  hookImagePrompt,
  motionPrompt,
  playbackRate,
  realisticFrames,
  realisticTimeline,
  sceneEndPrompt,
  sceneFrames,
  sceneStartPrompt,
  type SceneScript,
} from "./realistic.ts";

const script: SceneScript = {
  kitchen: "warm home kitchen, light oak counter",
  hook: { start: "The chef presents the tostadas.", motion: "smiles." },
  plans: [],
};

test("un plan à plusieurs actions dure plus longtemps, chaque scène est accélérée", () => {
  const plans = [{ clips: ["a"] }, { clips: ["b", "c", "d"] }];
  const segments = realisticTimeline({ plans, photoUrl: "x" });
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["hook", "shot", "shot", "reveal", "end"],
  );
  assert.equal(segments[1]!.frames, 120);
  assert.equal(segments[2]!.frames, sceneFrames(3) * 3);
  assert.ok(playbackRate(sceneFrames(3)) > 2 && playbackRate(sceneFrames(3)) < 2.6);
  const seconds = realisticFrames({ plans, photoUrl: "x" }) / 30;
  assert.ok(seconds > 15 && seconds < 25, `durée ${seconds} s`);
});

test("les consignes gardent Chef Ju (JU), la cuisine et le plat de la photo", () => {
  assert.match(hookImagePrompt(script), /'JU'/);
  assert.match(hookImagePrompt(script), /image 2/);
  assert.match(sceneStartPrompt(script, "He slides the eggs.", false), /Same kitchen/);
  assert.doesNotMatch(sceneStartPrompt(script, "x", false), /image 3/);
  assert.match(sceneEndPrompt("Toast on the board.", true), /image 3/);
  assert.equal(motionPrompt("The chef waits.").startsWith("The 3D chef waits."), true);
});

test("le texte des longs plans rapetisse pour tenir dans le bandeau", () => {
  assert.equal(bandFontSize("Presser les oranges"), 80);
  assert.ok(bandFontSize("x".repeat(160)) < 60);
});

test("version économique : ingrédients, geste signature et présentation filmés", () => {
  const actions = ["disposer", "couper", "melanger", "chauffer", "chauffer", "dresser", "dresser"];
  assert.deepEqual(keyPlans(actions), [0, 4, 6]);
  assert.deepEqual(keyPlans(actions, 4), [0, 3, 6]);
  assert.deepEqual(keyPlans(["disposer", "couper", "dresser"]), [0, 1, 2]);
  assert.equal(joinMotions(["slides the eggs in.", "waits"]), "slides the eggs in, then waits.");
  const segments = realisticTimeline({
    plans: [{ clips: ["a"] }, { clips: [], still: "x.jpg" }, { clips: ["b"] }],
    photoUrl: null,
  });
  assert.equal(segments[2]!.frames, STILL_FRAMES);
});
