import assert from "node:assert/strict";
import { test } from "node:test";
import { actionExpression, ingredientsIntro, shotAction, shotText, stepLabel } from "./actions.ts";

test("le geste suit le verbe du plan", () => {
  assert.equal(shotAction("Disposer les ingrédients sur le plan de travail"), "disposer");
  assert.equal(shotAction("Émincer finement les oignons rouges"), "couper");
  assert.equal(shotAction("Fouetter les œufs avec le sucre"), "melanger");
  assert.equal(shotAction("Mixer la semoule fine, la farine et l'eau tiède"), "melanger");
  assert.equal(shotAction("Saisir le poulet dans la poêle bien chaude"), "poeler");
  assert.equal(shotAction("Faire fondre le beurre avec le miel"), "chauffer");
  assert.equal(shotAction("Laisser reposer la pâte jusqu'à ce qu'elle bulle"), "repos");
  assert.equal(shotAction("Napper les baghrir encore tièdes et servir"), "verser");
  assert.equal(shotAction("Étaler la pâte au rouleau"), "petrir");
  assert.equal(shotAction("Parsemer de coriandre fraîche"), "assaisonner");
  assert.equal(shotAction("Dresser les tostadas sur la planche"), "dresser");
});

test("« cuire » dépend de l'ustensile", () => {
  assert.equal(shotAction("Cuire d'un seul côté dans une poêle bien chaude"), "poeler");
  assert.equal(shotAction("Cuire 25 minutes au four"), "four");
  assert.equal(shotAction("Cuire les pâtes dans l'eau bouillante"), "chauffer");
  assert.equal(shotAction("Enfourner le gratin"), "four");
});

test("un verbe inconnu en tête : on cherche plus loin, sinon on mélange", () => {
  assert.equal(shotAction("Ensuite, émincer le chou"), "couper");
  assert.equal(shotAction("Tout réunir"), "disposer");
  assert.equal(shotAction("Hop"), "melanger");
});

test("expressions : fier au dressage, épaté devant la poêle", () => {
  assert.equal(actionExpression("melanger", true), "fier");
  assert.equal(actionExpression("dresser", false), "fier");
  assert.equal(actionExpression("poeler", false), "waouh");
  assert.equal(actionExpression("couper", false), "content");
});

test("le plan « Disposer les ingrédients » devient la liste des ingrédients, pas une étape", () => {
  const shots = [
    "Disposer les oranges à jus, les tomates mûres, le persil plat frais, les avocats mûrs, le pain complet de campagne et les œufs sur le plan de travail",
    "Presser les oranges à jus",
    "Dresser les tostadas",
  ];
  assert.deepEqual(ingredientsIntro(shots[0]!), [
    "Oranges à jus",
    "tomates mûres",
    "persil plat frais",
    "avocats mûrs",
    "pain complet de campagne",
    "œufs",
  ]);
  assert.equal(stepLabel(shots, 0), "Les ingrédients");
  assert.equal(stepLabel(shots, 1), "Étape 1 / 2");
  assert.equal(shotText(shots, 0).startsWith("Oranges à jus · tomates"), true);
  assert.equal(shotText(shots, 1), "Presser les oranges à jus");
  assert.equal(stepLabel(["Couper", "Dresser"], 0), "Étape 1 / 2");
});
