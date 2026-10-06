import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // Français sans préfixe (/connexion), autres langues préfixées (/en/connexion).
  localePrefix: "as-needed",
  // Français par défaut, quelle que soit la langue du navigateur.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
