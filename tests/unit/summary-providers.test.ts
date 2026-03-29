import { describe, expect, it } from "vitest";

import {
  buildSummaryCliArgs,
  getDefaultSummaryModel,
  getSummaryCliInstallHint,
  isCliSummaryProvider,
  resolveSummaryProvider,
} from "../../src/lib/summary-providers.js";

describe("summary provider metadata", () => {
  it("resolves provider from flags", () => {
    expect(resolveSummaryProvider({})).toBe("openai");
    expect(resolveSummaryProvider({ claude: true })).toBe("claude");
    expect(resolveSummaryProvider({ codex: true })).toBe("codex");
  });

  it("rejects conflicting provider flags", () => {
    expect(() => resolveSummaryProvider({ claude: true, codex: true })).toThrow(
      /--claude.*--codex/,
    );
  });

  it("returns default models for each provider", () => {
    expect(getDefaultSummaryModel("openai")).toBe("gpt-5-mini");
    expect(getDefaultSummaryModel("claude")).toBe("claude-sonnet-4-6");
    expect(getDefaultSummaryModel("codex")).toBe("gpt-5.4-mini");
  });

  it("returns provider-specific CLI args", () => {
    expect(buildSummaryCliArgs("claude", "claude-sonnet-4-6")).toEqual([
      "-p",
      "-",
      "--model",
      "claude-sonnet-4-6",
      "--output-format",
      "json",
    ]);
    expect(buildSummaryCliArgs("codex", "gpt-5.4-mini")).toEqual([
      "exec",
      "-",
      "--model",
      "gpt-5.4-mini",
      "--skip-git-repo-check",
    ]);
  });

  it("returns provider-specific install hints", () => {
    expect(getSummaryCliInstallHint("claude")).toContain("Install Claude Code");
    expect(getSummaryCliInstallHint("codex")).toContain("Install Codex CLI");
  });

  it("identifies cli providers", () => {
    expect(isCliSummaryProvider("openai")).toBe(false);
    expect(isCliSummaryProvider("claude")).toBe(true);
    expect(isCliSummaryProvider("codex")).toBe(true);
    expect(isCliSummaryProvider("other")).toBe(false);
  });
});
