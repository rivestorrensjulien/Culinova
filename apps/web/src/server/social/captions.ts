/**
 * Légendes des publications : texte du réseau (rédigé avec la recette), renvoi vers la recette
 * complète, comptes mentionnés (réglage de l'administration), hashtags et mention « visuel
 * généré par IA ».
 * L'administrateur peut encore modifier la légende avant chaque publication.
 */
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import type { SocialPlatform } from "./accounts";

export const MAX_CAPTION = 2200;
const MAX_MENTIONS = 20;
/** Pinterest : la recherche repose sur le texte, peu de hashtags. */
const MAX_HASHTAGS = { instagram: 15, tiktok: 8, pinterest: 3 } as const;
const MAX_LENGTH = { instagram: MAX_CAPTION, tiktok: MAX_CAPTION, pinterest: 800 } as const;

export const AI_NOTICE = "📸 Visuel généré par IA à partir de la recette.";
/**
 * Instagram et TikTok : les liens des légendes ne sont pas cliquables, on renvoie au lien de la
 * bio (culinova.fr/recettes, la liste des recettes publiques). Pinterest a son propre lien.
 */
export const BIO_LINK_NOTICE = "🔗 La recette complète, pesée au gramme : lien dans la bio";

export interface CaptionSettings {
  /** Comptes mentionnés dans chaque publication (sans « @ »). */
  mentions: string[];
  /** Ajoute « visuel généré par IA » à la fin de la légende (recommandé). */
  aiNotice: boolean;
}

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = { mentions: [], aiNotice: true };

/** « @maison.x, chef_y » → ["maison.x", "chef_y"] (noms Instagram/TikTok valides, sans doublon). */
export function parseMentions(input: string): string[] {
  const names = input
    .split(/[\s,;]+/)
    .map((name) => name.trim().replace(/^@+/, "").toLowerCase())
    .filter((name) => /^[a-z0-9._]{1,30}$/.test(name));
  return [...new Set(names)].slice(0, MAX_MENTIONS);
}

export async function getCaptionSettings(db: Database): Promise<CaptionSettings> {
  const [row] = await db
    .select({ value: s.siteSettings.value })
    .from(s.siteSettings)
    .where(eq(s.siteSettings.key, s.SETTING_KEYS.socialCaptions));
  const value = (row?.value ?? {}) as Partial<CaptionSettings>;
  return {
    mentions: Array.isArray(value.mentions) ? parseMentions(value.mentions.join(" ")) : [],
    aiNotice: value.aiNotice !== false,
  };
}

export async function saveCaptionSettings(db: Database, adminId: string, settings: CaptionSettings) {
  const value = { mentions: parseMentions(settings.mentions.join(" ")), aiNotice: settings.aiNotice };
  await db
    .insert(s.siteSettings)
    .values({ key: s.SETTING_KEYS.socialCaptions, value })
    .onConflictDoUpdate({ target: s.siteSettings.key, set: { value, updatedAt: new Date() } });
  await audit(db, { actorId: adminId, action: "social.captions", entity: "site_setting", after: value });
}

export function buildCaption(input: {
  text: string;
  hashtags: string[];
  platform: SocialPlatform;
  settings: CaptionSettings;
}): string {
  // Les @ n'ont pas de sens sur Pinterest (comptes différents).
  const mentions =
    input.platform === "pinterest" ? "" : input.settings.mentions.map((name) => `@${name}`).join(" ");
  const hashtags = input.hashtags
    .map((tag) => tag.replace(/^#/, "").replace(/\s+/g, ""))
    .filter(Boolean)
    .slice(0, MAX_HASHTAGS[input.platform])
    .map((tag) => `#${tag}`)
    .join(" ");
  const notice = input.settings.aiNotice ? AI_NOTICE : "";
  const bioLink = input.platform === "pinterest" ? "" : BIO_LINK_NOTICE;
  const tail = [bioLink, mentions, hashtags, notice].filter(Boolean).join("\n\n");
  // La fin (mentions, hashtags, mention IA) est toujours gardée : on raccourcit le texte si besoin.
  const room = MAX_LENGTH[input.platform] - (tail ? tail.length + 2 : 0);
  const text = input.text.trim().slice(0, Math.max(0, room));
  return [text, tail].filter(Boolean).join("\n\n");
}

/** Légende proposée pour une version de recette et un réseau. */
export async function captionFor(db: Database, versionId: string, platform: SocialPlatform): Promise<string> {
  const contents = await db
    .select()
    .from(s.socialContents)
    .where(eq(s.socialContents.recipeVersionId, versionId));
  const instagram = contents.find((c) => c.platform === "instagram");
  const tiktok = contents.find((c) => c.platform === "tiktok");
  const pinterest = contents.find((c) => c.platform === "pinterest");
  const text =
    platform === "instagram"
      ? (instagram?.caption ?? instagram?.description ?? "")
      : platform === "pinterest"
        ? (pinterest?.description ?? instagram?.description ?? "")
        : [tiktok?.title, tiktok?.description].filter(Boolean).join("\n\n") || (instagram?.caption ?? "");
  return buildCaption({
    text,
    hashtags: instagram?.hashtags.length ? instagram.hashtags : (tiktok?.hashtags ?? []),
    platform,
    settings: await getCaptionSettings(db),
  });
}

/** Titre de l'épingle Pinterest : le titre accrocheur rédigé avec la recette, sinon son nom. */
export async function pinTitleFor(db: Database, versionId: string): Promise<string> {
  const contents = await db
    .select({ platform: s.socialContents.platform, title: s.socialContents.title })
    .from(s.socialContents)
    .where(eq(s.socialContents.recipeVersionId, versionId));
  const titled = contents.find((c) => c.title);
  if (titled?.title) return titled.title.slice(0, 100);
  const [version] = await db
    .select({ name: s.recipeVersions.name })
    .from(s.recipeVersions)
    .where(eq(s.recipeVersions.id, versionId));
  return (version?.name ?? "Recette Culinova").slice(0, 100);
}
