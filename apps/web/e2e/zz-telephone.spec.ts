import { createDb } from "@culinova/db";
import { recipes, shoppingLists, users } from "@culinova/db/schema";
import { expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { COOK_EMAIL, signIn } from "./helpers";

/**
 * Mobile d'abord (décision de Julien du 11/11) : chaque écran tient dans un téléphone de 380 px
 * de large, sans défilement horizontal. Ce fichier passe en dernier (après la création des
 * recettes par le parcours principal) et photographie chaque page dans test-results/telephone.
 */
const WIDTH = 380;

test.use({ viewport: { width: WIDTH, height: 820 }, isMobile: true, hasTouch: true });

/** Éléments qui dépassent à droite de l'écran (les plus profonds seulement). */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate((width) => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth <= width + 1) return out;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= width + 1) continue;
      if (!el.checkVisibility()) continue;
      // Un ancêtre qui défile horizontalement contient le débordement : pas de souci.
      let parent = el.parentElement;
      let clipped = false;
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          clipped = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (clipped) continue;
      // Garder l'élément le plus profond (pas ses ancêtres).
      const hasOverflowingChild = Array.from(el.children).some(
        (c) => (c as HTMLElement).getBoundingClientRect().right > width + 1,
      );
      if (hasOverflowingChild) continue;
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40);
      out.push(
        `<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 60)}"> « ${text} » → ${Math.round(rect.right)} px`,
      );
    }
    return out.slice(0, 8);
  }, WIDTH);
}

test("téléphone : aucune page ne déborde en largeur (380 px)", async ({ page }) => {
  test.setTimeout(240_000);
  const db = createDb(process.env.DATABASE_URL_E2E);
  const [cook] = await db.select({ id: users.id }).from(users).where(eq(users.email, COOK_EMAIL));
  const [recipe] = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(eq(recipes.ownerId, cook!.id), eq(recipes.kind, "dish")))
    .limit(1);
  const [list] = await db
    .select({ id: shoppingLists.id })
    .from(shoppingLists)
    .where(eq(shoppingLists.ownerId, cook!.id))
    .limit(1);

  const problems: string[] = [];
  const check = async (name: string, path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test-results/telephone/${name}.png`, fullPage: true });
    const found = await overflowing(page);
    if (found.length) problems.push(`${name} (${path}) :\n  ${found.join("\n  ")}`);
  };

  // Pages publiques.
  await check("accueil", "/");
  await check("connexion", "/connexion");
  await check("recettes-publiques", "/recettes");
  await check("cgu", "/legal/cgu");

  try {
    await signIn(page, COOK_EMAIL);
    for (const proMode of [false, true]) {
      await db.update(users).set({ proMode }).where(eq(users.id, cook!.id));
      const mode = proMode ? "pro" : "maison";
      await check(`${mode}-tableau-de-bord`, "/app");
      await check(`${mode}-creer`, "/app/creer");
      await check(`${mode}-recettes`, "/app/recettes");
      if (recipe) {
        await check(`${mode}-recette`, `/app/recettes/${recipe.id}`);
        await check(`${mode}-preparation`, `/app/recettes/${recipe.id}/preparation`);
      }
      await check(`${mode}-courses`, "/app/courses");
      if (list) await check(`${mode}-liste`, `/app/courses/${list.id}`);
      await check(`${mode}-garde-manger`, "/app/stocks");
      await check(`${mode}-prix`, "/app/ingredients");
      await check(`${mode}-bases`, "/app/bases");
      await check(`${mode}-compte`, "/app/compte");
      await check(`${mode}-importer`, "/app/importer");
      if (proMode) {
        await check("pro-menus", "/app/menus");
        await check("pro-reglages", "/app/reglages");
        if (recipe) await check("pro-fiche", `/app/recettes/${recipe.id}/fiche`);
      }
    }
  } finally {
    await db.update(users).set({ proMode: true }).where(eq(users.id, cook!.id));
    await db.$client.end();
  }

  expect(problems, problems.join("\n")).toEqual([]);
});
