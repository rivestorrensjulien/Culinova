import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
  { ignores: [".next/**", "next-env.d.ts"] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  prettier,
];

export default config;
