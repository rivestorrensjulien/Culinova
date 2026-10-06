import { expect, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const ADMIN_EMAIL = "admin@e2e.test";

interface SavedEmail {
  to: string;
  tag: string;
  url?: string;
}

/** Attend l'e-mail envoyé à une adresse (boîte d'envoi locale) et renvoie son lien. */
export async function waitForEmailLink(to: string, tag: string, after: number): Promise<string> {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  for (let i = 0; i < 50; i++) {
    const files = (await readdir(dir).catch(() => [] as string[])).sort().reverse();
    for (const file of files) {
      if (Number(file.split("-")[0]) < after) continue;
      const email = JSON.parse(await readFile(join(dir, file), "utf8")) as SavedEmail;
      if (email.to === to && email.tag === tag && email.url) return email.url;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Aucun e-mail « ${tag} » reçu par ${to}`);
}

/** Connexion par lien magique depuis la page /connexion. */
export async function signIn(page: Page, email: string): Promise<void> {
  const before = Date.now();
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir mon lien" }).click();
  await expect(page.getByText("un lien de connexion vient de lui être envoyé")).toBeVisible();
  const link = await waitForEmailLink(email, "magic-link", before);
  await page.goto(link);
  await page.getByRole("link", { name: "Me connecter" }).click();
}
