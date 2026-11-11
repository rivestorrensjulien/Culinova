/**
 * Pages de l'espace connecté, selon le mode du compte. Par défaut, Culinova s'adresse aux
 * particuliers (décision de Julien du 11/11) : menus, stocks et réglages de chiffrage (coefficient,
 * TVA, main-d'œuvre) n'apparaissent qu'en mode pro. Rien n'est supprimé : les pages restent en place.
 */
export type AppPageKey =
  | "dashboard"
  | "create"
  | "recipes"
  | "bases"
  | "menus"
  | "shopping"
  | "stock"
  | "import"
  | "ingredients"
  | "settings"
  | "account"
  | "security";

interface AppPage {
  key: AppPageKey;
  href: string;
  /** Réservée au mode pro. */
  pro?: boolean;
  /** Affichée dans le menu (sinon seulement dans la recherche rapide). */
  menu?: boolean;
}

const PAGES: readonly AppPage[] = [
  { key: "dashboard", href: "/app", menu: true },
  { key: "create", href: "/app/creer", menu: true },
  { key: "recipes", href: "/app/recettes", menu: true },
  { key: "bases", href: "/app/bases", menu: true },
  { key: "menus", href: "/app/menus", menu: true, pro: true },
  { key: "shopping", href: "/app/courses", menu: true },
  { key: "stock", href: "/app/stocks", menu: true, pro: true },
  { key: "import", href: "/app/importer" },
  { key: "ingredients", href: "/app/ingredients", menu: true },
  { key: "settings", href: "/app/reglages", menu: true, pro: true },
  { key: "account", href: "/app/compte", menu: true },
  { key: "security", href: "/app/compte/securite" },
];

/** Pages visibles pour ce mode, dans le menu ou dans la recherche rapide (Ctrl+K). */
export function appPages(proMode: boolean, where: "menu" | "search"): AppPage[] {
  return PAGES.filter((p) => (proMode || !p.pro) && (where === "search" || p.menu));
}

/** Clé de libellé (App.nav) : « Ingrédients » en mode pro, « Mes prix » pour un particulier. */
export function pageLabel(key: AppPageKey, proMode: boolean): string {
  return key === "ingredients" && !proMode ? "prices" : key;
}
