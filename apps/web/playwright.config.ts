import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests de bout en bout : l'application est construite puis lancée sur le port 3100,
 * avec sa propre base (culinova_e2e_test) et une boîte d'envoi locale pour les e-mails.
 * Prérequis : `pnpm build` et une base PostgreSQL accessible.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const databaseUrl =
  process.env.DATABASE_URL_E2E ?? "postgresql://postgres:postgres@localhost:5432/culinova_e2e_test";
const outbox = join(tmpdir(), "culinova-e2e-outbox");

process.env.DATABASE_URL_E2E = databaseUrl;
process.env.EMAIL_OUTBOX_DIR = outbox;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      EMAIL_OUTBOX_DIR: outbox,
      RESEND_API_KEY: "",
      // IA factice : réponses déterministes, sans clé ni coût.
      AI_PROVIDER: "fake",
      AI_FAKE_DELAY_MS: "1500",
    },
  },
});
