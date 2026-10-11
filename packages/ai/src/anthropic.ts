/**
 * Adaptateur Claude (API Anthropic). Sortie JSON contrainte par schéma
 * (sorties structurées), puis validée par Zod et par les règles métier ;
 * en cas d'écart, une nouvelle tentative est faite en renvoyant les erreurs au modèle.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  AiGenerationError,
  type AiUsage,
  type LlmAdapter,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./adapters";
import { costUsdMicros, DEFAULT_RECIPE_MODEL } from "./models";

export interface AnthropicAdapterOptions {
  /** Clé API (par défaut : variable d'environnement ANTHROPIC_API_KEY). */
  apiKey?: string;
  /**
   * Espace de travail Anthropic (wrkspc_…), exigé quand la clé API n'est rattachée
   * à aucun espace de travail : envoyé dans l'en-tête anthropic-workspace-id.
   */
  workspaceId?: string;
  model?: string;
  /** Effort de réflexion : profondeur du raisonnement et coût. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Nombre maximal d'appels pour obtenir une sortie valide (relances comprises). */
  maxAttempts?: number;
  /** Client injecté (tests). */
  client?: Pick<Anthropic, "messages">;
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Explication lisible d'une erreur de l'API (code HTTP, type et message renvoyés par Anthropic). */
export function describeApiError(error: unknown): string {
  if (!(error instanceof Anthropic.APIError)) return error instanceof Error ? error.message : String(error);
  const body = error.error as { error?: { type?: unknown; message?: unknown } } | undefined;
  const type = typeof body?.error?.type === "string" ? body.error.type : undefined;
  const message = typeof body?.error?.message === "string" ? body.error.message : error.message;
  return [error.status, type, message, error.requestID ? `(requête ${error.requestID})` : undefined]
    .filter((part) => part !== undefined && part !== "")
    .join(" · ");
}

export class AnthropicAdapter implements LlmAdapter {
  readonly provider = "anthropic";
  private readonly client: Pick<Anthropic, "messages">;
  private readonly model: string;
  private readonly effort: NonNullable<AnthropicAdapterOptions["effort"]>;
  private readonly maxAttempts: number;

  constructor(options: AnthropicAdapterOptions = {}) {
    this.client =
      options.client ??
      new Anthropic({
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        ...(options.workspaceId ? { defaultHeaders: { "anthropic-workspace-id": options.workspaceId } } : {}),
        // Une recette complète peut demander plus d'une minute de génération.
        timeout: 5 * 60 * 1000,
      });
    this.model = options.model ?? DEFAULT_RECIPE_MODEL;
    this.effort = options.effort ?? "high";
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async generateStructured<T extends z.ZodType>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<z.infer<T>>> {
    // Seul le schéma JSON est envoyé ; la validation est faite ici, avec Zod.
    const { parse: _parse, ...format } = zodOutputFormat(request.schema);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: request.user }];
    const started = Date.now();
    const usage: AiUsage = {
      provider: this.provider,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsdMicros: 0,
      durationMs: 0,
      attempts: 0,
    };

    let lastProblems: string[] = [];
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: request.maxOutputTokens ?? 16_000,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          thinking: { type: "adaptive" },
          output_config: { effort: this.effort, format },
          messages,
        });
      } catch (error) {
        usage.durationMs = Date.now() - started;
        const detail = describeApiError(error);
        throw new AiGenerationError("provider_error", `Le service d'IA n'a pas répondu : ${detail}`, usage);
      }

      usage.attempts = attempt;
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.costUsdMicros += costUsdMicros(this.model, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      });
      usage.durationMs = Date.now() - started;

      if (response.stop_reason === "refusal") {
        throw new AiGenerationError(
          "refusal",
          "La demande a été refusée par le modèle. Reformulez votre saisie.",
          usage,
        );
      }
      if (response.stop_reason === "max_tokens") {
        throw new AiGenerationError("truncated", "La réponse a été coupée avant la fin.", usage);
      }

      const text = extractText(response);
      let candidate: unknown;
      try {
        candidate = JSON.parse(text);
      } catch {
        lastProblems = ["La réponse n'est pas un JSON valide."];
      }
      if (candidate !== undefined) {
        const parsed = request.schema.safeParse(candidate);
        if (parsed.success) {
          lastProblems = request.validate?.(parsed.data) ?? [];
          if (lastProblems.length === 0) return { data: parsed.data, usage };
        } else {
          lastProblems = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")} : ${i.message}`);
        }
      }

      // Nouvelle tentative : on renvoie la réponse telle quelle, puis les erreurs à corriger.
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: `La réponse ne respecte pas les règles :\n- ${lastProblems.join("\n- ")}\nCorrige ces points et renvoie la recette complète.`,
      });
    }
    throw new AiGenerationError(
      "invalid_output",
      `La réponse de l'IA est restée invalide après ${this.maxAttempts} tentatives : ${lastProblems.join(" ; ")}`,
      usage,
    );
  }
}
