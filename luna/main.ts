import type { Probot } from "probot";
import { registerPRHandler } from "./src/handlers/pr.js";
import { registerMentionHandler } from "./src/handlers/mention.js";

/**
 * Luna PR Review Bot - Main entry point
 * Registers all event handlers and manages lifecycle
 */
export default (app: Probot) => {
  // Register event handlers
  registerPRHandler(app);
  registerMentionHandler(app);

  // Graceful shutdown handlers
  const cleanup = async () => {
    app.log.info("Luna shutting down gracefully...");
    // TODO: Cleanup active OpenCode sessions if tracking implemented
    // TODO: Cleanup temp directories if tracking implemented
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  app.log.info("Luna PR Review Bot loaded successfully");
};
