/**
 * Scan de factures (pros) et de tickets de caisse (particuliers, P8) : l'IA lit le document,
 * rapproche chaque ligne d'un ingrédient de la personne et propose un prix au kilo, au litre
 * ou à la pièce. Rien n'est enregistré sans validation (source « invoice » ou « receipt »).
 *
 * Tickets : la photo n'est jamais enregistrée (lue puis oubliée) ; les libellés validés sont
 * mémorisés (`price_aliases`) pour rapprocher sans erreur au ticket suivant ; les prix en
 * promotion sont signalés et ne comptent pas dans les prix de référence.
 */
import {
  AiGenerationError,
  type AttachmentMediaType,
  buildInvoicePrompt,
  INVOICE_MAX_CANDIDATES,
  INVOICE_SCAN_PROMPT_VERSION,
  type InvoiceCandidate,
  invoiceProblems,
  invoiceScanSchema,
  type LlmAdapter,
  buildReceiptPrompt,
  RECEIPT_SCAN_PROMPT_VERSION,
  receiptProblems,
  receiptScanSchema,
} from "@culinova/ai";
import { isWithinBudget, pricePerReferenceUnit, receiptLabelKey, storeKey } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ImageStorage } from "../images/storage";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
import { matchIngredients } from "../generation/matching";
import { listMyIngredients } from "./ingredients";
import { type PriceUnit, readPriceInput, savePrice, supplierFor } from "./prices";

/** Coût maximal estimé d'une lecture (pages de PDF ou photo + réflexion). */
const INVOICE_COST_USD_MICROS = 200_000;
export const INVOICE_MAX_BYTES = 4_000_000;
export const INVOICE_TYPES: readonly AttachmentMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

type ScanFailure = { ok: false; reason: "type" | "size" | "budget" | "failed" };
export type ScanResult = { ok: true; invoiceId: string } | ScanFailure;

export async function scanInvoice(
  db: Database,
  ai: LlmAdapter,
  storage: ImageStorage | null,
  userId: string,
  file: { bytes: Uint8Array; mediaType: string },
  languageCode = "fr",
  kind: "invoice" | "receipt" = "invoice",
): Promise<ScanResult> {
  if (!INVOICE_TYPES.includes(file.mediaType as AttachmentMediaType)) return { ok: false, reason: "type" };
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > INVOICE_MAX_BYTES)
    return { ok: false, reason: "size" };
  const [cap, spent] = await Promise.all([getAiBudgetCap(db), getAiSpend(db)]);
  if (!isWithinBudget(spent, cap, INVOICE_COST_USD_MICROS)) return { ok: false, reason: "budget" };

  const ingredients = (await listMyIngredients(db, userId, { languageCode })).slice(
    0,
    INVOICE_MAX_CANDIDATES,
  );
  const candidates: InvoiceCandidate[] = ingredients.map((row, index) => ({
    id: `c${index + 1}`,
    name: row.name,
    unit: row.unit,
  }));
  const byShortId = new Map(candidates.map((c, index) => [c.id, ingredients[index]!.id]));

  const [generation] = await db
    .insert(s.aiGenerations)
    .values({
      userId,
      kind: "invoice_scan",
      status: "running",
      inputRef: `${kind}:${file.mediaType}`,
      promptVersion: kind === "receipt" ? RECEIPT_SCAN_PROMPT_VERSION : INVOICE_SCAN_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });

  try {
    const attachments = [
      {
        mediaType: file.mediaType as AttachmentMediaType,
        data: Buffer.from(file.bytes).toString("base64"),
      },
    ];
    const result =
      kind === "receipt"
        ? await ai.generateStructured({
            promptId: RECEIPT_SCAN_PROMPT_VERSION,
            ...buildReceiptPrompt(candidates),
            attachments,
            schema: receiptScanSchema,
            validate: (scan) => receiptProblems(scan, candidates),
            maxOutputTokens: 16_000,
          })
        : await ai.generateStructured({
            promptId: INVOICE_SCAN_PROMPT_VERSION,
            ...buildInvoicePrompt(candidates),
            attachments,
            schema: invoiceScanSchema,
            validate: (scan) => invoiceProblems(scan, candidates),
            maxOutputTokens: 16_000,
          });
    const scan = normalizeScan(result.data);
    await db
      .update(s.aiGenerations)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        output: scan,
        provider: result.usage.provider,
        model: result.usage.model,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        costUsdMicros: result.usage.costUsdMicros,
        attempts: result.usage.attempts,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    await recordAiSpend(db, result.usage.costUsdMicros);

    // Facture : le fichier est gardé (stockage privé) pour pouvoir y revenir.
    // Ticket de caisse : la photo n'est jamais enregistrée (P8, vie privée).
    const extension = file.mediaType === "application/pdf" ? "pdf" : file.mediaType.split("/")[1];
    const fileKey = `invoices/${userId}/${randomUUID()}.${extension}`;
    let storedKey = kind === "receipt" ? "efface" : "non-stocke";
    if (storage && kind === "invoice") {
      try {
        await storage.put(fileKey, file.bytes, file.mediaType);
        storedKey = fileKey;
      } catch (error) {
        console.error(`Facture non stockée : ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Libellés déjà validés chez ce magasin : ils l'emportent sur la proposition de l'IA.
    const aliases = await aliasesFor(db, userId, scan.supplier);
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    return await db.transaction(async (tx) => {
      const supplierId = await supplierFor(tx, userId, scan.supplier);
      const date =
        scan.invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(scan.invoiceDate)
          ? new Date(`${scan.invoiceDate}T12:00:00Z`)
          : null;
      const [invoice] = await tx
        .insert(s.supplierInvoices)
        .values({
          ownerId: userId,
          supplierId,
          kind,
          fileKey: storedKey,
          invoiceDate: date && !Number.isNaN(date.getTime()) ? date : null,
          status: "parsed",
          parsedAt: new Date(),
        })
        .returning({ id: s.supplierInvoices.id });
      if (scan.lines.length > 0) {
        await tx.insert(s.supplierInvoiceLines).values(
          scan.lines.map((line) => {
            const aiMatch = line.ingredientRef ? (byShortId.get(line.ingredientRef) ?? null) : null;
            const remembered = aliases.get(receiptLabelKey(line.label)) ?? null;
            const matched = remembered && ingredientById.has(remembered) ? remembered : aiMatch;
            // Prix recalculé d'après la ligne quand c'est possible (sinon celui de l'IA).
            const target = matched ? ingredientById.get(matched)?.unit : undefined;
            const computed = target ? pricePerReferenceUnit(line, target) : null;
            const proposed = computed ?? (matched === aiMatch ? line.pricePerUnit : null);
            return {
              supplierInvoiceId: invoice!.id,
              rawLabel: line.label.slice(0, 300),
              cleanName: line.name?.slice(0, 120) ?? null,
              promo: line.promo,
              quantity: line.quantity === null ? null : line.quantity.toFixed(3),
              unit: line.unit,
              unitPriceCents:
                line.totalPrice === null
                  ? null
                  : Math.round(
                      (line.totalPrice / (line.quantity && line.quantity > 0 ? line.quantity : 1)) * 100,
                    ),
              matchedIngredientId: matched,
              proposedPricePerKg: proposed === null ? null : readPriceInput(proposed.toFixed(2)),
            };
          }),
        );
      }
      return { ok: true as const, invoiceId: invoice!.id };
    });
  } catch (error) {
    const usage = error instanceof AiGenerationError ? error.usage : undefined;
    console.error(`Lecture de facture en échec : ${error instanceof Error ? error.message : String(error)}`);
    await db
      .update(s.aiGenerations)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1000) : String(error),
        costUsdMicros: usage?.costUsdMicros ?? 0,
      })
      .where(eq(s.aiGenerations.id, generation!.id));
    if (usage?.costUsdMicros) await recordAiSpend(db, usage.costUsdMicros);
    return { ok: false, reason: "failed" };
  }
}

/** Lecture commune aux factures et aux tickets. */
interface ScanLine {
  label: string;
  name: string | null;
  quantity: number | null;
  unit: "g" | "kg" | "ml" | "cl" | "l" | "piece" | null;
  totalPrice: number | null;
  promo: boolean;
  ingredientRef: string | null;
  pricePerUnit: number | null;
}

function normalizeScan(
  data:
    | { supplier: string | null; invoiceDate: string | null; lines: Array<Omit<ScanLine, "name" | "promo">> }
    | { store: string | null; receiptDate: string | null; lines: ScanLine[] },
): { supplier: string | null; invoiceDate: string | null; lines: ScanLine[] } {
  if ("store" in data) return { supplier: data.store, invoiceDate: data.receiptDate, lines: data.lines };
  return {
    supplier: data.supplier,
    invoiceDate: data.invoiceDate,
    lines: data.lines.map((line) => ({ ...line, name: null, promo: false })),
  };
}

/** Libellés mémorisés de la personne pour ce magasin (clé du libellé → ingrédient). */
async function aliasesFor(db: Database, userId: string, store: string | null): Promise<Map<string, string>> {
  const rows = await db
    .select({ labelKey: s.priceAliases.labelKey, ingredientId: s.priceAliases.ingredientId })
    .from(s.priceAliases)
    .where(and(eq(s.priceAliases.ownerId, userId), eq(s.priceAliases.storeKey, storeKey(store))));
  return new Map(rows.map((row) => [row.labelKey, row.ingredientId]));
}

export async function listInvoices(db: Database, userId: string) {
  const rows = await db
    .select({
      id: s.supplierInvoices.id,
      supplier: s.suppliers.name,
      kind: s.supplierInvoices.kind,
      invoiceDate: s.supplierInvoices.invoiceDate,
      createdAt: s.supplierInvoices.createdAt,
      lineCount: sql<number>`(select count(*) from ${s.supplierInvoiceLines} where ${s.supplierInvoiceLines.supplierInvoiceId} = ${s.supplierInvoices.id})::int`,
      pendingCount: sql<number>`(select count(*) from ${s.supplierInvoiceLines} where ${s.supplierInvoiceLines.supplierInvoiceId} = ${s.supplierInvoices.id} and ${s.supplierInvoiceLines.decision} = 'pending' and ${s.supplierInvoiceLines.matchedIngredientId} is not null)::int`,
    })
    .from(s.supplierInvoices)
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.supplierInvoices.supplierId))
    .where(eq(s.supplierInvoices.ownerId, userId))
    .orderBy(desc(s.supplierInvoices.createdAt));
  return rows.map((row) => ({
    ...row,
    invoiceDate: row.invoiceDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface InvoiceLineView {
  id: string;
  rawLabel: string;
  /** Nom lisible (tickets). */
  cleanName: string | null;
  promo: boolean;
  /** Pour « Ajouter à mes prix » : unité naturelle de la ligne et prix calculé dans cette unité. */
  newUnit: PriceUnit | null;
  newPrice: string | null;
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  ingredientId: string | null;
  proposedPrice: string | null;
  decision: "pending" | "accepted" | "rejected";
}

export interface InvoiceView {
  id: string;
  kind: "invoice" | "receipt";
  supplier: string | null;
  invoiceDate: string | null;
  lines: InvoiceLineView[];
  ingredients: Array<{ id: string; name: string; unit: PriceUnit }>;
}

export async function loadInvoice(
  db: Database,
  userId: string,
  invoiceId: string,
  languageCode = "fr",
): Promise<InvoiceView | null> {
  const [invoice] = await db
    .select({
      id: s.supplierInvoices.id,
      kind: s.supplierInvoices.kind,
      supplier: s.suppliers.name,
      invoiceDate: s.supplierInvoices.invoiceDate,
    })
    .from(s.supplierInvoices)
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.supplierInvoices.supplierId))
    .where(and(eq(s.supplierInvoices.id, invoiceId), eq(s.supplierInvoices.ownerId, userId)));
  if (!invoice) return null;
  const lines = await db
    .select()
    .from(s.supplierInvoiceLines)
    .where(eq(s.supplierInvoiceLines.supplierInvoiceId, invoiceId))
    .orderBy(s.supplierInvoiceLines.createdAt);
  const ingredients = await listMyIngredients(db, userId, { languageCode });
  return {
    id: invoice.id,
    kind: invoice.kind,
    supplier: invoice.supplier,
    invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
    lines: lines.map((line) => {
      const quantity = line.quantity === null ? null : Number(line.quantity);
      const newUnit = naturalUnit(line.unit);
      const newPrice = newUnit
        ? pricePerReferenceUnit(
            {
              quantity,
              unit: line.unit,
              totalPrice: line.unitPriceCents === null ? null : (line.unitPriceCents * (quantity ?? 1)) / 100,
            },
            newUnit,
          )
        : null;
      return {
        id: line.id,
        rawLabel: line.rawLabel,
        cleanName: line.cleanName,
        promo: line.promo,
        newUnit,
        newPrice: newPrice === null ? null : readPriceInput(newPrice.toFixed(2)),
        quantity: line.quantity === null ? null : Number(line.quantity),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        ingredientId: line.matchedIngredientId,
        proposedPrice: line.proposedPricePerKg,
        decision: line.decision,
      };
    }),
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
  };
}

type DecideFailure = { ok: false; reason: "not_found" | "invalid" };
export type DecideResult = { ok: true; price: string | null } | DecideFailure;

/** Unité de prix naturelle d'une ligne (kg pour des grammes, l pour des cl…). */
function naturalUnit(unit: string | null): PriceUnit | null {
  if (unit === "g" || unit === "kg") return "kg";
  if (unit === "ml" || unit === "cl" || unit === "l") return "l";
  if (unit === "piece") return "piece";
  return null;
}

/** Ingrédient « Ajouter à mes prix » : retrouvé par son nom, ou créé dans la base de la personne. */
async function ingredientForNewLine(
  db: Database,
  userId: string,
  name: string,
  unit: PriceUnit,
  languageCode: string,
): Promise<string> {
  const [match] = await matchIngredients(
    db,
    userId,
    [{ name, unit: unit === "kg" ? "g" : unit === "l" ? "ml" : "piece" }],
    languageCode,
  );
  // Ajouté par la personne elle-même : rien à confirmer.
  await db
    .update(s.ingredients)
    .set({ status: "confirmed" })
    .where(and(eq(s.ingredients.id, match!.ingredientId), eq(s.ingredients.ownerId, userId)));
  return match!.ingredientId;
}

/**
 * Valide une ligne (le prix devient celui de l'ingrédient) ou l'ignore. `ingredientId: "new"` :
 * l'article du ticket est ajouté à « Mes prix » sous son nom lisible. Le libellé validé est
 * mémorisé pour le prochain ticket du même magasin.
 */
export async function decideInvoiceLine(
  db: Database,
  userId: string,
  lineId: string,
  decision: { accept: true; ingredientId: string; price: string } | { accept: false },
  languageCode = "fr",
): Promise<DecideResult> {
  const [line] = await db
    .select({
      id: s.supplierInvoiceLines.id,
      supplier: s.suppliers.name,
      kind: s.supplierInvoices.kind,
      rawLabel: s.supplierInvoiceLines.rawLabel,
      cleanName: s.supplierInvoiceLines.cleanName,
      unit: s.supplierInvoiceLines.unit,
      promo: s.supplierInvoiceLines.promo,
    })
    .from(s.supplierInvoiceLines)
    .innerJoin(s.supplierInvoices, eq(s.supplierInvoices.id, s.supplierInvoiceLines.supplierInvoiceId))
    .leftJoin(s.suppliers, eq(s.suppliers.id, s.supplierInvoices.supplierId))
    .where(and(eq(s.supplierInvoiceLines.id, lineId), eq(s.supplierInvoices.ownerId, userId)));
  if (!line) return { ok: false, reason: "not_found" };
  if (!decision.accept) {
    await db
      .update(s.supplierInvoiceLines)
      .set({ decision: "rejected", decidedAt: new Date() })
      .where(eq(s.supplierInvoiceLines.id, lineId));
    return { ok: true, price: null };
  }
  let ingredientId = decision.ingredientId;
  if (ingredientId === "new") {
    const unit = naturalUnit(line.unit);
    const name = (line.cleanName ?? line.rawLabel).trim();
    if (!unit || !name || !readPriceInput(decision.price)) return { ok: false, reason: "invalid" };
    ingredientId = await ingredientForNewLine(db, userId, name, unit, languageCode);
  }
  const saved = await savePrice(db, {
    userId,
    ingredientId,
    price: decision.price,
    supplierName: line.supplier,
    source: line.kind === "receipt" ? "receipt" : "invoice",
    isPromo: line.promo,
    supplierInvoiceLineId: lineId,
  });
  if (!saved.ok) return { ok: false, reason: saved.reason === "not_found" ? "not_found" : "invalid" };
  await db
    .update(s.supplierInvoiceLines)
    .set({
      decision: "accepted",
      decidedAt: new Date(),
      matchedIngredientId: ingredientId,
      proposedPricePerKg: saved.price,
    })
    .where(eq(s.supplierInvoiceLines.id, lineId));
  // Mémoire du libellé : au prochain ticket de ce magasin, rapproché d'office.
  const key = receiptLabelKey(line.rawLabel);
  if (key) {
    await db
      .insert(s.priceAliases)
      .values({ ownerId: userId, storeKey: storeKey(line.supplier), labelKey: key, ingredientId })
      .onConflictDoUpdate({
        target: [s.priceAliases.ownerId, s.priceAliases.storeKey, s.priceAliases.labelKey],
        set: { ingredientId, updatedAt: new Date() },
      });
  }
  return { ok: true, price: saved.price };
}
