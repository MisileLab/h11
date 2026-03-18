<!-- Parent: ../AGENTS.md -->
# GITHUB

## OVERVIEW
CI/CD workflows and funding configuration.

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale Docker | `workflows/schale-docker-publish.yml` | Builds/pushes ghcr.io image on main push |
| Agent workflow | `workflows/agent.yml` | `/crystal` trigger; commits as SimplyCrystal |
| Auto review | `workflows/auto-review.yml` | `/review` trigger; OWNER only |
| Funding | `FUNDING.yml` | Sponsor metadata |

## CONVENTIONS
- Schale Docker triggers on `schale/frontend/**` changes to main + manual dispatch.
- Docker tags: branch name, SHA, `latest` (default branch only via `enable={{is_default_branch}}`).
- Push gated by `env.ACT != 'true'` to block local Act testing.
- Agent workflows use `secrets.GH_PAT` for checkout (fork PR support).
- Agent git identity: `SimplyCrystal <misile@duck.com>`; never pushes to main/master.
- Both agent workflows self-exclude `simplycrystal` bot to prevent loops.
- 7 secrets required: `GH_PAT`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, plus 4 OpenCode JSON configs.
