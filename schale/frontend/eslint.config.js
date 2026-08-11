import js from "@eslint/js";
import oxlint from "eslint-plugin-oxlint";
import tsParser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";

export default [
  {
    ignores: ["dist/", ".astro/", "node_modules/", "src/pages/contact.astro"],
  },
  js.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      globals: {
        // Browser globals
        HTMLElement: "readonly",
        location: "readonly",
        FormData: "readonly",
        Headers: "readonly",
        fetch: "readonly",
        Response: "readonly",
        navigator: "readonly",
        window: "readonly",
        document: "readonly",
        // Node globals (for middleware.ts)
        process: "readonly",
      },
    },
  },
  // Disable overlapping ESLint rules covered by oxlint for speed/consistency.
  ...oxlint.configs["flat/recommended"],
];
