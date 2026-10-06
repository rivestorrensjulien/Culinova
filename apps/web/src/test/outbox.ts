import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface SavedEmail {
  to: string;
  subject: string;
  tag: string;
  url?: string;
  text: string;
}

/** Dernier e-mail envoyé à une adresse (boîte d'envoi locale des tests). */
export async function lastEmailTo(to: string, tag?: string): Promise<SavedEmail | null> {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  const files = (await readdir(dir).catch(() => [] as string[])).sort().reverse();
  for (const file of files) {
    const email = JSON.parse(await readFile(join(dir, file), "utf8")) as SavedEmail;
    if (email.to === to && (!tag || email.tag === tag)) return email;
  }
  return null;
}
