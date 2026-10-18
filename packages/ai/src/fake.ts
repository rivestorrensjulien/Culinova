/**
 * Adaptateur factice : répond sans appeler de service, de façon déterministe.
 * Utilisé en développement sans clé API et dans les tests automatisés.
 * Les réponses sont validées exactement comme celles du vrai modèle.
 */
import type { z } from "zod";
import {
  AiGenerationError,
  type LlmAdapter,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./adapters";
import type { GeneratedBase } from "./prompts/base";
import type { GeneratedRecipe, SocialContent } from "./schemas";

type Responder = (request: StructuredGenerationRequest<z.ZodType>) => unknown;

function field(text: string, label: string): string | null {
  const match = new RegExp(`^${label} : (.+)$`, "m").exec(text);
  return match?.[1]?.trim() ?? null;
}

/** Recette d'exemple construite à partir des paramètres lisibles dans le prompt. */
export function fakeRecipe(user: string, variant = 0): GeneratedRecipe {
  const servings = Number(field(user, "Nombre de personnes") ?? 4);
  const english = (field(user, "Langue de la recette") ?? "").startsWith("anglais");
  const cuisine = /^- (.+?)(?: \(|$)/m.exec(user)?.[1] ?? field(user, "Pays") ?? "Contemporaine";
  const creative = /créati|fusion/i.test(user);
  const k = servings / 4;
  const q = (n: number) => Math.round(n * k);
  const name = english
    ? `${variant ? "Seared" : "Torched"} salmon on sushi rice, ginger and sesame`
    : `${variant ? "Saumon snacké" : "Saumon mi-cuit au chalumeau"}, riz vinaigré, gingembre et sésame`;
  return {
    name,
    description: english
      ? "Salmon barely cooked over a flame, seasoned sushi rice, crisp sesame and a bright ginger dressing."
      : "Un saumon à peine saisi, un riz vinaigré tiède, du sésame croquant et une vinaigrette vive au gingembre.",
    servings,
    difficulty: "medium",
    prepTimeSeconds: 1800,
    cookTimeSeconds: 900,
    restTimeSeconds: 600,
    season: ["autumn", "winter"],
    equipment: ["casserole", "chalumeau de cuisine", "couteau d'office", "assiette creuse noire mate"],
    cuisineLabel: cuisine,
    fusionLabel: creative ? `${cuisine} — interprétation créative` : null,
    ingredients: [
      {
        ref: "i1",
        name: english ? "Sushi rice" : "Riz à sushi",
        quantity: q(300),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: english ? "rinsed" : "rincé",
        group: english ? "Rice" : "Riz",
        optional: false,
        storeBought: false,
      },
      {
        ref: "i2",
        name: english ? "Water" : "Eau",
        quantity: q(360),
        unit: "g",
        displayQuantity: q(36),
        displayUnit: "cl",
        preparation: null,
        group: english ? "Rice" : "Riz",
        optional: false,
        storeBought: false,
      },
      {
        ref: "i3",
        name: english ? "Rice vinegar" : "Vinaigre de riz",
        quantity: q(40),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: null,
        group: english ? "Rice" : "Riz",
        optional: false,
        storeBought: false,
      },
      {
        ref: "i4",
        name: english ? "Salmon fillet" : "Pavé de saumon",
        quantity: q(480),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: english ? "skinless, cut into 4 portions" : "sans peau, en 4 portions",
        group: null,
        optional: false,
        storeBought: false,
      },
      {
        ref: "i5",
        name: english ? "Soy sauce" : "Sauce soja",
        quantity: q(30),
        unit: "g",
        displayQuantity: 2,
        displayUnit: english ? "tbsp" : "c. à soupe",
        preparation: null,
        group: english ? "Dressing" : "Vinaigrette",
        optional: false,
        storeBought: false,
      },
      {
        ref: "i6",
        name: english ? "Fresh ginger" : "Gingembre frais",
        quantity: q(20),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: english ? "finely grated" : "râpé finement",
        group: english ? "Dressing" : "Vinaigrette",
        optional: false,
        storeBought: false,
      },
      {
        ref: "i7",
        name: english ? "Sesame seeds" : "Graines de sésame",
        quantity: q(12),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: english ? "toasted" : "torréfiées",
        group: null,
        optional: false,
        storeBought: false,
      },
      {
        ref: "i8",
        name: "Yuzu kosho",
        quantity: Math.max(1, q(4)),
        unit: "g",
        displayQuantity: null,
        displayUnit: null,
        preparation: null,
        group: english ? "Dressing" : "Vinaigrette",
        optional: true,
        // Condiment souvent acheté tout prêt : permet de tester « Faire maison ».
        storeBought: true,
      },
    ],
    steps: [
      {
        phase: "mise_en_place",
        action: english
          ? "Weigh all ingredients and rinse the rice until the water runs clear."
          : "Peser tous les ingrédients et rincer le riz jusqu'à ce que l'eau soit claire.",
        ingredientRefs: ["i1"],
        temperatureC: null,
        durationSeconds: 300,
        equipment: [],
        expectedResult: english ? "Clear rinsing water." : "Eau de rinçage limpide.",
        timer: false,
      },
      {
        phase: "cooking",
        action: english
          ? "Cook the rice {{i1}} with the water {{i2}}, covered, over low heat."
          : "Cuire le riz {{i1}} avec l'eau {{i2}}, à couvert, à feu doux.",
        ingredientRefs: ["i1", "i2"],
        temperatureC: null,
        durationSeconds: 720,
        equipment: ["casserole"],
        expectedResult: english ? "Water fully absorbed." : "L'eau est entièrement absorbée.",
        timer: true,
      },
      {
        phase: "cooking",
        action: english
          ? "Fold in the rice vinegar {{i3}} and let the rice rest."
          : "Incorporer le vinaigre de riz {{i3}} et laisser reposer le riz.",
        ingredientRefs: ["i3"],
        temperatureC: null,
        durationSeconds: 600,
        equipment: [],
        expectedResult: null,
        timer: true,
      },
      {
        phase: "cooking",
        action: english
          ? "Torch the salmon on all sides."
          : "Saisir le saumon au chalumeau sur toutes les faces.",
        ingredientRefs: ["i4"],
        temperatureC: null,
        durationSeconds: 60,
        equipment: ["chalumeau de cuisine"],
        expectedResult: english ? "Golden outside, translucent inside." : "Doré en surface, nacré à cœur.",
        timer: false,
      },
      {
        phase: "cooking",
        action: english
          ? "Mix soy sauce, ginger and yuzu kosho."
          : "Mélanger la sauce soja, le gingembre et le yuzu kosho.",
        ingredientRefs: ["i5", "i6", "i8"],
        temperatureC: null,
        durationSeconds: null,
        equipment: [],
        expectedResult: null,
        timer: false,
      },
      {
        phase: "plating",
        action: english
          ? "Shape the rice, top with salmon, drizzle dressing and sprinkle sesame."
          : "Mouler le riz, déposer le saumon, napper de vinaigrette et parsemer de sésame.",
        ingredientRefs: ["i1", "i4", "i7"],
        temperatureC: null,
        durationSeconds: null,
        equipment: [],
        expectedResult: null,
        timer: false,
      },
    ],
    plating: {
      description: english
        ? "On a matte black shallow plate, set a quenelle of rice off-centre, lean the salmon against it, dot the ginger dressing around and sprinkle with sesame."
        : "Dans une assiette creuse noire mate, déposez une quenelle de riz décentrée, appuyez le saumon contre elle, ponctuez de vinaigrette au gingembre et parsemez de sésame.",
      plate: english ? "Matte black shallow plate" : "Assiette creuse noire mate",
      positioning: english
        ? "Rice quenelle off-centre, salmon leaning against it"
        : "Quenelle de riz décentrée, saumon appuyé contre elle",
      quantities: english
        ? "75 g rice and 120 g salmon per plate"
        : "75 g de riz et 120 g de saumon par assiette",
      sauce: english ? "Ginger dressing in dots" : "Vinaigrette au gingembre en points",
      garnish: english ? "Toasted sesame" : "Sésame torréfié",
      finish: null,
      decoration: null,
    },
    allergens: ["fish", "soy", "sesame", "gluten"],
    diets: ["lactose_free"],
    tips: [english ? "Use very fresh fish." : "Utiliser un poisson d'une grande fraîcheur."],
  };
}

export function fakeSocial(user: string): SocialContent {
  const english = user.includes("anglais");
  return {
    title: english ? "Torched salmon, the easy way" : "Saumon au chalumeau, la version maison",
    description: english
      ? "A creative take on Japanese flavours."
      : "Une relecture créative des saveurs japonaises.",
    shortText: english ? "Ready in 45 minutes." : "Prêt en 45 minutes.",
    instagramCaption: english
      ? "Golden outside, silky inside 🔥 Save it for the weekend!"
      : "Doré dehors, fondant dedans 🔥 Enregistre-la pour ce week-end !",
    tiktok: english
      ? "Hook (0-3 s): Watch the torch do its magic…\nPlan 1: Lay out the ingredients\nPlan 2: Torch the salmon\nPlan 3: Plate it up and save the recipe"
      : "Accroche (0-3 s) : Regardez le chalumeau faire son œuvre…\nPlan 1 : Disposer les ingrédients sur le plan de travail\nPlan 2 : Saisir le saumon au chalumeau\nPlan 3 : Dresser l'assiette et inviter à enregistrer la recette",
    pinterest: english
      ? "Torched salmon sushi rice bowl recipe"
      : "Recette saumon mi-cuit riz vinaigré gingembre",
    linkedin: english ? "Costing a dish down to the gram." : "Chiffrer un plat au gramme près.",
    hashtags: ["culinova", "saumon", "cuisinejaponaise", "faitmaison"],
  };
}

/** Estimation factice : un prix plausible et stable pour chaque identifiant reçu. */
export function fakePriceEstimates(user: string) {
  const ids = [...user.matchAll(/^- (\S+) · .+ · (€\/kg|€\/l|€\/pièce)$/gm)].map((m) => ({
    id: m[1]!,
    unit: m[2]!,
  }));
  return {
    estimates: ids.map(({ id, unit }) => ({
      id,
      price: unit === "€/pièce" ? 0.3 : unit === "€/l" ? 2.5 : 4,
      confidence: "medium" as const,
      note: null,
    })),
  };
}

/** Base « faite maison » d'exemple, dimensionnée d'après la quantité nécessaire lue dans le prompt. */
export function fakeBase(user: string): GeneratedBase {
  const name = field(user, "Préparation") ?? "Préparation";
  const needed = Number(/^Quantité nécessaire : ([\d.,]+) g/m.exec(user)?.[1]?.replace(",", ".") ?? 100);
  const yieldG = Math.max(Math.ceil(needed), 150);
  const k = yieldG / 150;
  const q = (n: number) => Math.max(1, Math.round(n * k));
  const ingredient = (ref: string, label: string, quantity: number) => ({
    ref,
    name: label,
    quantity,
    displayQuantity: null,
    displayUnit: null,
  });
  const step = (action: string, refs: string[], expectedResult: string | null) => ({
    action,
    ingredientRefs: refs,
    temperatureC: null,
    durationSeconds: 300,
    expectedResult,
  });
  return {
    name: `${name} maison`,
    description: `${name} préparé à la maison, à la place du produit acheté tout prêt.`,
    difficulty: "easy",
    prepTimeSeconds: 1200,
    cookTimeSeconds: 0,
    restTimeSeconds: 3600,
    equipment: ["bol", "bocal en verre"],
    ingredients: [
      ingredient("i1", "Zestes de yuzu", q(60)),
      ingredient("i2", "Piment vert", q(75)),
      ingredient("i3", "Sel fin", q(15)),
    ],
    steps: [
      step("Hacher finement le piment vert {{i2}}.", ["i2"], "Un hachis très fin."),
      step("Mélanger les zestes de yuzu {{i1}} avec le piment et le sel {{i3}}.", ["i1", "i3"], null),
      step("Laisser reposer la pâte une heure au frais avant de l'utiliser.", [], "Une pâte parfumée."),
    ],
    storage: "Tassez la préparation dans un bocal en verre fermé et réservez-la au réfrigérateur.",
    allergens: [],
    tips: ["Se garde une semaine au frais."],
    yieldG,
    yieldDisplayQuantity: null,
    yieldDisplayUnit: null,
    shelfLifeHours: 168,
  };
}

/** Correspondances factices : le premier candidat de chaque ingrédient (ou aucun). */
export function fakeNutritionMatches(user: string) {
  const matches: Array<{ id: string; code: string | null; englishName: string }> = [];
  for (const line of user.split("\n")) {
    const item = /^- (\S+) · (.+)$/.exec(line);
    if (item) {
      matches.push({ id: item[1]!, code: null, englishName: item[2]! });
      continue;
    }
    const candidate = /^ {2}· (\S+) · /.exec(line);
    const last = matches.at(-1);
    if (candidate && last && last.code === null) last.code = candidate[1]!;
  }
  return { matches };
}

/** Prompt photo factice, assez long pour passer le contrôle. */
export function fakeImagePrompt(user: string) {
  const name = /"name": "([^"]+)"/.exec(user)?.[1] ?? "dish";
  return {
    prompt: `Editorial food photograph of ${name}, ${Array(40).fill("warm natural light").join(" ")}.`,
  };
}

/** Traduction factice : le texte d'origine préfixé de la langue, jetons conservés. */
export function fakeTranslation(user: string) {
  const english = /Langue cible : anglais/.test(user);
  const tag = english ? "EN" : "FR";
  const source = JSON.parse(user.slice(user.indexOf("{"))) as {
    name: string;
    description: string;
    cuisineLabel: string;
    fusionLabel: string | null;
    equipment: string[];
    tips: string[];
    ingredients: Array<{ ref: string; name: string; displayUnit: string | null }>;
    steps: Array<{ action: string; expectedResult: string | null }>;
    platingDescription: string;
  };
  return {
    ...source,
    name: `${source.name} [${tag}]`,
    ingredients: source.ingredients.map((i) => ({ ...i, name: `${i.name} [${tag}]` })),
    steps: source.steps.map((s) => ({ ...s, action: `[${tag}] ${s.action}` })),
  };
}

/** Lecture de facture d'exemple : une ligne par ingrédient proposé (3 au plus), à 5 € l'unité. */
export function fakeInvoice(user: string) {
  const candidates = [...user.matchAll(/^- (\S+) · (.+) · (€\/kg|€\/l|€\/pièce)$/gm)].slice(0, 3);
  return {
    supplier: "Fournisseur test",
    invoiceDate: "2026-10-01",
    lines: [
      ...candidates.map((m) => ({
        label: `${m[2]!.toUpperCase()} 1 KG`,
        quantity: 1,
        unit: m[3] === "€/pièce" ? ("piece" as const) : m[3] === "€/l" ? ("l" as const) : ("kg" as const),
        totalPrice: 5,
        ingredientRef: m[1]!,
        pricePerUnit: 5,
      })),
      {
        label: "FRAIS DE LIVRAISON",
        quantity: null,
        unit: null,
        totalPrice: 12,
        ingredientRef: null,
        pricePerUnit: null,
      },
    ],
  };
}

/** Analyse des statistiques des réseaux (insights.analyze). */
function fakeInsights() {
  return {
    summary: "Démarrage : trop peu de publications pour conclure, voici un plan pour les premières semaines.",
    strengths: ["Les vidéos courtes avec la mascotte retiennent l'attention dès l'accroche."],
    weaknesses: ["Peu de publications pour l'instant."],
    suggestions: [
      {
        title: "Publier trois fois par semaine",
        detail: "Mardi, jeudi et dimanche vers 18 h, quand votre public cuisine.",
        impact: "fort",
      },
    ],
    nextRecipes: ["Pâtes crémeuses au citron en 15 minutes"],
  };
}

const defaultResponder: Responder = (request) => {
  if (request.promptId.startsWith("insights.")) return fakeInsights();
  if (request.promptId.startsWith("invoice.")) return fakeInvoice(request.user);
  if (request.promptId.startsWith("recipe.import")) {
    const recipe = fakeRecipe(request.user, 0);
    return { ...recipe, name: `${recipe.name} (importée)` };
  }
  if (request.promptId.startsWith("recipe.translate")) return fakeTranslation(request.user);
  if (request.promptId.startsWith("image.")) return fakeImagePrompt(request.user);
  if (request.promptId.startsWith("nutrition.")) return fakeNutritionMatches(request.user);
  if (request.promptId.startsWith("base.")) return fakeBase(request.user);
  if (request.promptId.startsWith("social.")) return fakeSocial(request.user);
  if (request.promptId.startsWith("prices.")) return fakePriceEstimates(request.user);
  if (request.promptId.startsWith("recipe.edit")) {
    const recipe = fakeRecipe(request.user, 0);
    return { ...recipe, name: `${recipe.name} (version modifiée)` };
  }
  return fakeRecipe(request.user, request.promptId.includes("regenerate") ? 1 : 0);
};

export class FakeLlmAdapter implements LlmAdapter {
  readonly provider = "fake";
  /** Demandes reçues (inspectées par les tests). */
  readonly calls: Array<StructuredGenerationRequest<z.ZodType>> = [];

  constructor(
    private readonly responder: Responder = defaultResponder,
    private readonly delayMs = 0,
  ) {}

  async generateStructured<T extends z.ZodType>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<z.infer<T>>> {
    this.calls.push(request as StructuredGenerationRequest<z.ZodType>);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const usage = {
      provider: this.provider,
      model: "fake",
      inputTokens: 1200,
      outputTokens: 2400,
      costUsdMicros: 26_400,
      durationMs: this.delayMs,
      attempts: 1,
    };
    const parsed = request.schema.safeParse(
      this.responder(request as StructuredGenerationRequest<z.ZodType>),
    );
    if (!parsed.success) throw new AiGenerationError("invalid_output", parsed.error.message, usage);
    const problems = request.validate?.(parsed.data) ?? [];
    if (problems.length > 0) throw new AiGenerationError("invalid_output", problems.join(" ; "), usage);
    return { data: parsed.data, usage };
  }
}
