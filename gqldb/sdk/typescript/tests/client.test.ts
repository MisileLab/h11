import { spawn } from "node:child_process";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GQLDBClient } from "../src/client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("health endpoint", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const cargo = process.env.CARGO_BIN ?? "/opt/homebrew/bin/cargo";
  const server = spawn(cargo, ["run", "-p", "gqldb-server"], {
    cwd: repoRoot,
    stdio: "ignore",
  });

  try {
    await wait(2000);
    const client = new GQLDBClient("http://127.0.0.1:8080/graphql");
    const ok = await client.health();
    assert.equal(ok, true);
  } finally {
    server.kill();
  }
});
