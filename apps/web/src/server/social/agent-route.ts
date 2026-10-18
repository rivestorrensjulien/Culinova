import { agentAuthorized, agentEnabled } from "../publishing";

/** Refus d'un appel à la porte de l'agent : porte fermée (503) ou mauvaise clé (401). */
export function refuseAgent(request: Request): Response | null {
  if (!agentEnabled()) return Response.json({ error: "agent_disabled" }, { status: 503 });
  if (!agentAuthorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
