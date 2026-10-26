/**
 * Provenance des demandes d'invitation (demande de Julien du 26/10) : d'où vient la personne
 * qui demande une invitation — Instagram, TikTok, Pinterest, un message « RECETTE », le lien en
 * bio… Lue dans l'adresse (paramètres `utm_*`, raccourci `de`, `recette`) ou, à défaut, dans le
 * site précédent (nom de domaine seul), puis transmise de page en page dans l'adresse des liens
 * jusqu'au formulaire. Aucun cookie ni stockage dans le navigateur.
 * Module pur : utilisable côté serveur et dans le navigateur.
 */

export interface RequestSource {
  /** instagram, tiktok, pinterest, facebook, google, … ; « direct » sans aucun indice. */
  source: string;
  /** Canal : social (publication), message (message privé), bio (lien en bio)… */
  medium: string | null;
  campaign: string | null;
  /** Page publique de la recette d'où vient la personne (son adresse courte). */
  recipe: string | null;
  /** Site précédent, nom de domaine seul (jamais l'adresse complète). */
  referrer: string | null;
}

export const DIRECT: RequestSource = {
  source: "direct",
  medium: null,
  campaign: null,
  recipe: null,
  referrer: null,
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function param(params: Params, key: string): string | null {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first ?? null;
}

/** Mot court et sûr : minuscules, chiffres, tirets ; null s'il ne reste rien. */
function token(value: string | null, max = 40): string | null {
  if (!value) return null;
  const clean = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return clean || null;
}

const ALIASES: Record<string, string> = {
  ig: "instagram",
  insta: "instagram",
  tt: "tiktok",
  pin: "pinterest",
  fb: "facebook",
};

/** Réseau reconnu d'après le site précédent (l.instagram.com, www.google.fr…). */
const REFERRER_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, "pinterest"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.me$/, "facebook"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
];

/** Nom de domaine du site précédent, sans « www. » ; null pour Culinova lui-même ou s'il est illisible. */
export function referrerHost(
  referer: string | null | undefined,
  ownHosts: readonly string[] = [],
): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || ownHosts.some((own) => host === own.replace(/^www\./, ""))) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

/**
 * Provenance d'une visite : paramètres de l'adresse d'abord (`utm_source`, `utm_medium`,
 * `utm_campaign`, `recette`, ou le raccourci `de=instagram` = lien en bio), sinon site précédent.
 */
export function readSource(
  params: Params,
  referer?: string | null,
  ownHosts: readonly string[] = [],
): RequestSource {
  const short = token(param(params, "de"));
  const raw = token(param(params, "utm_source")) ?? short;
  const referrer = referrerHost(referer, ownHosts);
  const fromReferrer = referrer ? REFERRER_SOURCES.find(([pattern]) => pattern.test(referrer))?.[1] : null;
  const source = raw ? (ALIASES[raw] ?? raw) : (fromReferrer ?? (referrer ? "site" : "direct"));
  return {
    source,
    medium: token(param(params, "utm_medium")) ?? (short && !param(params, "utm_source") ? "bio" : null),
    campaign: token(param(params, "utm_campaign")),
    recipe: token(param(params, "recette"), 120),
    referrer,
  };
}

/** Même provenance, avec la recette de la page visitée si l'adresse n'en donnait pas. */
export function withRecipe(source: RequestSource, slug: string): RequestSource {
  return source.recipe ? source : { ...source, recipe: token(slug, 120) };
}

/**
 * Paramètres à ajouter aux liens internes pour que la provenance suive la personne jusqu'au
 * formulaire (vide pour une visite directe sans recette).
 */
export function sourceQuery(source: RequestSource): Record<string, string> {
  const query: Record<string, string> = {};
  if (source.source !== "direct") query.utm_source = source.source;
  if (source.medium) query.utm_medium = source.medium;
  if (source.campaign) query.utm_campaign = source.campaign;
  if (source.recipe) query.recette = source.recipe;
  return query;
}

/** Relit la provenance envoyée par le formulaire (champs cachés : jamais pris tels quels). */
export function sourceFromForm(form: FormData): RequestSource {
  const get = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };
  const source = token(get("src_source")) ?? "direct";
  const referrer = get("src_referrer");
  return {
    source: ALIASES[source] ?? source,
    medium: token(get("src_medium")),
    campaign: token(get("src_campaign")),
    recipe: token(get("src_recipe"), 120),
    referrer: referrer && /^[a-z0-9.-]{1,100}$/i.test(referrer) ? referrer.toLowerCase() : null,
  };
}

const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  facebook: "Facebook",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  site: "Autre site",
  direct: "Accès direct",
};

const MEDIUM_LABELS: Record<string, string> = {
  social: "publication",
  message: "message privé",
  bio: "lien en bio",
  email: "e-mail",
};

export function sourceLabel(source: string | null): string {
  if (!source) return "Inconnue (avant le suivi)";
  return SOURCE_LABELS[source] ?? source;
}

/** « Instagram · message privé « RECETTE » », « Pinterest · publication »… */
export function sourceDetail(source: Pick<RequestSource, "medium" | "campaign">): string | null {
  if (!source.medium) return null;
  const medium = MEDIUM_LABELS[source.medium] ?? source.medium;
  return source.campaign === "commente" ? `${medium} « RECETTE »` : medium;
}
