// Conversion de la table Ciqual (ANSES, format XML) en un fichier compact utilisé par le seed.
// Usage : node packages/db/scripts/ciqual-convert.mjs <dossier XML> <fichier JSON> <version>
// Sans dépendance : lancé par la tâche GitHub « Données Ciqual » (le conteneur de développement
// n'a pas accès au site de l'ANSES).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, output, version = "inconnue"] = process.argv.slice(2);
if (!dir || !output) {
  console.error("Usage : ciqual-convert.mjs <dossier XML> <fichier JSON> <version>");
  process.exit(1);
}

/** Constituants retenus (valeurs pour 100 g), avec le code Ciqual et un motif de contrôle du libellé. */
const NUTRIENTS = [
  { key: "kcal", code: "328", pattern: /kcal/i },
  { key: "kj", code: "327", pattern: /kJ/i },
  { key: "protein", code: "25000", pattern: /prot/i },
  { key: "carbs", code: "31000", pattern: /glucides|carbohydrate/i },
  { key: "sugars", code: "32000", pattern: /sucres|sugars/i },
  { key: "fiber", code: "34100", pattern: /fibres|fibre/i },
  { key: "fat", code: "40000", pattern: /lipides|fat/i },
  { key: "saturated", code: "40302", pattern: /satur/i },
  { key: "salt", code: "10004", pattern: /sel|salt/i },
];

function files(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Caractères 0x80–0x9F de windows-1252 (Œ, œ, €, guillemets…), que le décodeur de Node lit mal.
const CP1252 =
  "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f" +
  "\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

/** Lit un fichier XML dans son encodage déclaré (Ciqual 2020 : windows-1252). */
function readXml(path) {
  const bytes = readFileSync(path);
  const head = bytes.subarray(0, 200).toString("latin1");
  const encoding = /encoding="([^"]+)"/i.exec(head)?.[1] ?? "utf-8";
  if (!/1252|latin|8859-1/i.test(encoding)) return new TextDecoder(encoding).decode(bytes);
  let text = "";
  for (const byte of bytes)
    text += byte >= 0x80 && byte <= 0x9f ? CP1252[byte - 0x80] : String.fromCharCode(byte);
  return text;
}

/** Entités XML usuelles (« &lt; 0,5 »). */
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Enregistrements d'un fichier XML : chaque élément qui contient des champs simples. */
function records(xml, element) {
  const result = [];
  const pattern = new RegExp(`<${element}>([\\s\\S]*?)</${element}>`, "gi");
  for (const match of xml.matchAll(pattern)) {
    const fields = {};
    for (const field of match[1].matchAll(/<([A-Za-z_]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      fields[field[1].toLowerCase()] = decodeEntities(field[2]).trim();
    }
    result.push(fields);
  }
  return result;
}

/** « 20,4 » → 20.4 ; « traces » → 0 ; « < 0,5 » → 0.25 (moitié du seuil) ; « - » → null. */
function value(text) {
  if (text === undefined) return null;
  const clean = text.replace(/\s/g, "").replace(",", ".");
  if (/^traces$/i.test(clean)) return 0;
  const below = /^<(\d+(?:\.\d+)?)$/.exec(clean);
  if (below) return Math.round((Number(below[1]) / 2) * 1000) / 1000;
  return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
}

const all = files(dir).filter((path) => path.toLowerCase().endsWith(".xml"));
const find = (prefix) => all.find((path) => path.split("/").pop().toLowerCase().startsWith(prefix));
const alimPath = find("alim_") && all.find((p) => /\/alim_\d/i.test(p));
const compoPath = find("compo");
const constPath = find("const");
if (!alimPath || !compoPath || !constPath) {
  console.error(`Fichiers introuvables. Fichiers XML : ${all.join(", ")}`);
  process.exit(1);
}

// Contrôle des constituants : le code doit exister et son libellé correspondre.
const constants = new Map(records(readXml(constPath), "CONST").map((c) => [c.const_code, c]));
for (const nutrient of NUTRIENTS) {
  const found = constants.get(nutrient.code);
  const label = found?.const_nom_fr ?? found?.const_nom_eng ?? "";
  if (!found || !nutrient.pattern.test(label)) {
    console.error(`Constituant ${nutrient.code} (${nutrient.key}) introuvable ou inattendu : « ${label} »`);
    process.exit(1);
  }
  console.log(`::notice::${nutrient.key} = ${nutrient.code} · ${label}`);
}

const index = new Map(NUTRIENTS.map((n, i) => [n.code, i]));
const values = new Map();
for (const compo of records(readXml(compoPath), "COMPO")) {
  const position = index.get(compo.const_code);
  if (position === undefined) continue;
  const row = values.get(compo.alim_code) ?? new Array(NUTRIENTS.length).fill(null);
  row[position] = value(compo.teneur);
  values.set(compo.alim_code, row);
}

const foods = records(readXml(alimPath), "ALIM")
  .filter((alim) => alim.alim_code && alim.alim_nom_fr)
  .map((alim) => [
    alim.alim_code,
    alim.alim_nom_fr,
    alim.alim_nom_eng ?? null,
    ...(values.get(alim.alim_code) ?? new Array(NUTRIENTS.length).fill(null)),
  ])
  .sort((a, b) => Number(a[0]) - Number(b[0]));

writeFileSync(
  output,
  `${JSON.stringify({
    source: "ciqual",
    version,
    license: "Licence Ouverte / Etalab — ANSES, Table de composition nutritionnelle des aliments Ciqual",
    columns: ["code", "nameFr", "nameEn", ...NUTRIENTS.map((n) => n.key)],
    foods,
  })}\n`,
);
const withEnergy = foods.filter((f) => f[3] !== null).length;
console.log(
  `::notice::${foods.length} aliments convertis (${withEnergy} avec l'énergie en kcal), version ${version}`,
);
