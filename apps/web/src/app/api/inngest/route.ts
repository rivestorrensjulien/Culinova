import { functions, inngest } from "@culinova/jobs";
import { serve } from "inngest/next";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
