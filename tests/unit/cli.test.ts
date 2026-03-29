import { mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("CLI entrypoint", () => {
  it("prints help when invoked through a symlinked bin path", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "autonota-cli-"));
    const linkPath = path.join(tempDir, "autonota");
    const cliPath = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));

    await symlink(cliPath, linkPath);

    try {
      const result = spawnSync("node", [linkPath, "--help"], {
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("transcribe");
      expect(result.stdout).toContain("summarize");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
