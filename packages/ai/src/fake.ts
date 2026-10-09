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
          ? "Cook {{i1}} of rice with {{i2}} of water, covered, over low heat."
          : "Cuire {{i1}} de riz avec {{i2}} d'eau, à couvert, à feu doux.",
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
          ? "Fold in {{i3}} of rice vinegar and let the rice rest."
          : "Incorporer {{i3}} de vinaigre de riz et laisser reposer le riz.",
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
    tiktok: english ? "Watch the torch do its magic…" : "Regardez le chalumeau faire son œuvre…",
    pinterest: english
      ? "Torched salmon sushi rice bowl recipe"
      : "Recette saumon mi-cuit riz vinaigré gingembre",
    linkedin: english ? "Costing a dish down to the gram." : "Chiffrer un plat au gramme près.",
    hashtags: ["culinova", "saumon", "cuisinejaponaise", "faitmaison"],
  };
}

const defaultResponder: Responder = (request) => {
  if (request.promptId.startsWith("social.")) return fakeSocial(request.user);
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
