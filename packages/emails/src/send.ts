/**
 * Envoi des e-mails : Resend si RESEND_API_KEY est définie, sinon (hors
 * production) écriture dans une « boîte d'envoi » locale (dossier .outbox)
 * et affichage dans la console, pour développer et tester sans compte Resend.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resend } from "resend";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Étiquette libre pour retrouver l'e-mail (ex. "magic-link"). */
  tag: string;
  /** Lien principal, recopié dans la boîte d'envoi locale pour les tests. */
  url?: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? "Culinova <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: "category", value: email.tag.replace(/[^a-zA-Z0-9_-]/g, "_") }],
    });
    if (error) throw new Error(`Envoi de l'e-mail impossible : ${error.message}`);
    return;
  }

  if (process.env.NODE_ENV === "production" && process.env.EMAIL_OUTBOX_DIR === undefined) {
    throw new Error("RESEND_API_KEY n'est pas définie : impossible d'envoyer des e-mails en production.");
  }

  const dir = process.env.EMAIL_OUTBOX_DIR ?? join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${Date.now()}-${email.tag}-${Math.random().toString(36).slice(2, 8)}.json`);
  await writeFile(file, JSON.stringify({ ...email, sentAt: new Date().toISOString() }, null, 2));
  console.info(
    `✉  [boîte d'envoi locale] ${email.subject} → ${email.to}${email.url ? `\n   ${email.url}` : ""}`,
  );
}
