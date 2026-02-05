# Task Context: Project Intelligence Wizard

Session ID: 2026-02-05-project-intelligence-wizard
Created: 2026-02-05T00:44:49Z
Status: in_progress

## Current Request
Run the 6-question Project Intelligence wizard and generate or update project-intelligence/technical-domain.md with MVI compliance, required frontmatter, codebase references, and navigation.md updates.

## Context Files (Standards to Follow)
- .opencode/context/core/standards/code-quality.md
- .opencode/context/core/context-system.md
- .opencode/context/core/context-system/standards/frontmatter.md
- .opencode/context/core/context-system/standards/structure.md
- .opencode/context/core/context-system/standards/templates.md
- .opencode/context/core/context-system/standards/codebase-references.md
- .opencode/context/core/context-system/standards/mvi.md
- .opencode/context/core/standards/project-intelligence.md
- .opencode/context/core/standards/project-intelligence-management.md
- .opencode/context/project-intelligence/navigation.md

## Reference Files (Source Material to Look At)
- .opencode/context/project-intelligence/technical-domain.md
- .opencode/context/project-intelligence/navigation.md
- .tmp/external-context.md
- .tmp/context-*.md
- .tmp/*-context.md

## External Docs Fetched
- None

## Components
- External context scan (.tmp)
- Existing project-intelligence detection
- 6-question wizard capture
- technical-domain.md generation/update
- navigation.md update and validation

## Constraints
- Must create/update project-intelligence/technical-domain.md (no project-context.md)
- Frontmatter required (HTML comment format)
- MVI compliant: <200 lines, scannable <30s, 1-3 sentence concept, 3-5 key points, 5-10 line example, reference link
- Include "📂 Codebase References" section with real code paths
- Update project-intelligence/navigation.md
- Priority must be critical for technical-domain
- Versioning: new file 1.0; updates increment minor; structure changes major

## Exit Criteria
- [ ] technical-domain.md created/updated with required sections and frontmatter
- [ ] navigation.md updated with technical-domain.md entry
- [ ] Validation: <200 lines, has frontmatter, codebase references, MVI checklist pass
