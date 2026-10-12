import { describe, expect, it } from "vitest";
import { fakeInvoice } from "../fake";
import { buildInvoicePrompt, invoiceProblems, invoiceScanSchema } from "./invoice";

const candidates = [
  { id: "c1", name: "Beurre doux", unit: "kg" as const },
  { id: "c2", name: "Lait entier", unit: "l" as const },
];

describe("lecture de facture", () => {
  it("liste les ingrédients à rapprocher", () => {
    const { user } = buildInvoicePrompt(candidates);
    expect(user).toContain("- c1 · Beurre doux · €/kg");
    expect(user).toContain("- c2 · Lait entier · €/l");
  });

  it("accepte une lecture cohérente et signale les erreurs", () => {
    const scan = invoiceScanSchema.parse(fakeInvoice(buildInvoicePrompt(candidates).user));
    expect(scan.lines.filter((l) => l.ingredientRef)).toHaveLength(2);
    expect(invoiceProblems(scan, candidates)).toEqual([]);
    const broken = {
      ...scan,
      invoiceDate: "01/10/2026",
      lines: [{ ...scan.lines[0]!, ingredientRef: "c9", pricePerUnit: -2 }],
    };
    expect(invoiceProblems(broken, candidates)).toEqual([
      "Ligne 1 : ingrédient inconnu c9.",
      "Ligne 1 : pricePerUnit doit être positif ou null.",
      "invoiceDate doit être au format AAAA-MM-JJ ou null.",
    ]);
  });
});
