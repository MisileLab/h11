# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-23 09:30:40Z
**Commit:** 1805edf
**Branch:** main

## OVERVIEW
Monorepo with three projects: Schale (Astro SSR site), Corin (Python embedding compressor), and attn (Unity game). Each subproject uses its own toolchain.

## STRUCTURE
```
h11/
├── attn/           # Unity project
├── corin/          # Python embedding compressor
├── schale/         # Astro SSR website
└── .github/        # CI/CD workflow
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale config | `schale/frontend/astro.config.mjs` | SSR, sitemap filter, Tailwind v4 |
| Schale routes | `schale/frontend/src/pages` | Astro file-based routes |
| Schale components | `schale/frontend/src/components` | Base/content layouts, request helpers |
| Schale styles | `schale/frontend/src/styles/global.css` | Tailwind import |
| Schale scripts | `schale/scripts` | Interactive Python helpers |
| Corin training | `corin/train.py` | Training entry point |
| Corin compressor | `corin/compressor.py` | Core model logic |
| Corin evaluation | `corin/eval.py` | Evaluation utilities |
| Corin tests | `corin/test_*.py` | Pytest-based tests |
| attn gameplay | `attn/Assets/Scripts` | Unity C# scripts |
| attn scenes | `attn/Assets/Scenes` | Unity scenes |
| attn settings | `attn/ProjectSettings` | Unity project settings |
| CI/CD | `.github/workflows/schale-docker-publish.yml` | Docker build/push |

## CONVENTIONS
- Each subproject is isolated: Schale uses Yarn 4, Corin uses pyproject + uv.lock, attn uses Unity Package Manager.
- Schale uses Tailwind v4 via Vite (no tailwind.config file).
- Schale has no test suite; build runs `astro check`.
- Corin requires Python >=3.14 and pins dependencies in `corin/pyproject.toml`.
- attn targets Unity 6000.3.4f1; dependencies live in `attn/Packages/manifest.json`.
- Font assets in `schale/frontend/public/fonts` are large; avoid moving unless required.

## ANTI-PATTERNS (THIS PROJECT)
- Do not edit or commit generated Unity directories: `attn/Library`, `attn/Logs`, `attn/UserSettings`.
- Do not commit local Python environments like `corin/.venv`.

## COMMANDS
```bash
# Schale (Astro)
cd schale/frontend
yarn dev
yarn build
yarn lint
yarn format

# Corin (Python)
python -m venv .venv
. .venv/bin/activate
pip install -e .
pytest
```

## NOTES
- Schale uses manual i18n via `src/pages/en` and `src/pages/ko`.
- News pages under `src/pages/data/news` are excluded from the sitemap.
- attn includes a git-based Unity package: `com.coplaydev.unity-mcp`.
