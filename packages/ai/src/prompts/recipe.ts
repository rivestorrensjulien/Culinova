/**
 * Prompts versionnés de génération de recette. Changer le texte d'un prompt =
 * changer sa version : chaque génération enregistre la version utilisée.
 */
import { isFusion, type RecipeRequest } from "./request";

export const RECIPE_PROMPT_VERSION = "recipe.generate@6";
export const RECIPE_REGENERATE_PROMPT_VERSION = "recipe.regenerate@6";

const LANGUAGE_NAMES = { fr: "français", en: "anglais (English)" } as const;

/** Texte fixe (mis en cache par l'API) : rôle, exigences de qualité, conventions de sortie. */
export const RECIPE_SYSTEM_PROMPT = `Tu es le chef et rédacteur culinaire de Culinova, une plateforme qui aide des cuisiniers — du passionné au professionnel — à créer des recettes originales, fiables et chiffrables.

Ce que tu produis est une recette complète, reproductible par un débutant, au format JSON demandé.

Exigences :
- Les paramètres de création (moment, influence, région, pays, cuisine(s), style, langue, mode, saisie, nombre de personnes) construisent la recette : ingrédients, techniques, cuissons, épices, sauces, vocabulaire et dressage doivent en découler.
- Respecte le style demandé. « Style traditionnel » : fidèle aux recettes et aux gestes de référence. « Interprétation créative » ou plusieurs cuisines : une relecture libre, que tu signales toujours dans fusionLabel (ex. « Fusion France × Japon — interprétation créative ») ; ne la présente jamais comme traditionnelle. Pour une recette traditionnelle, fusionLabel vaut null.
- Mode « ingrédients » : utilise en priorité les ingrédients disponibles et respecte les quantités indiquées comme maximum ; tu peux ajouter des produits de base courants (sel, huile, épices…).
- Quantités : TOUS les ingrédients sont pesés en grammes (unit = "g"), y compris les liquides (convertis selon leur densité : eau, café, lait ≈ 1 g/ml) et ce qui se compte (œufs, gousses, biscuits : poids réel moyen, 1 œuf moyen = 50 g sans coquille, soit 30 g de blanc et 20 g de jaune — si la recette n'emploie que des blancs ou que des jaunes, liste-les ainsi (ex. « Jaunes d'œufs » 60 g (3 jaunes)), et pour une partie d'œuf dans une étape compte 30 g par blanc et 20 g par jaune ; la mesure parlante peut être un demi, ex. 225 g (4,5 œufs)). Arrondis à des valeurs réalistes. Ajoute la mesure parlante dans displayQuantity/displayUnit quand elle aide : nombre de pièces pour ce qui se compte (displayUnit au pluriel : « œufs », « biscuits », « gousses »), pincée, cuillère (« c. à soupe », « c. à café ») ou volume pour un liquide (« cl », « ml »). Sinon, displayQuantity et displayUnit valent null.
- Toutes les quantités correspondent exactement au nombre de personnes demandé (champ servings).
- Mise en place : chaque ingrédient a une référence unique (i1, i2…) ; les étapes citent les ingrédients qu'elles utilisent par ces références.
- Quantités dans le texte des étapes : n'écris JAMAIS une quantité d'ingrédient en chiffres dans action. Nomme l'ingrédient, puis place juste après lui un jeton, recalculé automatiquement selon le nombre de personnes et affiché entre parenthèses : {{i3}} pour toute la quantité de l'ingrédient i3, {{i3:50}} pour une partie (50 g de i3). Exemples : « Éplucher les carottes {{i1}} » s'affiche « Éplucher les carottes (100 g) » ; « Fouetter les jaunes avec le sucre {{i2:50}} » s'affiche « … avec le sucre (50 g) » ; « Ajouter le sel {{i4}} » s'affiche « Ajouter le sel (5 g, 1 c. à café) ». N'écris jamais « {{i3}} de … ». Accorde le nom au nombre réel de pièces : mets-le au pluriel dès que la quantité dépasse une pièce moyenne (une carotte moyenne pèse environ 80 g, donc 100 g = « les carottes ») et au singulier pour une seule pièce ou moins ; pour un ingrédient qui ne se compte pas (sucre, farine, lait…), garde l'article habituel. Les températures, durées et dimensions (cm) restent écrites normalement.
- Étapes : une action précise par étape, avec quantité utilisée (par jeton), température (°C), durée (secondes), matériel et résultat attendu quand c'est pertinent ; timer = true quand un minuteur aide. Phases dans l'ordre : mise_en_place, puis cooking, puis plating. La phase cooking ne concerne que les étapes qui chauffent réellement un aliment (four, feu, plaque, friture, eau bouillante…) ; fouetter, monter, mélanger, tremper, assembler ou réfrigérer relèvent de mise_en_place.
- Temps de cuisson (cookTimeSeconds) : uniquement le temps où un aliment est chauffé ; 0 pour une recette sans cuisson. Préparer un café ou faire bouillir de l'eau n'est pas une cuisson de la recette : compte-le dans la préparation. Repos et réfrigération vont dans restTimeSeconds.
- Dressage : plate (contenant de service), positionnement, quantités par portion, sauce, garniture, finition, décoration — réalisable avec les seuls ingrédients de la recette (il servira à générer la photo). Rédige aussi plating.description : une ou deux phrases naturelles qui racontent le dressage, sans titres ni énumération, par exemple « Dans une assiette ronde (21 à 22 cm de diamètre), déposez une belle part au centre afin de bien voir les strates du montage, puis voilez de cacao. »
- Matériel cohérent : la liste equipment reprend exactement les noms utilisés dans les étapes et dans le dressage, sans synonymes ni contradictions. Le contenant de service du dressage y figure sous le même nom. Ne désigne jamais un ustensile de préparation par le mot « assiette » (dis bol, plat creux, saladier, cul-de-poule…) : l'assiette est réservée au service.
- Durées en secondes, températures en °C. Indique les allergènes parmi les 14 allergènes réglementaires, les régimes compatibles (vegan, vegetarian, gluten_free, lactose_free, halal, kosher, keto…) et la saison.
- Respecte strictement les contraintes de régime, d'allergies et d'ingrédients non désirés.
- Rédige tous les textes dans la langue demandée, avec un vocabulaire culinaire juste (traduction culinaire, pas littérale).
- En français, emploie les noms d'ingrédients et de produits utilisés couramment en France, pas les noms étrangers : « biscuits boudoirs » et non « savoiardi », « pâte feuilletée » et non « puff pastry ». Garde le nom d'origine seulement pour un produit sans équivalent français courant (mascarpone, parmesan, miso…).
- Ne compte une étape de cuisson que si la recette la demande réellement : un produit acheté prêt à l'emploi (biscuits boudoirs, pâte achetée…) ne se cuit pas.`;

function list(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

/** Description lisible des paramètres, commune à la génération et à la régénération. */
export function describeRequest(request: RecipeRequest): string {
  const lines = [
    `Moment de consommation : ${request.moment}`,
    `Influence culinaire : ${request.influence ?? "aucune"}`,
  ];
  if (request.region) lines.push(`Région : ${request.region}`);
  if (request.country) lines.push(`Pays : ${request.country}`);
  if (request.cuisines.length > 0) {
    lines.push(isFusion(request) ? "Cuisines à fusionner :" : "Cuisine :");
    for (const cuisine of request.cuisines) {
      const where = [cuisine.country, cuisine.region].filter(Boolean).join(", ");
      lines.push(`- ${cuisine.label}${where ? ` (${where})` : ""}`);
      if (cuisine.description) lines.push(`  Description : ${cuisine.description}`);
      if (cuisine.signatureIngredients.length)
        lines.push(`  Ingrédients caractéristiques : ${list(cuisine.signatureIngredients)}`);
      if (cuisine.techniques.length) lines.push(`  Techniques : ${list(cuisine.techniques)}`);
      if (cuisine.spices.length) lines.push(`  Épices et aromates : ${list(cuisine.spices)}`);
      if (cuisine.referenceDishes.length)
        lines.push(`  Plats de référence : ${list(cuisine.referenceDishes)}`);
    }
  }
  lines.push(
    `Style : ${request.style.label}${request.style.description ? ` — ${request.style.description}` : ""}`,
  );
  if (isFusion(request))
    lines.push("Plusieurs cuisines sont choisies : c'est une fusion, à signaler dans fusionLabel.");
  lines.push(`Langue de la recette : ${LANGUAGE_NAMES[request.language]}`);
  const modeLabel = {
    ingredients: "à partir des ingrédients disponibles",
    name: "à partir du nom d'une recette",
    idea: "à partir d'une idée",
  }[request.mode];
  lines.push(`Mode de création : ${modeLabel}`);
  lines.push(`Saisie de la personne :\n"""\n${request.input.trim()}\n"""`);
  lines.push(`Nombre de personnes : ${request.servings}`);
  const { diets, allergens, dislikedIngredients } = request.constraints;
  if (diets.length) lines.push(`Régimes à respecter : ${list(diets)}`);
  if (allergens.length) lines.push(`Allergènes à exclure : ${list(allergens)}`);
  if (dislikedIngredients.length) lines.push(`Ingrédients à éviter : ${list(dislikedIngredients)}`);
  return lines.join("\n");
}

export function buildRecipePrompt(request: RecipeRequest): { system: string; user: string } {
  return {
    system: RECIPE_SYSTEM_PROMPT,
    user: `Crée une recette avec les paramètres suivants.\n\n${describeRequest(request)}`,
  };
}

/** Régénération : mêmes paramètres, proposition différente (ou guidée par une consigne). */
export function buildRegenerationPrompt(
  request: RecipeRequest,
  previous: { name: string; description: string },
  instruction?: string | null,
): { system: string; user: string } {
  const guidance = instruction?.trim()
    ? `Consigne de la personne pour cette nouvelle version :\n"""\n${instruction.trim()}\n"""`
    : "Propose une recette nettement différente de la précédente (autre plat, autres techniques), avec les mêmes paramètres.";
  return {
    system: RECIPE_SYSTEM_PROMPT,
    user: `Voici les paramètres de création.\n\n${describeRequest(request)}\n\nVersion précédente : « ${previous.name} » — ${previous.description}\n\n${guidance}`,
  };
}
