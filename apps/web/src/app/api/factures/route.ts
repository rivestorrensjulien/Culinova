/**
 * Lecture d'une facture envoyée depuis « Ingrédients → Factures » (photo ou PDF,
 * 4 Mo au plus). Réponse : l'identifiant de la facture lue, à valider ligne par ligne.
 */
import { createLlmAdapter } from "@culinova/ai";
import { scanInvoice } from "@/server/costing/invoices";
import { getDb } from "@/server/db";
import { createImageStorage, type ImageStorage } from "@/server/images/storage";
import { getCurrentSession } from "@/server/session";

export const dynamic = "force-dynamic";
// Lecture d'un PDF de plusieurs pages : jusqu'à 5 minutes (limite de Vercel).
export const maxDuration = 300;

function storageOrNull(): ImageStorage | null {
  try {
    return createImageStorage();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ ok: false, reason: "auth" }, { status: 401 });
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file) return Response.json({ ok: false, reason: "type" }, { status: 400 });
  const result = await scanInvoice(
    getDb(),
    createLlmAdapter(process.env, { effort: "medium" }),
    storageOrNull(),
    session.user.id,
    { bytes: new Uint8Array(await file.arrayBuffer()), mediaType: file.type },
    session.user.locale === "en" ? "en" : "fr",
  );
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
