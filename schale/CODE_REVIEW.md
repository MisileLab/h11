# Schale Code Review

**Generated:** 2026-02-14
**Scope:** `schale/frontend/` and `schale/scripts/`

---

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| **Runtime Bugs** | 2 | 1 | 2 | 1 |
| **Security** | 0 | 4 | 2 | 1 |
| **Accessibility** | 0 | 2 | 3 | 1 |
| **Code Quality** | 0 | 0 | 5 | 3 |

---

## Critical Issues

### 1. TypeScript Syntax in Plain JS Script (Will Break Browser)

**File:** `src/components/neural-network.astro:165-274`

```javascript
// Lines 166-172: TypeScript field declarations INVALID in browser
neurons: NodeListOf<Element>;
connections: NodeListOf<Element>;
outputElement: HTMLElement | null;
```

**Problem:** The `<script>` block contains TypeScript syntax (type annotations, `as` casts) but is not marked as TypeScript. This causes `SyntaxError: Unexpected token ':'` in browsers.

**Fix Options:**

- **Option A:** Convert to valid JavaScript (remove all type annotations and `as` casts)
- **Option B:** Change to `<script type="ts">` and ensure Astro compiles client TS

---

### 2. Runtime Error: Unprotected DOM Global Access

**File:** `src/components/request.ts:9-19`

```typescript
export const getUrl = ()=>{
  if (import.meta.env.PROD && document !== undefined) {  // ❌ ReferenceError on server
    if (location.hostname.endsWith("onion")) {           // ❌ ReferenceError on server
```

**Problem:** `document !== undefined` throws `ReferenceError` on the server (Node.js). Same for `location`.

**Fix:**

```typescript
export const getUrl = ()=>{
  if (import.meta.env.PROD && typeof document !== "undefined") {
    if (typeof location !== "undefined" && location.hostname.endsWith("onion")) {
```

---

## High Priority Issues

### 3. Missing Security Headers

**File:** `astro.config.mjs:9-27`

**Problem:** No security headers configured. No HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy.

**Fix:** Add server middleware:

```javascript
// Example middleware to add in astro.config.mjs or separate file
securityHeaders: {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), microphone=()',
}
```

---

### 4. No Content-Security-Policy (CSP)

**File:** `astro.config.mjs:9-27`

**Problem:** Astro's `experimental.csp` not enabled. No CSP header or meta tag set anywhere.

**Fix:** Enable CSP in Astro config:

```javascript
export default defineConfig({
  experimental: {
    csp: {
      directives: ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'"],
      algorithm: 'SHA-256'
    }
  },
  // ...
});
```

---

### 5. Dockerfile Ships Build Tools to Runtime

**File:** `Dockerfile:17-19`

```dockerfile
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules  # ❌ Contains ALL deps including dev
COPY package.json ./package.json
```

**Problem:** Runtime image includes TypeScript, Vite, Tailwind, ESLint, and all devDependencies.

**Fix:**

1. Move build tools to `devDependencies` in `package.json`
2. Add production-only install stage:

```dockerfile
FROM base AS runtime-deps
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn workspaces focus --production

FROM base AS runtime
COPY --from=build /app/dist ./dist
COPY --from=runtime-deps /app/node_modules ./node_modules
```

---

### 6. Unused Headers Variable + Incorrect Fetch Usage

**File:** `src/components/request.ts:44-52`

```typescript
const header = new Headers()       // ❌ Created but never used
for (const i of Object.keys(headers)) {
  header.append(i, headers[i])
}
const f = await fetch(path, {method: method, headers: headers, body: fd})  // ❌ Uses raw headers
const status = f.clone().status;   // ❌ Unnecessary clone
const ok = f.clone().ok;           // ❌ Second unnecessary clone
```

**Fix:**

```typescript
const header = new Headers(headers);
const resp = await fetch(path, { method, headers: header, body: fd });
if (!resp.ok) throw new StatusError(resp.status);
return await resp.json() as T;
```

---

# reviewed

### 7. Accessibility: Non-Keyboard-Accessible Interactive Elements

**Files:**

- `src/pages/contact.astro:61`
- `src/pages/index.astro:40`

```html
<span class="text-indigo-200" id="placeholder">None</span>  <!-- ❌ Not focusable -->
<button class="..." id="crypto">...</button>               <!-- ❌ Missing type="button" -->
```

**Fix:**

```html
<button id="placeholder" type="button" aria-label="Copy contact value">None</button>
<button id="crypto" type="button">...</button>
```

---

### 8. Accessibility: Unlabeled Select Elements

**Files:**

- `src/pages/projects.astro:104`
- `src/pages/contact.astro:55`

```html
<select id="select" class="bg-gray-950 text-indigo-100"></select>  <!-- ❌ No label -->
```

**Fix:**

```html
<label for="select" class="sr-only">Select a project</label>
<select id="select" class="bg-gray-950 text-indigo-100">...</select>
```

---

### 9. Canvas Missing ARIA Semantics

**File:** `src/pages/index.astro:25`

```html
<canvas id="hero-canvas" class="absolute inset-0..."></canvas>  <!-- ❌ No ARIA -->
```

**Fix:**

```html
<canvas id="hero-canvas" aria-hidden="true" class="absolute inset-0..."></canvas>
```

---

## Medium Priority Issues

### 10. Props Default Inconsistency

**Files:**

- `src/components/base.astro:11` — `rewind = false`
- `src/components/content.astro:12` — `rewind = true`

**Problem:** Same prop has different defaults in parent/child components.

**Fix:** Decide on a canonical default and align both components.

---

### 11. Misleading Prop Name

**File:** `src/components/post.astro:7`

```typescript
path: number  // ❌ Name suggests string/slug, type is number
```

**Fix:** Rename to `id` or change type to `string`.

---

### 12. Non-Standard Prop Name

**File:** `src/components/modal.astro:5`

```typescript
classv?: string  // ❌ Non-standard naming
```

**Fix:** Use `className` or accept `class`.

---

### 13. Empty News Descriptions

**File:** `src/pages/data/news/1.astro:5` (and others)

```typescript
<Content title="..." description="" date={...} isnews={true}>
```

**Problem:** Empty description = missing meta description for SEO.

**Fix:** Populate descriptions for all news entries.

---

### 14. Client-Only Content (SEO/Crawler Issue)

**File:** `src/pages/projects.astro:104-107`

```html
<select id="select" class="..."></select>  <!-- Empty on SSR -->
<p id="description" />                      <!-- Empty self-closing tag -->
<p id="stacks" />                           <!-- Empty self-closing tag -->
<a id="clicktogo" class="..." />            <!-- Empty self-closing tag -->
```

**Problem:** All content populated by client JS. Crawlers see empty page.

**Fix:** Server-render the projects data:

```astro
---
const projects = { /* ... */ };
const defaultProject = Object.keys(projects).toReversed()[0];
---
<select id="select">
  {Object.keys(projects).toReversed().map((key, i) => (
    <option value={key} selected={i === 0}>{key}</option>
  ))}
</select>
<p id="description">description: {projects[defaultProject].description}</p>
```

---

### 15. Duplicate H1 in News Content

**File:** `src/pages/data/news/1.astro:6`

```html
<Content title="러스트로 OS 만들기" ...>
  <h1>GitHub 기본 OS 작성 자료</h1>  <!-- ❌ Content already renders H1 -->
```

**Fix:** Change to `<h2>`.

---

### 16. Missing hreflang for Language Alternates

**Files:**

- `src/pages/en/blog/index.astro:10`
- `src/pages/ko/blog/index.astro:10`

**Fix:** Add to `<head>`:

```html
<link rel="alternate" hreflang="en" href="https://misile.xyz/en/blog" />
<link rel="alternate" hreflang="ko" href="https://misile.xyz/ko/blog" />
```

---

### 17. Container Runs as Root

**File:** `Dockerfile:21`

**Fix:** Add non-root user:

```dockerfile
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
USER appuser
CMD ["node", "./dist/server/entry.mjs"]
```

---

### 18. Build Tools in Dependencies

**File:** `package.json:18-31`

The following packages are in `dependencies` but should be in `devDependencies`:

- `typescript`
- `vite`
- `tailwindcss`
- `@tailwindcss/vite`
- `@astrojs/check`

**Fix:** Move these to `devDependencies` and update Dockerfile accordingly.

---

## Low Priority Issues

### 19. Class Naming Convention

**File:** `src/components/request.ts:1`

```typescript
export class statusError extends Error {  // ❌ lowercase class name
```

**Fix:** Rename to `StatusError`

---

### 20. Loose Equality Check

**File:** `src/components/lib.ts:7`

```typescript
return h.innerText == "" && h.textContent !== null ? h.textContent : h.innerText;
```

**Fix:** Use strict equality `=== ""`

---

### 21. Missing Return Type

**File:** `src/components/lib.ts:6`

```typescript
export function getTextContent(h: HTMLElement) {  // ❌ No return type
```

**Fix:**

```typescript
export function getTextContent(h: HTMLElement): string {
  return h.innerText || (h.textContent ?? "");
}
```

---

### 22. Environment Variable Types Not Declared

**File:** `src/env.d.ts:1-3`

**Fix:** Add typed env interface:

```typescript
interface ImportMetaEnv {
  readonly PROD: boolean;
  // Add other env vars as needed
}
```

---

### 23. Duplicate Code in Blog Index Pages

**Files:**

- `src/pages/en/blog/index.astro`
- `src/pages/ko/blog/index.astro`

**Problem:** Near-identical templates with hard-coded post lists.

**Fix:** Create a shared blog index component with data-driven rendering.

---

## Recommended Action Order

| Priority | Issue | File | Effort |
|----------|-------|------|--------|
| 1 | Fix neural-network.astro TS-in-JS bug | `neural-network.astro` | Low |
| 2 | Fix request.ts DOM guard + fetch issues | `request.ts` | Low |
| 3 | Add security headers middleware | `astro.config.mjs` | Medium |
| 4 | Enable CSP | `astro.config.mjs` | Medium |
| 5 | Fix Dockerfile + move devDeps | `Dockerfile`, `package.json` | Medium |
| 6 | Fix accessibility (buttons, labels, ARIA) | Multiple | Low |
| 7 | Server-render projects data | `projects.astro` | Medium |
| 8 | Align Props defaults and naming | Multiple | Low |

---

## Validation Commands

```bash
# Type checking and linting
cd schale/frontend
yarn lint
yarn build

# Dependency audit
yarn audit

# Docker build test
docker build -t schale-test .

# Run container and test
docker run -p 4321:4321 schale-test
curl -I http://localhost:4321  # Check headers
```
