/**
 * Critère de fin du jalon J1 : « vous créez un code, une personne s'inscrit avec,
 * vous révoquez le code et elle est déconnectée sur tous ses appareils ».
 */
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as OTPAuth from "otpauth";
import { ADMIN_EMAIL, signIn, waitForEmailLink } from "./helpers";

const GUEST_EMAIL = "chef.invite@e2e.test";

function totp(secret: string): string {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

test("invitation, inscription, révocation et déconnexion sur tous les appareils", async ({ browser }) => {
  test.setTimeout(150_000);
  // ── L'administrateur se connecte et active son second facteur ──
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signIn(admin, ADMIN_EMAIL);
  await expect(admin).toHaveURL(/\/app$/);
  await admin.goto("/admin");
  await expect(admin).toHaveURL(/\/2fa$/);
  await admin.getByText("Saisie manuelle de la clé").click();
  const secret = (await admin.getByTestId("totp-secret").textContent())!.trim();
  await admin.getByLabel("Code").fill(totp(secret));
  await admin.getByRole("button", { name: "Valider" }).click();
  await expect(admin.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  await admin.getByRole("link", { name: "Accéder à l'administration" }).click();
  await expect(admin.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  // ── Il crée un code nominatif et l'envoie par e-mail ──
  await admin.goto("/admin/invitations");
  await admin.getByLabel("Libellé (facultatif)").fill("Chef invité");
  await admin.getByLabel("E-mail (facultatif)").fill(GUEST_EMAIL);
  await admin.getByLabel("Envoyer l’invitation par e-mail à cette adresse").check();
  const sentAt = Date.now();
  await admin.getByRole("button", { name: "Créer un code" }).click();
  const code = (await admin.getByTestId("invitation-code").textContent())!.trim();
  expect(code).toMatch(/^CULI-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const invitationLink = await waitForEmailLink(GUEST_EMAIL, "invitation", sentAt);
  expect(invitationLink).toContain(`/invitation/${code}`);

  // ── La personne invitée s'inscrit, sur deux appareils ──
  const phone = await browser.newContext();
  const laptop = await browser.newContext();
  const guest = await phone.newPage();
  await guest.goto(new URL(invitationLink).pathname);
  await expect(guest.getByLabel("Adresse e-mail")).toHaveValue(GUEST_EMAIL);
  await guest.getByLabel("Votre nom (facultatif)").fill("Camille");
  await guest.getByRole("checkbox").first().check();
  await guest.getByRole("checkbox").nth(1).check();
  const signupAt = Date.now();
  await guest.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(guest.getByText("un lien d'activation vient d'être envoyé")).toBeVisible();
  await guest.goto(await waitForEmailLink(GUEST_EMAIL, "magic-link", signupAt));
  await guest.getByRole("link", { name: "Me connecter" }).click();
  await expect(guest.getByText("Bienvenue sur Culinova !")).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
  await expect(guest.getByTestId("quota-recipes")).toHaveText("0 sur 5");
  await expect(guest.getByTestId("quota-images")).toHaveText("0 sur 10");

  const guestLaptop = await laptop.newPage();
  await signIn(guestLaptop, GUEST_EMAIL);
  await expect(guestLaptop).toHaveURL(/\/app$/);

  // L'administrateur voit la personne et son code.
  await admin.goto("/admin/utilisateurs");
  const row = admin.getByTestId("user-row").filter({ hasText: GUEST_EMAIL });
  await expect(row).toContainText("Actif");
  await expect(row).toContainText("2 session(s)");
  await expect(row).toContainText(code.slice(-4));

  // ── L'administrateur révoque le code ──
  await admin.goto("/admin/invitations");
  const invitationRow = admin.getByTestId("invitation-row").filter({ hasText: GUEST_EMAIL });
  await invitationRow.getByRole("button", { name: "Révoquer" }).click();
  await expect(invitationRow).toContainText("Révoqué");

  // ── La personne est déconnectée sur ses deux appareils ──
  for (const page of [guest, guestLaptop]) {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/connexion\?raison=session$/);
    await expect(page.getByText("Votre session a été fermée")).toBeVisible();
  }
  // …et ne peut plus recevoir de lien de connexion.
  await guest.getByLabel("Adresse e-mail").fill(GUEST_EMAIL);
  await guest.getByRole("button", { name: "Recevoir mon lien" }).click();
  await expect(guest).toHaveURL(/\/acces-suspendu$/);
  await expect(guest.getByRole("heading", { name: "Accès suspendu" })).toBeVisible();

  // Le journal d'audit trace toute l'opération.
  await admin.goto("/admin/journal");
  for (const action of [
    "invitation.create",
    "auth.signup",
    "invitation.revoke",
    "user.suspend",
    "user.sessions.revoke",
  ]) {
    await expect(admin.getByTestId("audit-row").filter({ hasText: action }).first()).toBeVisible();
  }

  // ── Réactivation : le code est rétabli, la personne peut revenir, données conservées ──
  await admin.goto("/admin/invitations");
  await invitationRow.getByRole("button", { name: "Rétablir" }).click();
  await expect(invitationRow).toContainText("Utilisé");
  await signIn(guest, GUEST_EMAIL);
  await expect(guest.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();

  // ── J6 : quotas personnels depuis la fiche de la personne ──
  await admin.goto("/admin/utilisateurs");
  await admin.getByRole("link", { name: GUEST_EMAIL }).click();
  await expect(admin.getByRole("heading", { name: GUEST_EMAIL })).toBeVisible();
  await admin.getByLabel("Recettes générées par mois").fill("7");
  await admin.getByRole("button", { name: "Enregistrer ses quotas" }).click();
  await expect(admin.getByText("Quotas de la personne enregistrés.")).toBeVisible();
  await guest.reload();
  await expect(guest.getByTestId("quota-recipes")).toHaveText("0 sur 7");

  // ── « Se connecter en tant que », puis retour à l'administration ──
  await admin.getByRole("button", { name: `Se connecter en tant que ${GUEST_EMAIL}` }).click();
  await expect(admin).toHaveURL(/\/app$/);
  await expect(admin.getByText(`Vous êtes connecté·e en tant que ${GUEST_EMAIL}`)).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Bonjour Camille" })).toBeVisible();
  await admin.getByRole("button", { name: "Revenir à l’administration" }).click();
  await expect(admin).toHaveURL(/\/admin\/utilisateurs$/);

  // ── Informations légales reprises dans les mentions légales ──
  await admin.goto("/admin/reglages");
  await admin.getByLabel("Nom ou raison sociale").fill("Culinova Test SAS");
  await admin.getByRole("button", { name: "Enregistrer les informations légales" }).click();
  await expect(admin.getByText("Informations légales enregistrées")).toBeVisible();
  await guest.goto("/legal/mentions-legales");
  await expect(guest.getByRole("heading", { name: "Mentions légales" })).toBeVisible();
  await expect(guest.getByText("Culinova Test SAS")).toBeVisible();

  // ── Mon compte : export des données puis suppression définitive ──
  await guest.goto("/app/compte");
  await expect(guest.getByTestId("consents")).toContainText(
    "Conditions générales d'utilisation — version 1.0",
  );
  const downloading = guest.waitForEvent("download");
  await guest.getByRole("link", { name: "Télécharger mes données" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^culinova-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile((await download.path())!, "utf8")) as {
    profile: { email: string };
    consents: unknown[];
  };
  expect(exported.profile.email).toBe(GUEST_EMAIL);
  expect(exported.consents).toHaveLength(2);

  await guest.getByLabel("Pour confirmer, saisissez votre adresse e-mail").fill("autre@e2e.test");
  await guest.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(guest.getByText("L’adresse saisie ne correspond pas")).toBeVisible();
  await guest.getByLabel("Pour confirmer, saisissez votre adresse e-mail").fill(GUEST_EMAIL);
  await guest.getByRole("button", { name: "Supprimer définitivement mon compte" }).click();
  await expect(guest).toHaveURL(/\/connexion\?raison=supprime$/);
  await expect(guest.getByText("Votre compte a été supprimé")).toBeVisible();

  await admin.goto("/admin/utilisateurs");
  await expect(admin.getByTestId("user-row").filter({ hasText: GUEST_EMAIL })).toHaveCount(0);
  await admin.goto("/admin/journal");
  for (const action of [
    "user.quotas.update",
    "user.impersonate.start",
    "user.impersonate.stop",
    "account.delete",
  ]) {
    await expect(admin.getByTestId("audit-row").filter({ hasText: action }).first()).toBeVisible();
  }
});

test("les pages publiques s'affichent en français et en anglais", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "De l'idée à l'assiette, avec l'IA." })).toBeVisible();
  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "From idea to plate, with AI." })).toBeVisible();
  await page.goto("/en/connexion");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/legal/cgu");
  await expect(page.getByRole("heading", { name: "Conditions générales d'utilisation" })).toBeVisible();
  await page.goto("/legal/cookies");
  await expect(page.getByRole("heading", { name: "Politique cookies" })).toBeVisible();
  await page.goto("/legal/confidentialite");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await page.goto("/invitation/CULI-2222-2222");
  await expect(page.getByText("Ce code d'invitation n'existe pas")).toBeVisible();
});

test("l'administration est inaccessible sans connexion", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/connexion$/);
});
