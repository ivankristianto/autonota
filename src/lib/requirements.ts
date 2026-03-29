import { execFileSync } from "node:child_process";

import {
  getSummaryCliInstallHint,
  isCliSummaryProvider,
  type SummaryProvider,
} from "./summary-providers.js";

export function assertOpenAiConfigured(env: NodeJS.ProcessEnv): string {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  return apiKey;
}

export function assertBinaryExists(name: string): void {
  try {
    execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" });
  } catch {
    const hint = name === "yt-dlp" ? "brew install yt-dlp" : "brew install ffmpeg";
    throw new Error(`${name} not found in PATH. Install it via: ${hint}`);
  }
}

export function checkTranscribeRequirements(env: NodeJS.ProcessEnv): void {
  assertOpenAiConfigured(env);
  const missing: string[] = [];

  for (const name of ["yt-dlp", "ffmpeg", "ffprobe"]) {
    try {
      assertBinaryExists(name);
    } catch (error) {
      missing.push((error as Error).message);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing requirements:\n${missing.map((message) => `  ✗ ${message}`).join("\n")}`,
    );
  }
}

export function checkCliRequirement(name: string): void {
  try {
    execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" });
  } catch {
    const hint = isCliSummaryProvider(name) ? getSummaryCliInstallHint(name) : `Install ${name}.`;
    throw new Error(`${name} not found in PATH. ${hint}`);
  }
}

export function checkSummarizeRequirements(
  env: NodeJS.ProcessEnv,
  provider: SummaryProvider = "openai",
): void {
  if (provider === "openai") {
    assertOpenAiConfigured(env);
  } else {
    checkCliRequirement(provider);
  }
}
