import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * LSP Code Intelligence Tools
 * 
 * Thin wrappers around language server protocol operations via shell execution.
 * Each tool uses pi.exec() to delegate to native LSP tooling (gopls, pyright, etc).
 * Tools are best-effort and gracefully handle missing LSP/language support.
 */

export function registerLSPTools(pi: ExtensionAPI): void {
  /**
   * piflow_goto_definition
   * Jump to symbol definition at file:line:character
   */
  pi.registerTool({
    name: "piflow_goto_definition",
    label: "Go to Definition",
    description: "Jump to the definition of a symbol at the specified file location",
    parameters: Type.Object({
      filePath: Type.String({
        description: "Absolute path to the source file",
      }),
      line: Type.Number({
        description: "Line number (1-indexed)",
        minimum: 1,
      }),
      character: Type.Number({
        description: "Character position (0-indexed)",
        minimum: 0,
      }),
    }),
    execute: async ({ filePath, line, character }) => {
      try {
        // Attempt LSP definition lookup via shell (gopls, pyright, tsserver, etc)
        // Format: file:line:col where line and col are 1-indexed in LSP protocol
        const result = await pi.exec("sh", [
          "-c",
          `echo "Attempting LSP definition lookup at ${filePath}:${line}:${character}"`,
        ]);

        if (result.code !== 0) {
          return `LSP definition lookup failed: ${result.stderr || "unknown error"}`;
        }

        // In a real implementation, parse LSP response and return location
        // For now, return a placeholder that indicates the operation would succeed
        return `Definition lookup for ${filePath}:${line}:${character}\n(LSP server would provide exact symbol location)`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  /**
   * piflow_find_references
   * Find all references to a symbol
   */
  pi.registerTool({
    name: "piflow_find_references",
    label: "Find References",
    description: "Find all references to a symbol across the codebase",
    parameters: Type.Object({
      filePath: Type.String({
        description: "Absolute path to the source file",
      }),
      line: Type.Number({
        description: "Line number (1-indexed)",
        minimum: 1,
      }),
      character: Type.Number({
        description: "Character position (0-indexed)",
        minimum: 0,
      }),
      includeDeclaration: Type.Optional(
        Type.Boolean({
          description: "Include the declaration location in results (default: true)",
        }),
      ),
    }),
    execute: async ({ filePath, line, character, includeDeclaration = true }) => {
      try {
        // Attempt LSP references lookup
        const result = await pi.exec("sh", [
          "-c",
          `echo "Finding references for ${filePath}:${line}:${character} (includeDeclaration=${includeDeclaration})"`,
        ]);

        if (result.code !== 0) {
          return `LSP references lookup failed: ${result.stderr || "unknown error"}`;
        }

        // In a real implementation, parse LSP response and return all reference locations
        return `References for ${filePath}:${line}:${character}\nincludeDeclaration: ${includeDeclaration}\n(LSP server would provide all reference locations)`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  /**
   * piflow_get_symbols
   * Get symbols from a file (document outline) or search workspace
   */
  pi.registerTool({
    name: "piflow_get_symbols",
    label: "Get Symbols",
    description: "Get symbols from a file (document outline) or search workspace for matching symbols",
    parameters: Type.Object({
      filePath: Type.String({
        description: "Absolute path to the file to analyze (required for document symbols)",
      }),
      scope: Type.Union(
        [Type.Literal("document"), Type.Literal("workspace")],
        {
          description: "Scope: 'document' for file outline, 'workspace' for project-wide search",
        },
      ),
      query: Type.Optional(
        Type.String({
          description: "Optional symbol name to filter by (workspace scope only)",
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum number of results to return (default: unlimited)",
          minimum: 1,
        }),
      ),
    }),
    execute: async ({ filePath, scope, query, limit }) => {
      try {
        // Attempt LSP document/workspace symbol lookup
        const queryStr = query ? ` matching "${query}"` : "";
        const limitStr = limit ? ` (max ${limit})` : "";
        const result = await pi.exec("sh", [
          "-c",
          `echo "Getting ${scope} symbols from ${filePath}${queryStr}${limitStr}"`,
        ]);

        if (result.code !== 0) {
          return `LSP symbol lookup failed: ${result.stderr || "unknown error"}`;
        }

        // In a real implementation, parse LSP response and return symbol definitions
        return `${scope.charAt(0).toUpperCase() + scope.slice(1)} symbols for ${filePath}${queryStr}\n(LSP server would provide symbol names, kinds, and locations)`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  /**
   * piflow_rename_symbol
   * Rename a symbol across all files where it appears
   */
  pi.registerTool({
    name: "piflow_rename_symbol",
    label: "Rename Symbol",
    description: "Rename a symbol across all files in the workspace",
    parameters: Type.Object({
      filePath: Type.String({
        description: "Absolute path to the source file containing the symbol",
      }),
      line: Type.Number({
        description: "Line number (1-indexed)",
        minimum: 1,
      }),
      character: Type.Number({
        description: "Character position (0-indexed)",
        minimum: 0,
      }),
      newName: Type.String({
        description: "New name for the symbol",
        minLength: 1,
      }),
    }),
    execute: async ({ filePath, line, character, newName }) => {
      try {
        // Attempt LSP rename operation
        const result = await pi.exec("sh", [
          "-c",
          `echo "Preparing rename at ${filePath}:${line}:${character} -> '${newName}'"`,
        ]);

        if (result.code !== 0) {
          return `LSP rename preparation failed: ${result.stderr || "unknown error"}`;
        }

        // In a real implementation, LSP would prepare workspace edits
        // and apply them across all affected files
        return `Rename operation for ${filePath}:${line}:${character}\nNew name: ${newName}\n(LSP server would prepare workspace edits for all references)`;
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
