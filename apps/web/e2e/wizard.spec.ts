/**
 * Critère de fin du jalon J2 : une recette « Plat · Asie · Japon · Interprétation
 * créative » est générée, cohérente avec ses paramètres, survit à un
 * rafraîchissement, et la 6e du mois est refusée avec un message clair.
 * (IA factice : le contenu exact est déterministe ; la qualité réelle se juge avec Claude.)
 */
import { createDb } from "@culinova/db";
import { usageCounters, users } from "@culinova/db/schema";
import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { ADMIN_EMAIL, COOK_EMAIL, signIn } from "./helpers";

async function setRecipesUsed(count: number) {
  const db = createDb(process.env.DATABASE_URL_E2E);
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, COOK_EMAIL));
  const period = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
  await db
    .insert(usageCounters)
    .values({ subjectType: "user", subjectId: user!.id, metric: "recipes", period, count })
    .onConflictDoUpdate({
      target: [
        usageCounters.subjectType,
        usageCounters.subjectId,
        usageCounters.metric,
        usageCounters.period,
      ],
      set: { count },
    });
  await db.$client.end();
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved");
}

async function fillWizardUpToGeneration(page: Page) {
  await expect(page.getByRole("heading", { name: "Pour quel moment ?" })).toBeVisible();
  await page.getByRole("button", { name: "Plat", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Une influence culinaire ?" })).toBeVisible();
  await page.getByRole("button", { name: "Asie", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Précisez la région, le pays ou la cuisine" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Asie de l'Est" }).click();
  await page.getByRole("button", { name: "Japon", exact: true }).click();
  // « Japonaise » peut aussi figurer dans les cuisines récentes : on prend celle de la liste du pays.
  await page.getByRole("button", { name: "Japonaise", exact: true }).last().click();
  await expect(page.getByTestId("precision-selection")).toHaveText("Asie de l'Est › Japon › Japonaise");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: /Interprétation créative/ }).click();
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await page.getByRole("button", { name: /À partir d'une idée/ }).click();
  await expect(page.getByRole("heading", { name: "Quelle est votre idée ?" })).toBeVisible();
  await page.getByRole("textbox").fill("Un plat de saumon réconfortant pour l'automne");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Pour combien de personnes ?" })).toBeVisible();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Tout est prêt" })).toBeVisible();
}

test("wizard : Plat · Asie · Japon · Interprétation créative, rafraîchissement, quota", async ({ page }) => {
  await signIn(page, COOK_EMAIL);
  await page.goto("/app/creer");
  await fillWizardUpToGeneration(page);

  const summary = page.getByTestId("summary");
  for (const text of [
    "Plat",
    "Asie",
    "Asie de l'Est › Japon › Japonaise",
    "Interprétation créative",
    "Français",
    "À partir d'une idée",
    "Un plat de saumon",
  ]) {
    await expect(summary).toContainText(text);
  }
  await expect(page.getByTestId("remaining")).toHaveText("5 recettes disponibles ce mois-ci");

  // Le brouillon survit à un rafraîchissement.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tout est prêt" })).toBeVisible();
  await expect(page.getByTestId("summary")).toContainText("Japonaise");

  // Génération.
  await page.getByRole("button", { name: "Générer la recette" }).click();
  await expect(page.getByTestId("generating")).toBeVisible();
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon", { timeout: 20_000 });
  const view = page.getByTestId("recipe-view");
  await expect(view).toContainText("Japonaise");
  await expect(view).toContainText("interprétation créative");
  await expect(page.getByTestId("ingredient").first()).toContainText("Riz à sushi");
  await expect(page.getByTestId("ingredient").first()).toContainText("300 g");
  await expect(view.getByRole("heading", { name: "Ingrédients" })).toBeVisible();
  await expect(page.getByTestId("ingredient").filter({ hasText: "Eau" })).toContainText("360 g (36 cl)");
  await expect(page.getByTestId("step")).toHaveCount(6);
  await expect(page.getByTestId("step").nth(1)).toContainText("Cuire 300 g de riz avec 360 g (36 cl) d'eau");

  // Recalcul des quantités selon le nombre de personnes, liste et étapes comprises.
  await view.getByRole("button", { name: "6", exact: true }).click();
  await expect(page.getByTestId("servings")).toHaveText("6 personnes");
  await expect(page.getByTestId("ingredient").first()).toContainText("450 g");
  await expect(page.getByTestId("step").nth(1)).toContainText("Cuire 450 g de riz avec 540 g (54 cl) d'eau");

  // La recette survit à un rafraîchissement.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon");

  // Régénération (2 par recette).
  await page.getByPlaceholder(/ce que vous voulez changer/).fill("Version snackée");
  await page.getByRole("button", { name: "Régénérer la recette" }).click();
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon snacké", { timeout: 20_000 });
  await expect(page.getByText("1 régénération restante")).toBeVisible();

  // Contenu social puis enregistrement.
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Contenu pour les réseaux sociaux" })).toBeVisible();
  await expect(page.getByTestId("social")).toContainText("Instagram");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Votre recette est enregistrée" })).toBeVisible();
  await page.getByRole("link", { name: "Ouvrir la recette" }).click();
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon snacké");
  await page.goto("/app/recettes");
  await expect(page.getByText("Saumon snacké")).toBeVisible();

  // 6e recette du mois : refusée avec un message clair.
  await page.goto("/app/creer");
  await page.getByRole("button", { name: "Nouvelle recette" }).first().click();
  await fillWizardUpToGeneration(page);
  await expect(page.getByTestId("remaining")).toHaveText("4 recettes disponibles ce mois-ci");
  await setRecipesUsed(5); // le quota est atteint pendant que la page est ouverte
  await page.getByRole("button", { name: "Générer la recette" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "recettes du mois" })).toContainText(
    /Vous avez utilisé vos 5 recettes du mois\. Le compteur repart à zéro le 1er \S+ \d{4}\./,
  );
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText("Plus aucune recette disponible ce mois-ci");
  await expect(page.getByRole("button", { name: "Générer la recette" })).toBeDisabled();
});

test("sauvegarde hors ligne : rien n'est perdu pendant une coupure réseau", async ({ page, context }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/app/creer");
  await page.getByRole("button", { name: "Dessert", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Une influence culinaire ?" })).toBeVisible();
  await waitSaved(page);

  // Coupure réseau : le choix est gardé sur l'appareil.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Méditerranée", exact: true }).click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "offline");

  // Fermeture de l'onglet sans réseau, puis réouverture une fois le réseau revenu.
  await page.close();
  await context.setOffline(false);
  const again = await context.newPage();
  await again.goto("/app/creer");
  await expect(
    again.getByRole("heading", { name: "Précisez la région, le pays ou la cuisine" }),
  ).toBeVisible();
  await waitSaved(again);

  // La version locale a bien été envoyée : après rechargement, c'est celle du serveur qui s'affiche.
  await again.reload();
  await expect(
    again.getByRole("heading", { name: "Précisez la région, le pays ou la cuisine" }),
  ).toBeVisible();
  await again.getByRole("button", { name: "Retour" }).click();
  await expect(again.getByRole("button", { name: "Méditerranée", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
