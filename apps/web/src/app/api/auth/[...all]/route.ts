import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/session";

/** Routes de Better Auth (vérification du lien magique, session, déconnexion…). */
export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
