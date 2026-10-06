/** Gestion du thème clair / sombre. */

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "culinova-theme";

/** Applique un thème sur <html> et le mémorise. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Stockage indisponible (navigation privée…) : le thème reste appliqué pour la session.
  }
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignoré
  }
  return "system";
}

/**
 * Petit script à placer dans <head> : applique le thème mémorisé avant le premier
 * affichage, pour éviter un « flash » de la mauvaise couleur.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
