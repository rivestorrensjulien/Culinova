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
  // Parcours complet (génération, prix, bases maison, nutrition) : plus long que la moyenne.
  test.setTimeout(240_000);
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
  await expect(page.getByTestId("step").nth(1)).toContainText(
    "Cuire le riz (300 g) avec l'eau (360 g, 36 cl)",
  );

  // Recalcul des quantités selon le nombre de personnes, liste et étapes comprises.
  await view.getByRole("button", { name: "6", exact: true }).click();
  await expect(page.getByTestId("servings")).toHaveText("6 personnes");
  await expect(page.getByTestId("ingredient").first()).toContainText("450 g");
  await expect(page.getByTestId("step").nth(1)).toContainText(
    "Cuire le riz (450 g) avec l'eau (540 g, 54 cl)",
  );

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

  // Chiffrage : les prix manquants ont été estimés par l'IA pendant la génération, « à confirmer ».
  await expect(page.getByTestId("cost-estimated")).toContainText("estimés par l'IA");
  await expect(page.getByTestId("cost-estimated")).toContainText("Riz à sushi");
  await page.getByTestId("cost-estimated").getByRole("link", { name: "Vérifier les prix" }).click();
  await expect(page.getByRole("heading", { name: "Mes ingrédients" })).toBeVisible();
  const riceRow = page.getByTestId("price-row").filter({ hasText: "Riz à sushi" });
  await expect(riceRow).toContainText("Estimé par l'IA");
  await page.getByLabel("Prix de Riz à sushi").fill("8");
  await riceRow.getByRole("button", { name: "Enregistrer" }).click();
  await expect(riceRow).toContainText("Enregistré");
  await page.getByRole("link", { name: "Retour à la recette" }).click();
  await expect(page.getByTestId("cost-estimated")).not.toContainText("Riz à sushi");

  // Prix de vente : coût matière d'une portion × 3,5 (pas encore de main-d'œuvre), TVA 10 %.
  const cents = (text: string | null) =>
    Math.round(Number(text!.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
  const shown = (value: number) => (value / 100).toFixed(2).replace(".", ",");
  const portion = cents(await page.getByTestId("cost-portion").textContent());
  expect(portion).toBeGreaterThan(0);
  const suggestedHt = Math.round(portion * 3.5);
  const recipeUrl = page.url();
  const pricing = page.getByTestId("pricing");
  await expect(pricing.getByTestId("suggested-ttc")).toContainText(
    shown(Math.round((suggestedHt * 11) / 10)),
  );
  const sellingPrice = pricing.getByLabel("Prix de vente TTC d'une portion (€)");
  await sellingPrice.fill("5");
  // 5 € TTC = 4,55 € HT ; marge brute = 4,55 € − coût matière d'une portion.
  await expect(pricing.getByTestId("actual-margin")).toContainText(shown(455 - portion));
  await pricing.getByRole("button", { name: "Enregistrer ces paramètres" }).click();
  await expect(pricing).toContainText("Paramètres de prix enregistrés.");
  await page.reload();
  await expect(page.getByTestId("pricing").getByLabel("Prix de vente TTC d'une portion (€)")).toHaveValue(
    "5,00",
  );

  // Fiche technique imprimable (PDF) : ingrédients, coûts, progression.
  await page.getByRole("link", { name: "Fiche technique (PDF)" }).click();
  const sheet = page.getByTestId("technical-sheet");
  await expect(sheet.getByRole("heading", { name: "Saumon snacké" })).toBeVisible();
  await expect(sheet.getByTestId("sheet-line")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeVisible();
  await page.getByLabel("Nombre de portions").fill("8");
  await expect(sheet).toContainText("Coût matière (8 portions)");
  await page.getByRole("link", { name: "Retour à la recette" }).click();

  // Mode préparation : mise en place, étapes, minuteur qui continue d'une étape à l'autre.
  await page.getByRole("link", { name: "Mode préparation" }).click();
  const cooking = page.getByTestId("cooking-mode");
  await expect(cooking.getByRole("heading", { name: "Mise en place" })).toBeVisible();
  await cooking.getByRole("button", { name: "Commencer" }).click();
  await expect(cooking.getByTestId("prep-step-count")).toHaveText("Étape 1 sur 6");
  await cooking.getByRole("button", { name: "Lancer le minuteur (5:00)" }).click();
  await expect(cooking.getByTestId("running-timer")).toContainText("Étape 1");
  await cooking.getByRole("button", { name: "Suivant" }).click();
  await expect(cooking.getByTestId("prep-step-count")).toHaveText("Étape 2 sur 6");
  await expect(cooking.getByTestId("running-timer")).toBeVisible();
  await cooking.getByRole("button", { name: "Quitter" }).click();
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon snacké");

  // Réglages du compte : coût horaire et appareils courants.
  await page.getByRole("link", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Réglages de chiffrage" })).toBeVisible();
  await page.getByLabel("Coût horaire de la main-d'œuvre (€ / heure)").fill("20");
  await page.getByLabel("Prix du kWh d'électricité (€)").fill("0,25");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Réglages enregistrés.")).toBeVisible();
  await page.getByRole("button", { name: /Ajouter les appareils courants/ }).click();
  await expect(page.getByTestId("appliances")).toContainText("Four");
  await page.goto(recipeUrl);
  await expect(page.getByTestId("pricing").getByLabel("Four", { exact: true })).toBeVisible();

  // Fait maison : le yuzu kosho, acheté tout prêt, devient une base de « Mes bases ».
  const yuzu = page.getByTestId("ingredient").filter({ hasText: "Yuzu kosho" });
  await expect(yuzu).toContainText("Acheté tout prêt");
  await yuzu.getByRole("button", { name: "Faire maison" }).click();
  await expect(yuzu.getByTestId("homemade")).toBeVisible({ timeout: 20_000 });
  // Une seule fiche recette affichée (pas de liste en double après la mise à jour).
  await expect(page.getByTestId("recipe-view")).toHaveCount(1);
  await expect(page.getByTestId("upstream")).toContainText("À commencer environ 2 h 15 avant le service.");

  // Nutrition : l'IA propose une correspondance Ciqual par ingrédient, la personne valide.
  const nutrition = page.getByTestId("nutrition");
  await nutrition.getByRole("button", { name: "Calculer les valeurs nutritionnelles" }).click();
  await expect(nutrition.getByTestId("nutrient-kcal")).toContainText("kcal", { timeout: 20_000 });
  await nutrition.getByText("Correspondances avec la table Ciqual").click();
  await expect(nutrition.getByTestId("nutrition-matches")).toContainText("Riz blanc, cru");
  await nutrition.getByRole("button", { name: "Tout valider" }).click();
  await expect(nutrition.getByRole("button", { name: "Tout valider" })).toHaveCount(0);

  // Photo : créée d'après le dressage, déclinée en 4 formats (1 crédit d'image).
  const photo = page.getByTestId("photo");
  await expect(photo.getByTestId("images-left")).toHaveText("10 photos disponibles ce mois-ci");
  await photo.getByRole("button", { name: "Générer la photo" }).click();
  await expect(photo.getByTestId("photo-image")).toBeVisible({ timeout: 30_000 });
  await expect(photo.getByTestId("images-left")).toHaveText("9 photos disponibles ce mois-ci");
  await photo.getByRole("button", { name: "Story 9:16" }).click();
  await expect(photo.getByRole("link", { name: "Télécharger ce format (810 × 1440)" })).toBeVisible();

  await yuzu.getByRole("link", { name: "Voir la recette maison" }).click();
  await expect(page.getByTestId("recipe-name")).toHaveText("Yuzu kosho maison");
  await expect(page.getByTestId("base-quantity")).toHaveText("4 g");
  await expect(page.getByTestId("base-info")).toContainText("Saumon snacké");
  await page.getByRole("link", { name: "Mes bases" }).first().click();
  await expect(page.getByTestId("bases")).toContainText("Yuzu kosho maison");
  await page.goto("/app/recettes");
  await expect(page.getByText("Saumon snacké")).toBeVisible();

  // Bibliothèque : recherche en langage courant, favoris, recherche rapide Ctrl+K.
  const search = page.getByRole("searchbox", { name: "Rechercher une recette" });
  await search.fill("saumon");
  await expect(page.getByTestId("library-count")).toContainText("1 recette");
  await search.fill("saumon rapide");
  await expect(page.getByTestId("library-count")).toContainText("Aucune recette");
  await page.getByRole("button", { name: "Tout effacer" }).click();
  const card = page.getByTestId("library-card").first();
  await card.getByTestId("favorite").click();
  await expect(card.getByTestId("favorite")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "★ Favoris" }).click();
  await expect(page.getByTestId("library-card")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  const palette = page.getByTestId("command-palette");
  await palette.getByRole("textbox").fill("snacké");
  await expect(palette.getByRole("option").first()).toContainText("Saumon snacké");
  await palette.getByRole("textbox").press("Enter");
  await expect(page.getByTestId("recipe-name")).toContainText("Saumon snacké");

  // Menu : le plat servi pour 8 couverts, coût par convive, puis liste de courses par rayon.
  await page.goto("/app/menus");
  await page.getByLabel("Nom du menu").fill("Dîner test");
  await page.getByLabel("Couverts").fill("8");
  await page.getByRole("button", { name: "Créer le menu" }).click();
  await expect(page.getByTestId("menu-name")).toHaveText("Dîner test");
  const addRecipe = page.getByLabel("Ajouter une recette");
  const dish = await addRecipe.locator("option", { hasText: "Saumon snacké" }).first().innerText();
  await addRecipe.selectOption({ label: dish });
  await page.getByRole("button", { name: "Ajouter au menu" }).click();
  await expect(page.getByTestId("menu-item")).toHaveCount(1);
  await expect(page.getByTestId("menu-item")).toContainText("Saumon snacké");
  await expect(page.getByTestId("menu-per-guest")).toContainText("€");
  await page.getByRole("button", { name: "Créer la liste de courses" }).click();
  await expect(page.getByRole("heading", { name: "Dîner test" })).toBeVisible();
  const items = page.getByTestId("shopping-item");
  await expect(items.first()).toBeVisible();
  const itemCount = await items.count();
  await expect(page.getByTestId("shopping-progress")).toHaveText(`0 sur ${itemCount} articles`);
  await items.filter({ hasText: "Riz à sushi" }).getByRole("checkbox").check();
  await expect(page.getByTestId("shopping-progress")).toHaveText(`1 sur ${itemCount} articles`);
  await page.reload();
  await expect(page.getByTestId("shopping-progress")).toHaveText(`1 sur ${itemCount} articles`);
  // Les articles cochés rejoignent le stock.
  await page.getByRole("button", { name: "Ranger les articles cochés dans le stock" }).click();
  await expect(page.getByTestId("stocked")).toHaveText("1 article rangé dans le stock.");
  await page.goto("/app/stocks");
  await expect(page.getByTestId("stock-item")).toHaveCount(1);
  await expect(page.getByTestId("stock-item")).toContainText(/riz à sushi/i);
  await page.goto(recipeUrl);

  // Import d'une recette collée : réécrite au format Culinova.
  await page.goto("/app/importer");
  await page
    .getByLabel("Texte de la recette")
    .fill(
      "Gâteau au yaourt\nPour 6 personnes\n1 pot de yaourt, 2 pots de sucre, 3 pots de farine, 3 œufs.\nCuire 35 min à 180 °C.",
    );
  await page.getByRole("button", { name: "Importer la recette" }).click();
  await expect(page.getByTestId("recipe-name")).toContainText("(importée)", { timeout: 30_000 });

  // Facture fournisseur : lue par l'IA, prix proposés puis validés.
  await page.goto("/app/ingredients/factures");
  await page.getByLabel("Photo ou PDF de la facture").setInputFiles({
    name: "facture.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Lire la facture" }).click();
  await expect(page.getByTestId("invoice-supplier")).toHaveText("Fournisseur test", { timeout: 30_000 });
  await expect(page.getByTestId("invoice-line")).toHaveCount(4);
  await page.getByRole("button", { name: "Valider toutes les lignes rapprochées" }).click();
  await expect(page.getByTestId("invoice-line").filter({ hasText: "Validé" })).toHaveCount(3);
  await page.goto(recipeUrl);

  // Modification par instruction : nouvelle version ciblée (2e et dernière régénération).
  await page.getByRole("textbox", { name: "Modifier la recette" }).fill("Remplace le saumon par du tofu");
  await page.getByRole("button", { name: "Appliquer la modification" }).click();
  await expect(page.getByTestId("recipe-name")).toContainText("(version modifiée)", { timeout: 20_000 });
  await expect(page.getByText("Plus de régénération possible")).toBeVisible();
  await expect(page.getByTestId("photo")).toContainText("La recette a changé");

  // Traduction : proposée par l'IA, à valider, bascule entre l'original et la traduction.
  const translation = page.getByTestId("translation");
  await translation.getByRole("button", { name: "Traduire (English)" }).click();
  await expect(translation).toContainText("Traduction à valider", { timeout: 20_000 });
  await expect(page.getByTestId("recipe-name")).toContainText("[EN]");
  await translation.getByRole("button", { name: "Valider la traduction" }).click();
  await expect(translation).toContainText("Traduction validée");
  await translation.getByRole("button", { name: "Français · original" }).click();
  await expect(page.getByTestId("recipe-name")).not.toContainText("[EN]");

  // 6e recette du mois : refusée avec un message clair.
  await page.goto("/app/creer");
  await page.getByRole("button", { name: "Nouvelle recette" }).first().click();
  await fillWizardUpToGeneration(page);
  // 2 recettes utilisées : la recette créée et la recette importée.
  await expect(page.getByTestId("remaining")).toHaveText("3 recettes disponibles ce mois-ci");
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
