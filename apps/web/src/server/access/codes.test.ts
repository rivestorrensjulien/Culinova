import { describe, expect, it } from "vitest";
import {
  generateInvitationCode,
  hashInvitationCode,
  invitationCodeHint,
  normalizeInvitationCode,
} from "./codes";

describe("codes d'invitation", () => {
  it("génère des codes lisibles et uniques", () => {
    const codes = new Set(Array.from({ length: 500 }, generateInvitationCode));
    expect(codes.size).toBe(500);
    for (const code of codes) expect(code).toMatch(/^CULI-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  it("normalise la saisie", () => {
    expect(normalizeInvitationCode("culi-7k3q-m9xa")).toBe("CULI-7K3Q-M9XA");
    expect(normalizeInvitationCode("  CULI 7K3Q M9XA ")).toBe("CULI-7K3Q-M9XA");
    expect(normalizeInvitationCode("7K3QM9XA")).toBe("CULI-7K3Q-M9XA");
  });

  it("refuse les saisies impossibles", () => {
    expect(normalizeInvitationCode("CULI-7K3Q")).toBeNull();
    expect(normalizeInvitationCode("CULI-OOOO-1111")).toBeNull();
    expect(normalizeInvitationCode("")).toBeNull();
  });

  it("ne stocke qu'une empreinte et un indice", () => {
    expect(hashInvitationCode("CULI-7K3Q-M9XA")).toBe(hashInvitationCode("CULI-7K3Q-M9XA"));
    expect(hashInvitationCode("CULI-7K3Q-M9XA")).not.toContain("7K3Q");
    expect(invitationCodeHint("CULI-7K3Q-M9XA")).toBe("CULI-••••-M9XA");
  });
});
