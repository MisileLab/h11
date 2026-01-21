# AGENTS
## Commands
- Package manager: yarn (see package.json packageManager).
- Dev: yarn dev (alias: yarn start).
- Build: yarn build (runs astro check && astro build).
- Preview: yarn preview.
- Typecheck only: yarn astro check.
- Lint: yarn lint (oxlint + eslint).
- Format: yarn format (oxfmt).

## Code Style
- TypeScript strict via astro/tsconfigs/strict; avoid any and keep export types explicit.
- ES modules throughout; prefer named exports for shared utilities.
- Import grouping: external then local with blank lines where present.
- Formatting: match file-local style; TS/Astro mostly omit semicolons and use double quotes.
- Indentation appears 2 spaces in TS/config; keep consistent within file.
- Naming: camelCase vars/functions, PascalCase types/components; keep existing exceptions (e.g., statusError).
- Error handling: throw explicit errors; avoid empty catch blocks.
- Data fetching: check response.ok before JSON parse; keep generic return types.
- Layout: pages in src/pages, components in src/components, styles in src/styles.
- Astro config: astro.config.mjs uses Tailwind via Vite and sitemap/node adapters.
