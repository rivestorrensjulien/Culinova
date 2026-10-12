/** Import d'une recette : sécurité des adresses, lecture des pages, réécriture par l'IA. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { getMonthlyUsage } from "../quotas";
import { fetchRecipePage, htmlToText, recipeJsonLd, safeImportUrl, startImport } from "./import";
import { runGeneration } from "./run";

const RECIPE_TEXT = `Gâteau au yaourt
Pour 6 personnes
1 pot de yaourt, 2 pots de sucre, 3 pots de farine, 3 œufs, 1/2 pot d'huile.
Mélanger, verser dans un moule beurré, cuire 35 min à 180 °C.`;

describe("adresses et pages importées", () => {
  it("refuse les adresses internes ou exotiques", () => {
    expect(safeImportUrl("https://www.marmiton.org/recettes/gateau.aspx")).not.toBeNull();
    for (const bad of [
      "ftp://exemple.fr/recette",
      "http://localhost:3000/",
      "http://127.0.0.1/",
      "http://192.168.1.10/",
      "http://10.0.0.2/",
      "http://169.254.169.254/latest/meta-data",
      "https://user:pass@exemple.fr/",
      "https://exemple.fr:8443/",
      "http://intranet/",
      "pas une adresse",
    ]) {
      expect(safeImportUrl(bad), bad).toBeNull();
    }
  });

  it("garde le texte lisible et préfère les données de recette publiées", async () => {
    const html = `<html><head><title>Gâteau</title><style>p{}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Gâteau au yaourt","recipeYield":"6"}]}</script>
<script>alert(1)</script></head><body><p>Mélanger &amp; cuire</p><ul><li>3 œufs</li></ul></body></html>`;
    expect(htmlToText(html)).toContain("Mélanger & cuire\n3 œufs");
    expect(htmlToText(html)).not.toContain("alert");
    expect(recipeJsonLd(html)).toBe('{"@type":"Recipe","name":"Gâteau au yaourt","recipeYield":"6"}');
    const page = await fetchRecipePage("https://exemple.fr/gateau", async () => new Response(html));
    expect(page).toEqual({
      ok: true,
      text: 'Source : https://exemple.fr/gateau\nGâteau\n{"@type":"Recipe","name":"Gâteau au yaourt","recipeYield":"6"}',
    });
    expect(await fetchRecipePage("http://localhost/", async () => new Response(html))).toEqual({
      ok: false,
      reason: "url",
    });
    expect(
      await fetchRecipePage("https://exemple.fr/", async () => new Response("", { status: 404 })),
    ).toEqual({ ok: false, reason: "fetch" });
  });
});

describe.skipIf(!hasTestDb)("import d'une recette", () => {
  it("réécrit la recette, l'enregistre comme importée et compte une recette du mois", async () => {
    const db = testDb();
    const user = await createTestUser();
    expect(await startImport(db, { userId: user.id, text: "trop court", language: "fr" })).toEqual({
      ok: false,
      reason: "empty",
    });
    const started = await startImport(db, { userId: user.id, text: RECIPE_TEXT, language: "fr" });
    if (!started.ok) throw new Error(started.reason);
    expect(await runGeneration(db, new FakeLlmAdapter(), started.generationId)).toBe("succeeded");

    const [generation] = await db
      .select()
      .from(s.aiGenerations)
      .where(eq(s.aiGenerations.id, started.generationId));
    const [recipe] = await db.select().from(s.recipes).where(eq(s.recipes.id, generation!.recipeId!));
    expect(recipe).toMatchObject({ ownerId: user.id, source: "imported", kind: "dish" });
    const [version] = await db
      .select()
      .from(s.recipeVersions)
      .where(eq(s.recipeVersions.id, recipe!.currentVersionId!));
    expect(version!.name).toContain("(importée)");
    expect((await getMonthlyUsage(db, user.id)).used.recipes).toBe(1);
  });
});
