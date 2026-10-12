import { describe, expect, it } from "vitest";
import { centeredCrop, ratioOf } from "./images";

describe("recadrage des images", () => {
  it("tire les 4 formats d'une image carrée 1440 × 1440", () => {
    expect(centeredCrop(1440, 1440, "1:1")).toEqual({ left: 0, top: 0, width: 1440, height: 1440 });
    expect(centeredCrop(1440, 1440, "4:5")).toEqual({ left: 144, top: 0, width: 1152, height: 1440 });
    expect(centeredCrop(1440, 1440, "9:16")).toEqual({ left: 315, top: 0, width: 810, height: 1440 });
    expect(centeredCrop(1440, 1440, "16:9")).toEqual({ left: 0, top: 315, width: 1440, height: 810 });
  });

  it("garde des dimensions paires et refuse un format invalide", () => {
    expect(centeredCrop(1001, 1001, "16:9")).toEqual({ left: 0, top: 219, width: 1000, height: 562 });
    expect(() => ratioOf("carré")).toThrow(RangeError);
    expect(() => centeredCrop(0, 10, "1:1")).toThrow(RangeError);
  });
});
