import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * AST-Grep Tools — Pattern-based Code Search and Replace
 *
 * Thin wrappers around the `sg` CLI (ast-grep) for structural code search and replace.
 * Uses JSON output when available for structured parsing.
 * Replace defaults to dry-run (dryRun: true) for safety.
 */

/**
 * Register AST-grep search and replace tools with the extension API.
 * Tools use `pi.exec("sg", ...)` to shell out to the ast-grep CLI.
 */
export function registerAstGrepTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "piflow_ast_search",
    label: "AST Search",
    description: "Search code using AST-grep pattern matching. Returns matches with file paths and line numbers.",
    parameters: Type.Object({
      pattern: Type.String({
        description:
          "Search pattern using ast-grep syntax (e.g., 'useState($STATE)', 'def $FUNC($$$):', 'console.log($MSG)')",
      }),
      lang: Type.String({
        description:
          "Programming language: bash, c, cpp, csharp, css, elixir, go, haskell, html, java, javascript, json, kotlin, lua, nix, php, python, ruby, rust, scala, solidity, swift, typescript, tsx, yaml",
      }),
      paths: Type.Optional(
        Type.Array(Type.String(), {
          description: "File paths or glob patterns to search (e.g., ['src/**/*.ts', 'tests/*.py'])",
        }),
      ),
      globs: Type.Optional(
        Type.Array(Type.String(), {
          description: "Alternative to paths: glob patterns to match files",
        }),
      ),
      context: Type.Optional(
        Type.Number({
          description: "Number of lines of context around matches (default: 2)",
        }),
      ),
    }),
    execute: async ({ pattern, lang, paths, globs, context }) => {
      try {
        // Validate sg CLI is available
        const versionCheck = await pi.exec("sg", ["--version"]);
        if (versionCheck.code !== 0) {
          return `Error: ast-grep (sg) CLI not found or not working. Install via: npm install -g ast-grep`;
        }

        const args: string[] = ["scan", "--pattern", pattern, "--lang", lang];

        // Add optional context
        if (context !== undefined && context > 0) {
          args.push("--context", context.toString());
        }

        // Add paths or globs
        if (paths && paths.length > 0) {
          args.push("--paths", paths.join(","));
        } else if (globs && globs.length > 0) {
          args.push("--globs", globs.join(","));
        }

        // Try JSON output first
        const jsonArgs = [...args, "--json"];
        const jsonResult = await pi.exec("sg", jsonArgs);

        if (jsonResult.code === 0 && jsonResult.stdout) {
          try {
            const parsed = JSON.parse(jsonResult.stdout);
            const matchCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
            return `Found ${matchCount} matches.\n\nStructured results:\n${JSON.stringify(parsed, null, 2)}`;
          } catch {
            // Fallback to text output if JSON parsing fails
            return formatSearchResults(jsonResult.stdout, pattern);
          }
        }

        // Fallback to text output
        const textResult = await pi.exec("sg", args);
        if (textResult.code === 0) {
          return formatSearchResults(textResult.stdout, pattern);
        }

        return `No matches found for pattern: ${pattern}`;
      } catch (err) {
        return `Error executing ast-grep search: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  pi.registerTool({
    name: "piflow_ast_replace",
    label: "AST Replace",
    description:
      "Replace code using AST-grep patterns. Defaults to dry-run (dryRun: true) for safety. Set dryRun: false to apply changes.",
    parameters: Type.Object({
      pattern: Type.String({
        description: "Search pattern using ast-grep syntax with meta-variables (e.g., '$VAR', '$$')",
      }),
      rewrite: Type.String({
        description: "Replacement template using captured groups (e.g., '$VAR + 1', 'logger.info($MSG)')",
      }),
      lang: Type.String({
        description:
          "Programming language: bash, c, cpp, csharp, css, elixir, go, haskell, html, java, javascript, json, kotlin, lua, nix, php, python, ruby, rust, scala, solidity, swift, typescript, tsx, yaml",
      }),
      paths: Type.Optional(
        Type.Array(Type.String(), {
          description: "File paths or glob patterns to match (e.g., ['src/**/*.ts'])",
        }),
      ),
      globs: Type.Optional(
        Type.Array(Type.String(), {
          description: "Alternative to paths: glob patterns to match files",
        }),
      ),
      dryRun: Type.Optional(
        Type.Boolean({
          description: "Preview changes without writing (default: true for safety)",
        }),
      ),
    }),
    execute: async ({ pattern, rewrite, lang, paths, globs, dryRun = true }) => {
      try {
        // Validate sg CLI is available
        const versionCheck = await pi.exec("sg", ["--version"]);
        if (versionCheck.code !== 0) {
          return `Error: ast-grep (sg) CLI not found or not working. Install via: npm install -g ast-grep`;
        }

        const args: string[] = ["fix", "--pattern", pattern, "--rewrite", rewrite, "--lang", lang];

        // Add dry-run by default for safety
        if (dryRun !== false) {
          args.push("--dry-run");
        }

        // Add paths or globs
        if (paths && paths.length > 0) {
          args.push("--paths", paths.join(","));
        } else if (globs && globs.length > 0) {
          args.push("--globs", globs.join(","));
        }

        const result = await pi.exec("sg", args);

        if (result.code === 0) {
          const status = dryRun ? "(dry-run preview)" : "(applied)";
          return `Replace operation completed ${status}:\n${result.stdout}`;
        }

        // Check for common error patterns
        if (result.stderr && result.stderr.includes("No matches")) {
          return `No matches found for pattern in the specified files.`;
        }

        return `Replace operation failed with code ${result.code}:\n${result.stderr || result.stdout}`;
      } catch (err) {
        return `Error executing ast-grep replace: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

/**
 * Format text-based search results for readability.
 * Extracts file:line:col patterns and groups by file.
 */
function formatSearchResults(stdout: string, pattern: string): string {
  const lines = stdout.split("\n").filter((l) => l.trim());

  if (lines.length === 0) {
    return `No matches found for pattern: ${pattern}`;
  }

  const fileGroups = new Map<string, string[]>();

  for (const line of lines) {
    // Try to extract file path (format: file:line:col)
    const match = line.match(/^([^:\s]+):(\d+)/);
    if (match) {
      const file = match[1];
      if (!fileGroups.has(file)) {
        fileGroups.set(file, []);
      }
      fileGroups.get(file)!.push(line);
    } else {
      // Keep lines without file prefix
      if (!fileGroups.has("__no_file__")) {
        fileGroups.set("__no_file__", []);
      }
      fileGroups.get("__no_file__")!.push(line);
    }
  }

  let output = `Found ${lines.length} matches for pattern: ${pattern}\n\n`;

  for (const [file, matchLines] of fileGroups) {
    if (file !== "__no_file__") {
      output += `📄 ${file}\n`;
      for (const line of matchLines) {
        output += `  ${line}\n`;
      }
      output += "\n";
    } else {
      for (const line of matchLines) {
        output += `${line}\n`;
      }
    }
  }

  return output;
}
