/** Scan de factures : lecture, rapprochement, validation ligne par ligne. */
import { FakeLlmAdapter } from "@culinova/ai";
import * as s from "@culinova/db/schema";
import { eq } from "drizzle-orm";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyWizardState, type WizardState } from "@/lib/wizard";
import { createTestUser, hasTestDb, testDb } from "@/test/db";
import { runGeneration } from "../generation/run";
import { startRecipeGeneration } from "../generation/start";
import { LocalStorage } from "../images/storage";
import { decideInvoiceLine, listInvoices, loadInvoice, scanInvoice } from "./invoices";
import { currentPrices, priceHistoryOf } from "./prices";

const state: WizardState = {
  ...emptyWizardState("fr"),
  step: 9,
  momentCode: "main",
  influenceCode: "asia",
  regionCode: "east_asia",
  countryIso: "JP",
  cuisineCodes: ["japanese"],
  styleCode: "creative",
  mode: "idea",
  input: "Un plat de saumon",
  servings: 4,
};

// Plus petit PNG valide (1 × 1 pixel).
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe.skipIf(!hasTestDb)("factures fournisseurs", () => {
  it("lit une facture, propose les prix et n'enregistre que ce qui est validé", async () => {
    const db = testDb();
    const user = await createTestUser();
    const [draft] = await db
      .insert(s.recipeDrafts)
      .values({ userId: user.id, state, wizardStep: 9 })
      .returning();
    const started = await startRecipeGeneration(db, { userId: user.id, draftId: draft!.id });
    if (!started.ok) throw new Error(started.reason);
    await runGeneration(db, new FakeLlmAdapter(), started.generationId);
    const storage = new LocalStorage(await mkdtemp(join(tmpdir(), "culinova-invoices-")));

    expect(
      await scanInvoice(db, new FakeLlmAdapter(), storage, user.id, {
        bytes: new Uint8Array([1]),
        mediaType: "text/plain",
      }),
    ).toEqual({ ok: false, reason: "type" });

    const result = await scanInvoice(db, new FakeLlmAdapter(), storage, user.id, {
      bytes: PNG,
      mediaType: "image/png",
    });
    if (!result.ok) throw new Error(result.reason);
    const invoice = (await loadInvoice(db, user.id, result.invoiceId))!;
    expect(invoice.supplier).toBe("Fournisseur test");
    expect(invoice.invoiceDate?.slice(0, 10)).toBe("2026-10-01");
    expect(invoice.lines).toHaveLength(4);
    const matched = invoice.lines.filter((l) => l.ingredientId);
    expect(matched).toHaveLength(3);
    expect(matched[0]!.proposedPrice).toBe("5.0000");

    // Rien n'est enregistré avant validation.
    const ingredientId = matched[0]!.ingredientId!;
    expect((await currentPrices(db, user.id, [ingredientId])).has(ingredientId)).toBe(false);
    expect(
      await decideInvoiceLine(db, user.id, matched[0]!.id, { accept: true, ingredientId, price: "4,80" }),
    ).toEqual({
      ok: true,
      price: "4.8000",
    });
    const price = (await currentPrices(db, user.id, [ingredientId])).get(ingredientId)!;
    expect(price).toMatchObject({ price: "4.8000", supplierName: "Fournisseur test", estimated: false });
    expect((await priceHistoryOf(db, user.id, ingredientId))[0]).toMatchObject({ source: "invoice" });

    const fees = invoice.lines.find((l) => !l.ingredientId)!;
    expect(await decideInvoiceLine(db, user.id, fees.id, { accept: false })).toEqual({
      ok: true,
      price: null,
    });
    const intruder = await createTestUser();
    expect(await decideInvoiceLine(db, intruder.id, matched[1]!.id, { accept: false })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await loadInvoice(db, intruder.id, result.invoiceId)).toBeNull();
    const [listed] = await listInvoices(db, user.id);
    expect(listed).toMatchObject({ lineCount: 4, pendingCount: 2 });
  });
});
