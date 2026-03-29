import { spawn } from "node:child_process";

import type { TranscriptDocument } from "../types.js";
import {
  buildSummaryCliArgs,
  getSummaryCliInstallHint,
  type CliSummaryProvider,
} from "./summary-providers.js";
import { buildSummaryPrompt, formatSummaryMarkdown } from "./summary.js";

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

interface SummaryTimelineSection {
  heading: string;
  bullets: string[];
}

interface SummaryResponseShape {
  title: string;
  overview: string;
  keyPoints: string[];
  timeline: SummaryTimelineSection[];
  notableQuotes: string[];
  actionItems: string[];
}

function getRequiredField(parsed: Record<string, unknown>, field: string, stdout: string): unknown {
  if (!(field in parsed)) {
    throw new Error(
      `CLI response JSON is missing required field "${field}". Raw output:\n${stdout}`,
    );
  }

  return parsed[field];
}

function expectString(value: unknown, fieldPath: string, stdout: string): string {
  if (typeof value !== "string") {
    throw new Error(`CLI response field "${fieldPath}" must be a string. Raw output:\n${stdout}`);
  }

  return value.trim();
}

function expectStringArray(value: unknown, fieldPath: string, stdout: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`CLI response field "${fieldPath}" must be an array. Raw output:\n${stdout}`);
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  if (strings.length !== value.length) {
    throw new Error(
      `CLI response field "${fieldPath}" must contain only strings. Raw output:\n${stdout}`,
    );
  }

  return strings.map((item) => item.trim()).filter(Boolean);
}

function expectTimeline(value: unknown, stdout: string): SummaryTimelineSection[] {
  if (!Array.isArray(value)) {
    throw new Error(`CLI response field "timeline" must be an array. Raw output:\n${stdout}`);
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(
        `CLI response field "timeline[${index}]" must be an object. Raw output:\n${stdout}`,
      );
    }

    const section = item as Record<string, unknown>;
    const heading = expectString(
      getRequiredField(section, "heading", stdout),
      `timeline[${index}].heading`,
      stdout,
    );
    const bullets = expectStringArray(
      getRequiredField(section, "bullets", stdout),
      `timeline[${index}].bullets`,
      stdout,
    );

    return {
      heading,
      bullets,
    };
  });
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

  const content = parsed as Record<string, unknown>;

  return {
    title: expectString(getRequiredField(content, "title", stdout), "title", stdout),
    overview: expectString(getRequiredField(content, "overview", stdout), "overview", stdout),
    keyPoints: expectStringArray(
      getRequiredField(content, "keyPoints", stdout),
      "keyPoints",
      stdout,
    ),
    timeline: expectTimeline(getRequiredField(content, "timeline", stdout), stdout),
    notableQuotes: expectStringArray(
      getRequiredField(content, "notableQuotes", stdout),
      "notableQuotes",
      stdout,
    ),
    actionItems: expectStringArray(
      getRequiredField(content, "actionItems", stdout),
      "actionItems",
      stdout,
    ),
  };
}

// ---------------------------------------------------------------------------
// spawnCli
// ---------------------------------------------------------------------------

export async function spawnCli(
  provider: CliSummaryProvider,
  prompt: string,
  model: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const args = buildSummaryCliArgs(provider, model);
    const child = spawn(provider, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err: Error & { code?: string }) => {
      if (err.code === "ENOENT") {
        reject(new Error(`${provider} not found in PATH. ${getSummaryCliInstallHint(provider)}`));
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

    child.stdin.on("error", (err: Error & { code?: string }) => {
      if (err.code !== "EPIPE") {
        reject(err);
      }
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
  provider: CliSummaryProvider,
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
    overview: content.overview,
    keyPoints: content.keyPoints,
    timeline: content.timeline,
    notableQuotes: content.notableQuotes,
    actionItems: content.actionItems,
  });
}
