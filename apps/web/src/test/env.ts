/** Variables d'environnement des tests (jamais de vraies clés). */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function loadTestEnv(): void {
  const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.RESEND_API_KEY = "";
  process.env.EMAIL_OUTBOX_DIR ??= join(tmpdir(), "culinova-test-outbox");
}

/** Base de test : DATABASE_URL_TEST. Les tests d'intégration sont ignorés si elle n'est pas définie. */
export function testDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL_TEST || undefined;
}
