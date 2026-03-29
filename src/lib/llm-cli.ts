import { spawn } from "node:child_process";

import type { TranscriptDocument } from "../types.js";
import {
  buildSummaryPrompt,
  formatSummaryMarkdown,
  pickSections,
  pickString,
  pickStringArray,
} from "./summary.js";

// ---------------------------------------------------------------------------
// stripJsonFence
// ---------------------------------------------------------------------------

export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```$/);
  return match ? match[1].trim() : trimmed;
}

// ---------------------------------------------------------------------------
// parseCliResponse
// ---------------------------------------------------------------------------

const REQUIRED_SUMMARY_FIELDS = [
  "title",
  "overview",
  "keyPoints",
  "timeline",
  "notableQuotes",
  "actionItems",
] as const;

interface SummaryResponseShape {
  title?: unknown;
  overview?: unknown;
  keyPoints?: unknown;
  timeline?: unknown;
  notableQuotes?: unknown;
  actionItems?: unknown;
}

export function parseCliResponse(stdout: string): SummaryResponseShape {
  const cleaned = stripJsonFence(stdout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`CLI response is not valid JSON. Raw output:\n${stdout}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`CLI response did not produce a JSON object. Raw output:\n${stdout}`);
  }

  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!(field in (parsed as Record<string, unknown>))) {
      throw new Error(
        `CLI response JSON is missing required field "${field}". Raw output:\n${stdout}`,
      );
    }
  }

  return parsed as SummaryResponseShape;
}

// ---------------------------------------------------------------------------
// spawnCli
// ---------------------------------------------------------------------------

const INSTALL_HINTS: Record<string, string> = {
  claude: "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code",
  codex: "Install Codex CLI: https://github.com/openai/codex",
};

const CLI_ARGS: Record<string, (model: string) => string[]> = {
  claude: (model) => ["-p", "-", "--model", model, "--output-format", "json"],
  codex: (model) => ["exec", "-", "--model", model],
};

export async function spawnCli(
  provider: "claude" | "codex",
  prompt: string,
  model: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const args = CLI_ARGS[provider](model);
    const child = spawn(provider, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err: Error & { code?: string }) => {
      if (err.code === "ENOENT") {
        reject(new Error(`${provider} not found in PATH. ${INSTALL_HINTS[provider]}`));
      } else {
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(new Error(`${provider} exited with code ${code}: ${stderr}`));
        return;
      }

      resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    child.stdin.on("error", () => {
      // Suppress EPIPE if the child exits before reading stdin.
    });
    child.stdin.end(prompt);
  });
}

// ---------------------------------------------------------------------------
// generateSummaryFromCli
// ---------------------------------------------------------------------------

export interface CliSummaryOptions {
  model: string;
  summaryLanguage: string;
}

export async function generateSummaryFromCli(
  provider: "claude" | "codex",
  transcript: TranscriptDocument,
  options: CliSummaryOptions,
): Promise<string> {
  const prompt = buildSummaryPrompt(transcript, options);
  const stdout = await spawnCli(provider, prompt, options.model);
  const content = parseCliResponse(stdout);

  return formatSummaryMarkdown({
    title: transcript.source.title,
    source: {
      url: transcript.source.url,
      videoId: transcript.source.videoId,
      durationSeconds: transcript.audio.durationSeconds,
      generatedAt: transcript.transcription.generatedAt,
      language: transcript.transcription.language,
    },
    overview: pickString(content.overview) ?? undefined,
    keyPoints: pickStringArray(content.keyPoints),
    timeline: pickSections(content.timeline),
    notableQuotes: pickStringArray(content.notableQuotes),
    actionItems: pickStringArray(content.actionItems),
  });
}
