import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function resolveInstalledPackageRoots(cwd: string): string[] {
  const settingsPath = path.join(cwd, ".pi", "settings.json");
  if (!existsSync(settingsPath)) {
    return [];
  }

  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as { packages?: unknown };
    if (!Array.isArray(parsed.packages)) {
      return [];
    }

    const roots = new Set<string>();

    for (const entry of parsed.packages) {
      if (typeof entry !== "string" || entry.trim() === "") {
        continue;
      }

      const packageRef = entry.trim();
      if (packageRef.startsWith(".") || path.isAbsolute(packageRef)) {
        roots.add(path.resolve(cwd, packageRef));
        continue;
      }

      const packageRoot = path.join(cwd, "node_modules", packageRef);
      const packageJsonPath = path.join(packageRoot, "package.json");
      if (existsSync(packageJsonPath)) {
        roots.add(packageRoot);
      }
    }

    return [...roots];
  } catch {
    return [];
  }
}
