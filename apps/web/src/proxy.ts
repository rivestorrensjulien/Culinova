import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Gestion de la langue dans l'URL. Les contrôles d'accès sont faits côté serveur, dans chaque espace. */
export default createMiddleware(routing);

export const config = {
  // Tout sauf l'API, les fichiers internes de Next.js et les fichiers statiques.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
