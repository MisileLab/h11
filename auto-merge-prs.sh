#!/bin/bash
# Auto-detect GitHub PRs and merge all except conflicting ones
# Usage: ./scripts/auto-merge-prs.sh [--dry-run] [--squash|--rebase|--merge]

set -euo pipefail

# Configuration
MERGE_STRATEGY="${MERGE_STRATEGY:-squash}"
DELETE_BRANCH="${DELETE_BRANCH:-true}"
DRY_RUN="${DRY_RUN:-false}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --squash)
      MERGE_STRATEGY=squash
      shift
      ;;
    --rebase)
      MERGE_STRATEGY=rebase
      shift
      ;;
    --merge)
      MERGE_STRATEGY=merge
      shift
      ;;
    --no-delete)
      DELETE_BRANCH=false
      shift
      ;;
    -h|--help)
      cat <<EOF
Auto-merge GitHub PRs (skip conflicting ones)

Usage: $0 [OPTIONS]

Options:
  --dry-run      Show what would be merged without actually merging
  --squash       Squash merge (default)
  --rebase       Rebase and merge
  --merge        Create merge commit
  --no-delete    Don't delete branch after merge
  -h, --help     Show this help

Environment:
  MERGE_STRATEGY   Default merge strategy (default: squash)
  DELETE_BRANCH    Delete branches after merge (default: true)
  DRY_RUN          Preview mode (default: false)

EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
MERGED=0
SKIPPED=0
FAILED=0

echo -e "${BLUE}=== GitHub PR Auto-Merge ===${NC}"
echo "Merge strategy: $MERGE_STRATEGY"
echo "Delete branches: $DELETE_BRANCH"
echo "Dry run: $DRY_RUN"
echo ""

# Get all open PRs with merge status
echo -e "${BLUE}Fetching open PRs...${NC}"
prs_json=$(gh pr list --state open --json number,title,mergeable,mergeStateStatus,author,headRefName)

if [[ -z "$prs_json" || "$prs_json" == "[]" ]]; then
  echo -e "${YELLOW}No open PRs found${NC}"
  exit 0
fi

# Count total PRs
total_prs=$(echo "$prs_json" | jq 'length')
echo -e "${BLUE}Found $total_prs open PR(s)${NC}"
echo ""

# Process each PR
echo "$prs_json" | jq -c '.[]' | while read -r pr; do
  pr_num=$(echo "$pr" | jq -r '.number')
  pr_title=$(echo "$pr" | jq -r '.title')
  pr_author=$(echo "$pr" | jq -r '.author.login // "unknown"')
  pr_mergeable=$(echo "$pr" | jq -r '.mergeable')
  pr_merge_state=$(echo "$pr" | jq -r '.mergeStateStatus')
  pr_branch=$(echo "$pr" | jq -r '.headRefName')

  echo -e "${BLUE}PR #$pr_num${NC}: $pr_title"
  echo "  Author: @$pr_author"
  echo "  Branch: $pr_branch"
  echo "  Mergeable: $pr_mergeable"
  echo "  State: $pr_merge_state"

  case "$pr_merge_state" in
    CLEAN|MERGEABLE|UNSTABLE|UNKNOWN)
      if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${GREEN}[DRY RUN] Would merge${NC}"
        continue
      fi

      echo -e "  ${GREEN}Merging...${NC}"
      
      # Build merge command
      merge_args=("--$MERGE_STRATEGY")
      if [[ "$DELETE_BRANCH" == "true" ]]; then
        merge_args+=("--delete-branch")
      fi

      # Attempt merge
      if gh pr merge "$pr_num" "${merge_args[@]}" 2>&1; then
        echo -e "  ${GREEN}✓ Merged successfully${NC}"
        ((MERGED++)) || true
      else
        echo -e "  ${RED}✗ Failed to merge${NC}"
        ((FAILED++)) || true
      fi
      ;;

    CONFLICTING)
      echo -e "  ${YELLOW}⚠ Has conflicts - skipping${NC}"
      ((SKIPPED++)) || true
      ;;

    DIRTY)
      echo -e "  ${YELLOW}⚠ Branch is dirty (base/head moved) - skipping${NC}"
      ((SKIPPED++)) || true
      ;;

    BLOCKED|BEHIND)
      echo -e "  ${YELLOW}⚠ Status: $pr_merge_state - skipping${NC}"
      ((SKIPPED++)) || true
      ;;

    *)
      echo -e "  ${YELLOW}⚠ Unknown status: $pr_merge_state - skipping${NC}"
      ((SKIPPED++)) || true
      ;;
  esac

  echo ""
done

echo -e "${BLUE}=== Summary ===${NC}"
echo "Merged: $MERGED"
echo "Skipped: $SKIPPED"
echo "Failed: $FAILED"

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}(Dry run - no changes made)${NC}"
fi
