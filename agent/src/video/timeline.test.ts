import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXAMPLE_PROPS,
  HOOK_FRAMES,
  MUSIC_VOLUME,
  musicVolume,
  shotExpression,
  shotFrames,
  timeline,
  totalFrames,
} from "./timeline.ts";

test("un plan dure entre 1,8 et 3 secondes selon sa longueur", () => {
  assert.equal(shotFrames("Mixer"), 72);
  assert.equal(
    shotFrames("un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze"),
    105,
  );
});

test("déroulé : accroche, plans, photo, fin", () => {
  const segments = timeline({ ...EXAMPLE_PROPS, photoUrl: "https://exemple/photo.jpg" });
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["hook", "shot", "shot", "shot", "shot", "shot", "shot", "shot", "reveal", "end"],
  );
  assert.equal(segments[0]!.from, 0);
  assert.ok(segments[0]!.frames >= HOOK_FRAMES);
  for (let i = 1; i < segments.length; i++) {
    assert.equal(segments[i]!.from, segments[i - 1]!.from + segments[i - 1]!.frames);
  }
  const total = totalFrames({ ...EXAMPLE_PROPS, photoUrl: "x" });
  assert.ok(total / 30 > 15 && total / 30 < 40, `durée ${total / 30} s`);
});

test("sans photo, pas de dévoilement", () => {
  assert.ok(!timeline(EXAMPLE_PROPS).some((s) => s.kind === "reveal"));
});

test("le dernier plan (dressage) rend la mascotte fière", () => {
  assert.equal(shotExpression(4, 5), "fier");
  assert.notEqual(shotExpression(0, 5), "fier");
});

test("la musique s'arrête juste avant que Chef Ju parle, et ne reprend pas", () => {
  assert.equal(musicVolume(0, 600, null), 0);
  assert.equal(musicVolume(100, 600, 440), MUSIC_VOLUME);
  assert.ok(musicVolume(430, 600, 440) < MUSIC_VOLUME);
  assert.equal(musicVolume(436, 600, 440), 0);
  assert.equal(musicVolume(500, 600, 440), 0);
  assert.equal(musicVolume(600, 600, null), 0);
});
