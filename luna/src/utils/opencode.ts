import { createOpencode, type Part } from "@opencode-ai/sdk";
import type { AgentType } from "../types/index.ts";

// Global client instance - initialized from main.ts
const { client } = await createOpencode();

export async function createSession(agent?: AgentType): Promise<string> {
  return retryWithBackoff(async () => {
    const response = await client.session.create({
      body: agent ? { agent } : undefined,
    });
    const sessionId = response.data?.id;
    
    if (!sessionId) {
      throw new Error("Failed to create session: no session ID returned");
    }
    
    return sessionId;
  });
}

/**
 * Sends a prompt to a session and returns the text response
 * @param sessionId - The session ID
 * @param prompt - The prompt text to send
 * @returns Extracted text response from the session
 * @throws Error after 3 retry attempts
 */
export async function sendPrompt(sessionId: string, prompt: string): Promise<string> {
  return retryWithBackoff(async () => {
    const response = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    });

    // Extract text from response parts
    const parts = response.data?.parts || [];
    const textParts = parts
      .filter((part): part is Part & { type: "text" } => part.type === "text")
      .map((part) => part.text)
      .join("");

    if (!textParts) {
      throw new Error("No text response received from session");
    }

    return textParts;
  });
}

/**
 * Closes a session (best-effort cleanup)
 * @param sessionId - The session ID to close
 * @returns Promise that resolves when session is aborted (or silently fails)
 */
export async function closeSession(sessionId: string): Promise<void> {
  try {
    await client.session.abort({ path: { id: sessionId } });
  } catch (error) {
    // Best-effort cleanup - don't throw on errors
    console.debug(`Failed to close session ${sessionId}:`, error);
  }
}

/**
 * Retries an async operation with exponential backoff
 * @param operation - The async operation to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Result of the operation
 * @throws Last error after all retries exhausted
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't wait after the last attempt
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("Operation failed after retries");
}
