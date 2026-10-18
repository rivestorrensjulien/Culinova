import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, tokenKey } from "./crypto";

const env = { SOCIAL_TOKEN_KEY: randomBytes(32).toString("base64") };

describe("chiffrement des jetons", () => {
  it("chiffre et déchiffre, sans jamais laisser le jeton en clair", () => {
    const sealed = encryptToken("IGQVJ-secret", env);
    expect(sealed).not.toContain("secret");
    expect(encryptToken("IGQVJ-secret", env)).not.toBe(sealed);
    expect(decryptToken(sealed, env)).toBe("IGQVJ-secret");
  });

  it("refuse une clé absente, trop courte ou une autre clé", () => {
    expect(tokenKey({})).toBeNull();
    expect(tokenKey({ SOCIAL_TOKEN_KEY: "court" })).toBeNull();
    expect(tokenKey({ SOCIAL_TOKEN_KEY: "ab".repeat(32) })).toHaveLength(32);
    const sealed = encryptToken("x", env);
    expect(() => decryptToken(sealed, { SOCIAL_TOKEN_KEY: randomBytes(32).toString("base64") })).toThrow();
  });
});
