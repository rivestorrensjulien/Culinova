/**
 * Scan de factures : l'IA lit la facture (photo ou PDF), rapproche chaque ligne d'un
 * ingrédient de la personne et propose un prix au kilo, au litre ou à la pièce.
 * Rien n'est enregistré sans validation ligne par ligne (source « invoice »).
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
} from "@culinova/ai";
import { isWithinBudget } from "@culinova/core";
import type { Database } from "@culinova/db";
import * as s from "@culinova/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { ImageStorage } from "../images/storage";
import { getAiBudgetCap, getAiSpend, recordAiSpend } from "../quotas";
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
      inputRef: `invoice:${file.mediaType}`,
      promptVersion: INVOICE_SCAN_PROMPT_VERSION,
      startedAt: new Date(),
    })
    .returning({ id: s.aiGenerations.id });

  try {
    const result = await ai.generateStructured({
      promptId: INVOICE_SCAN_PROMPT_VERSION,
      ...buildInvoicePrompt(candidates),
      attachments: [
        {
          mediaType: file.mediaType as AttachmentMediaType,
          data: Buffer.from(file.bytes).toString("base64"),
        },
      ],
      schema: invoiceScanSchema,
      validate: (scan) => invoiceProblems(scan, candidates),
      maxOutputTokens: 16_000,
    });
    const scan = result.data;
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

    // Le fichier est gardé (stockage privé) pour pouvoir revenir à la facture.
    const extension = file.mediaType === "application/pdf" ? "pdf" : file.mediaType.split("/")[1];
    const fileKey = `invoices/${userId}/${randomUUID()}.${extension}`;
    let storedKey = "non-stocke";
    if (storage) {
      try {
        await storage.put(fileKey, file.bytes, file.mediaType);
        storedKey = fileKey;
      } catch (error) {
        console.error(`Facture non stockée : ${error instanceof Error ? error.message : String(error)}`);
      }
    }

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
          fileKey: storedKey,
          invoiceDate: date && !Number.isNaN(date.getTime()) ? date : null,
          status: "parsed",
          parsedAt: new Date(),
        })
        .returning({ id: s.supplierInvoices.id });
      if (scan.lines.length > 0) {
        await tx.insert(s.supplierInvoiceLines).values(
          scan.lines.map((line) => ({
            supplierInvoiceId: invoice!.id,
            rawLabel: line.label.slice(0, 300),
            quantity: line.quantity === null ? null : line.quantity.toFixed(3),
            unit: line.unit,
            unitPriceCents:
              line.totalPrice === null
                ? null
                : Math.round(
                    (line.totalPrice / (line.quantity && line.quantity > 0 ? line.quantity : 1)) * 100,
                  ),
            matchedIngredientId: line.ingredientRef ? (byShortId.get(line.ingredientRef) ?? null) : null,
            proposedPricePerKg:
              line.pricePerUnit === null ? null : readPriceInput(line.pricePerUnit.toFixed(2)),
          })),
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

export async function listInvoices(db: Database, userId: string) {
  const rows = await db
    .select({
      id: s.supplierInvoices.id,
      supplier: s.suppliers.name,
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
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  ingredientId: string | null;
  proposedPrice: string | null;
  decision: "pending" | "accepted" | "rejected";
}

export interface InvoiceView {
  id: string;
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
    supplier: invoice.supplier,
    invoiceDate: invoice.invoiceDate?.toISOString() ?? null,
    lines: lines.map((line) => ({
      id: line.id,
      rawLabel: line.rawLabel,
      quantity: line.quantity === null ? null : Number(line.quantity),
      unit: line.unit,
      unitPriceCents: line.unitPriceCents,
      ingredientId: line.matchedIngredientId,
      proposedPrice: line.proposedPricePerKg,
      decision: line.decision,
    })),
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
  };
}

type DecideFailure = { ok: false; reason: "not_found" | "invalid" };
export type DecideResult = { ok: true; price: string | null } | DecideFailure;

/** Valide une ligne (le prix devient celui de l'ingrédient) ou l'ignore. */
export async function decideInvoiceLine(
  db: Database,
  userId: string,
  lineId: string,
  decision: { accept: true; ingredientId: string; price: string } | { accept: false },
): Promise<DecideResult> {
  const [line] = await db
    .select({ id: s.supplierInvoiceLines.id, supplier: s.suppliers.name })
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
  const saved = await savePrice(db, {
    userId,
    ingredientId: decision.ingredientId,
    price: decision.price,
    supplierName: line.supplier,
    source: "invoice",
    supplierInvoiceLineId: lineId,
  });
  if (!saved.ok) return { ok: false, reason: saved.reason === "not_found" ? "not_found" : "invalid" };
  await db
    .update(s.supplierInvoiceLines)
    .set({
      decision: "accepted",
      decidedAt: new Date(),
      matchedIngredientId: decision.ingredientId,
      proposedPricePerKg: saved.price,
    })
    .where(eq(s.supplierInvoiceLines.id, lineId));
  return { ok: true, price: saved.price };
}
