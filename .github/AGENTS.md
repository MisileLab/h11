<!-- Parent: ../AGENTS.md -->
# GITHUB

## OVERVIEW
CI/CD workflows and funding configuration.

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| Schale Docker | `workflows/schale-docker-publish.yml` | Builds/pushes Schale image |
| Corin Docker | `workflows/corin-docker-publish.yml` | Legacy (Corin removed) |
| Funding | `FUNDING.yml` | Sponsor metadata |

## CONVENTIONS
- Schale workflow scopes to `schale/frontend/**` on main branch pushes.
- Uses Docker metadata-action with `enable={{is_default_branch}}` templating.
- Push gated by `env.ACT != 'true'`.
