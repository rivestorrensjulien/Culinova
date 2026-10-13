/** Jalon J8 : la page d'accueil présente Culinova et reçoit les demandes d'invitation. */
import { expect, test } from "@playwright/test";

test("demande d'invitation depuis la page d'accueil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("De l'idée à l'assiette, avec l'IA.");
  // Démo : le nombre de personnes recalcule le coût total (2,15 € par portion pour les bao).
  const demo = page.getByTestId("demo-card");
  await page.getByRole("radio", { name: "Street food · Japon" }).click();
  await expect(demo).toContainText("Bao au poulet croustillant");
  await expect(page.getByTestId("demo-total")).toHaveText(/8,60/);
  await page.getByTestId("demo-servings").fill("10");
  await expect(page.getByTestId("demo-total")).toHaveText(/21,50/);

  await page.getByTestId("hero-request").click();

  const form = page.getByTestId("request-form");
  await form.getByLabel("Prénom et nom").fill("Alex Martin");
  await form.getByLabel("Adresse e-mail").fill("alex.demande@e2e.test");
  await form.getByLabel("Vous êtes…").selectOption("caterer");
  // Sans consentement, la demande est refusée avec un message clair.
  await form.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByText("Merci d'accepter l'utilisation de vos informations")).toBeVisible();

  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(page.getByTestId("request-sent")).toBeVisible();
});

test("l'application est installable", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Culinova", start_url: "/app", display: "standalone" });
  expect((await request.get("/sw.js")).ok()).toBe(true);
  expect(await (await request.get("/offline.html")).text()).toContain("Vous êtes hors ligne");
});
