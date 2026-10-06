import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les paquets internes sont livrés en TypeScript source : Next les compile.
  transpilePackages: [
    "@culinova/ui",
    "@culinova/core",
    "@culinova/ai",
    "@culinova/db",
    "@culinova/emails",
    "@culinova/jobs",
  ],
  typedRoutes: true,
  poweredByHeader: false,
};

export default nextConfig;
