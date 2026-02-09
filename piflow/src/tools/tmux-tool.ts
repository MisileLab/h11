import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Tmux Interactive Terminal Tool
 * 
 * Provides 5 wrappers around tmux command-line interface for session management
 * and interactive terminal control. All operations shell out to tmux via pi.exec()
 * with safe parameter handling and graceful error messages when tmux is unavailable.
 */

/**
 * Register all 5 tmux tools.
 * Wraps: new_session, send_keys, capture, kill_session, list_sessions
 */
export function registerTmuxTools(pi: ExtensionAPI): void {
  // Tool 1: Create new tmux session
  pi.registerTool({
    name: "piflow_tmux_new_session",
    label: "Create Tmux Session",
    description: "Create a new tmux session with optional initial command.",
    parameters: Type.Object({
      sessionName: Type.String({
        description: "Name for the new session",
      }),
      initialCommand: Type.Optional(
        Type.String({
          description: "Optional command to run in the new session",
        }),
      ),
    }),
    execute: async ({ sessionName, initialCommand }: { sessionName: string; initialCommand?: string }) => {
      try {
        const args = ["new-session", "-d", "-s", sessionName];
        if (initialCommand) {
          args.push(initialCommand);
        }
        
        const result = await pi.exec("tmux", args);
        
        if (result.code !== 0) {
          if (result.stderr.includes("already exists")) {
            return `ERROR: Session "${sessionName}" already exists`;
          }
          return `ERROR: Failed to create session: ${result.stderr || result.stdout}`;
        }
        
        return `Session created: "${sessionName}"\n${initialCommand ? `Initial command: ${initialCommand}` : "Ready for use."}`;
      } catch (err: any) {
        if (err.message?.includes("Executable not found") || err.message?.includes("ENOENT")) {
          return `ERROR: tmux is not installed or not in PATH. Install tmux to use this tool.`;
        }
        return `ERROR: ${err.message || String(err)}`;
      }
    },
  });

  // Tool 2: Send keys to tmux session
  pi.registerTool({
    name: "piflow_tmux_send_keys",
    label: "Send Keys to Tmux Session",
    description: "Send keystrokes or commands to a running tmux session window.",
    parameters: Type.Object({
      sessionName: Type.String({
        description: "Name of the tmux session (e.g., 'my-session' or 'my-session:0')",
      }),
      keys: Type.String({
        description: "Keys/commands to send. Use Enter, C-c, C-d for special keys.",
      }),
      sendEnter: Type.Optional(
        Type.Boolean({
          description: "Send Enter key after keys (default: false)",
        }),
      ),
    }),
    execute: async ({ sessionName, keys, sendEnter }: { sessionName: string; keys: string; sendEnter?: boolean }) => {
      try {
        const args = ["send-keys", "-t", sessionName, keys];
        if (sendEnter) {
          args.push("Enter");
        }
        
        const result = await pi.exec("tmux", args);
        
        if (result.code !== 0) {
          if (result.stderr.includes("no such session")) {
            return `ERROR: Session "${sessionName}" not found`;
          }
          return `ERROR: Failed to send keys: ${result.stderr || result.stdout}`;
        }
        
        return `Keys sent to session: "${sessionName}"\nKeys: ${keys}${sendEnter ? " [+ Enter]" : ""}`;
      } catch (err: any) {
        if (err.message?.includes("Executable not found") || err.message?.includes("ENOENT")) {
          return `ERROR: tmux is not installed or not in PATH. Install tmux to use this tool.`;
        }
        return `ERROR: ${err.message || String(err)}`;
      }
    },
  });

  // Tool 3: Capture pane content from tmux session
  pi.registerTool({
    name: "piflow_tmux_capture",
    label: "Capture Tmux Pane Content",
    description: "Capture the visible text content from a tmux session pane.",
    parameters: Type.Object({
      sessionName: Type.String({
        description: "Name of the tmux session (e.g., 'my-session' or 'my-session:0')",
      }),
      startLine: Type.Optional(
        Type.Number({
          description: "Start line number for capture (default: 0, entire buffer)",
        }),
      ),
      endLine: Type.Optional(
        Type.Number({
          description: "End line number for capture (default: latest)",
        }),
      ),
    }),
    execute: async ({ sessionName, startLine, endLine }: { sessionName: string; startLine?: number; endLine?: number }) => {
      try {
        const args = ["capture-pane", "-t", sessionName, "-p"];
        if (typeof startLine === "number" && typeof endLine === "number") {
          args.push("-S", startLine.toString(), "-E", endLine.toString());
        }
        
        const result = await pi.exec("tmux", args);
        
        if (result.code !== 0) {
          if (result.stderr.includes("no such session")) {
            return `ERROR: Session "${sessionName}" not found`;
          }
          return `ERROR: Failed to capture pane: ${result.stderr || result.stdout}`;
        }
        
        return `Pane content from "${sessionName}":\n\n${result.stdout || "(empty pane)"}`;
      } catch (err: any) {
        if (err.message?.includes("Executable not found") || err.message?.includes("ENOENT")) {
          return `ERROR: tmux is not installed or not in PATH. Install tmux to use this tool.`;
        }
        return `ERROR: ${err.message || String(err)}`;
      }
    },
  });

  // Tool 4: Kill tmux session
  pi.registerTool({
    name: "piflow_tmux_kill_session",
    label: "Kill Tmux Session",
    description: "Terminate a tmux session and all its windows.",
    parameters: Type.Object({
      sessionName: Type.String({
        description: "Name of the tmux session to kill",
      }),
    }),
    execute: async ({ sessionName }: { sessionName: string }) => {
      try {
        const args = ["kill-session", "-t", sessionName];
        
        const result = await pi.exec("tmux", args);
        
        if (result.code !== 0) {
          if (result.stderr.includes("no such session")) {
            return `ERROR: Session "${sessionName}" not found`;
          }
          return `ERROR: Failed to kill session: ${result.stderr || result.stdout}`;
        }
        
        return `Session killed: "${sessionName}"`;
      } catch (err: any) {
        if (err.message?.includes("Executable not found") || err.message?.includes("ENOENT")) {
          return `ERROR: tmux is not installed or not in PATH. Install tmux to use this tool.`;
        }
        return `ERROR: ${err.message || String(err)}`;
      }
    },
  });

  // Tool 5: List all tmux sessions
  pi.registerTool({
    name: "piflow_tmux_list_sessions",
    label: "List Tmux Sessions",
    description: "List all active tmux sessions with their status and window count.",
    parameters: Type.Object({}),
    execute: async () => {
      try {
        // Use list-sessions format for clean output
        const result = await pi.exec("tmux", ["list-sessions", "-F", "#{session_name}: #{session_windows} windows"]);
        
        if (result.code !== 0) {
          // No sessions running is not an error, just empty list
          if (result.stderr.includes("no sessions") || result.stdout === "") {
            return "No tmux sessions are currently running.";
          }
          return `ERROR: Failed to list sessions: ${result.stderr || result.stdout}`;
        }
        
        const sessions = result.stdout.trim().split("\n").filter((line) => line.length > 0);
        
        if (sessions.length === 0) {
          return "No tmux sessions are currently running.";
        }
        
        return `Active tmux sessions:\n${sessions.map((s) => `  • ${s}`).join("\n")}`;
      } catch (err: any) {
        if (err.message?.includes("Executable not found") || err.message?.includes("ENOENT")) {
          return `ERROR: tmux is not installed or not in PATH. Install tmux to use this tool.`;
        }
        return `ERROR: ${err.message || String(err)}`;
      }
    },
  });
}
