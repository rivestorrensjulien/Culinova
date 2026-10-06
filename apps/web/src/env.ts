/**
 * Variables d'environnement côté serveur, validées au premier accès.
 * Toutes les clés sont documentées dans `.env.example` à la racine du dépôt.
 */
import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
