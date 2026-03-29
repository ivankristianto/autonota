import { runAllChecks, type CheckResult } from "../lib/diagnostics.js";

export function formatDiagnosticsOutput(results: CheckResult[]): string {
  const lines: string[] = ["autonota diagnostics", ""];

  for (const result of results) {
    if (result.found) {
      const detail = "path" in result ? result.path : "set";
      lines.push(`  \u2713 ${result.name.padEnd(14)} ${detail}`);
    } else {
      const hint = "hint" in result ? result.hint : "";
      lines.push(`  \u2717 ${result.name.padEnd(14)} not found - ${hint}`);
    }
  }

  const failCount = results.filter((result) => !result.found).length;
  lines.push("");

  if (failCount > 0) {
    const issue = failCount === 1 ? "issue" : "issues";
    lines.push(`${failCount} ${issue} found. Fix the above before running autonota.`);
  } else {
    lines.push("All checks passed.");
  }

  return lines.join("\n");
}

export async function runDiagnosticsCommand(): Promise<void> {
  const results = runAllChecks(process.env);
  process.stdout.write(`${formatDiagnosticsOutput(results)}\n`);

  process.exitCode = results.some((result) => !result.found) ? 1 : 0;
}
