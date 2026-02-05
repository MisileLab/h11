<!-- Parent: ../AGENTS.md -->
# GITHUB

## OVERVIEW
CI/CD workflows and funding configuration.

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale Docker | `workflows/schale-docker-publish.yml` | Builds/pushes Schale image |
| Agent workflow | `workflows/agent.yml` | Runs OpenCode agent and can commit/push |
| Auto review | `workflows/auto-review.yml` | Runs OpenCode review and reacts/comments |
| Funding | `FUNDING.yml` | Sponsor metadata |

## CONVENTIONS
- Schale workflow scopes to `schale/frontend/**` on main branch pushes.
- Uses Docker metadata-action with `enable={{is_default_branch}}` templating.
- Push gated by `env.ACT != 'true'`.
- Agent workflows install OpenCode at runtime and use the gh CLI.
