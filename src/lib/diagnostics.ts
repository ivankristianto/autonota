import { execFileSync } from "node:child_process";

export interface BinaryCheckResult {
  name: string;
  found: true;
  path: string;
}

export interface BinaryCheckFailResult {
  name: string;
  found: false;
  path: undefined;
  hint: string;
}

export interface EnvCheckResult {
  name: string;
  found: true;
}

export interface EnvCheckFailResult {
  name: string;
  found: false;
  hint: string;
}

export type CheckResult =
  | BinaryCheckResult
  | BinaryCheckFailResult
  | EnvCheckResult
  | EnvCheckFailResult;

const INSTALL_HINTS: Record<string, string> = {
  "yt-dlp": "brew install yt-dlp",
  ffmpeg: "brew install ffmpeg",
  ffprobe: "brew install ffmpeg",
};

export function checkBinary(name: string): BinaryCheckResult | BinaryCheckFailResult {
  try {
    const binPath = execFileSync("which", [name], { encoding: "utf8", stdio: "pipe" }).trim();
    return { name, found: true, path: binPath };
  } catch {
    return { name, found: false, path: undefined, hint: INSTALL_HINTS[name] ?? `Install ${name}` };
  }
}

export function checkEnvVar(
  name: string,
  env: NodeJS.ProcessEnv,
): EnvCheckResult | EnvCheckFailResult {
  if (env[name]?.trim()) {
    return { name, found: true };
  }
  return { name, found: false, hint: `Set ${name} in your shell profile or .env file` };
}

export function runAllChecks(env: NodeJS.ProcessEnv): CheckResult[] {
  return [
    checkBinary("yt-dlp"),
    checkBinary("ffmpeg"),
    checkBinary("ffprobe"),
    checkEnvVar("OPENAI_API_KEY", env),
  ];
}
