import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import type { TranscriptDocument } from "../types.js";

const TRANSCRIPT_SUFFIX = ".transcript.json";
const SUMMARY_SUFFIX = ".summary.md";
const AUDIO_SUFFIX = ".mp3";

export function deriveTranscriptPath(basePath: string): string {
  return `${basePath.replace(/[/\\]+$/, "")}${TRANSCRIPT_SUFFIX}`;
}

export function deriveSummaryPath(basePathOrTranscriptPath: string): string {
  if (basePathOrTranscriptPath.endsWith(TRANSCRIPT_SUFFIX)) {
    return `${basePathOrTranscriptPath.slice(0, -TRANSCRIPT_SUFFIX.length)}${SUMMARY_SUFFIX}`;
  }

  if (basePathOrTranscriptPath.endsWith(SUMMARY_SUFFIX)) {
    return basePathOrTranscriptPath;
  }

  return `${basePathOrTranscriptPath}${SUMMARY_SUFFIX}`;
}

export function slugifyFilenameSegment(input: string): string {
  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function deriveYoutubeAudioPath(
  basePath: string,
  title: string | undefined,
  videoId: string,
): string {
  const normalizedBase = basePath.replace(/[/\\]+$/, "");
  const segment = slugifyFilenameSegment(title ?? "") || slugifyFilenameSegment(videoId) || videoId;
  return `${normalizedBase}-${segment}${AUDIO_SUFFIX}`;
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export function assertWritable(filePath: string, force: boolean): void {
  if (force) {
    return;
  }

  if (existsSync(filePath)) {
    throw new Error(`Refusing to overwrite ${filePath}. Use --force to replace it.`);
  }
}

export async function writeJson(
  filePath: string,
  value: unknown,
  options: { overwrite?: boolean } = {},
): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

export async function writeText(
  filePath: string,
  value: string,
  options: { overwrite?: boolean } = {},
): Promise<void> {
  await ensureParentDir(filePath);
  const targetPath = options.overwrite
    ? path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
      )
    : filePath;
  const handle = await open(targetPath, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  if (!options.overwrite) {
    return;
  }

  try {
    await rename(targetPath, filePath);
  } catch (error) {
    await unlink(targetPath).catch(() => {});
    throw error;
  }
}

export async function readTranscript(filePath: string): Promise<TranscriptDocument> {
  const raw = await readFile(filePath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    throw new Error(`Invalid transcript file at ${filePath}: invalid JSON`);
  }

  if (!isTranscriptDocument(parsed)) {
    throw new Error(`Invalid transcript file at ${filePath}: unexpected shape`);
  }

  return parsed;
}

function isTranscriptDocument(value: unknown): value is TranscriptDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isTranscriptSource(value.source) &&
    isTranscriptMetadata(value.transcription) &&
    isTranscriptAudio(value.audio) &&
    Array.isArray(value.segments) &&
    value.segments.every(isTranscriptSegment) &&
    typeof value.fullText === "string"
  );
}

function isTranscriptSource(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.type === "youtube" &&
    typeof value.url === "string" &&
    typeof value.videoId === "string" &&
    typeof value.title === "string"
  );
}

function isTranscriptMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.model === "string" &&
    typeof value.language === "string" &&
    typeof value.generatedAt === "string"
  );
}

function isTranscriptAudio(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.durationSeconds === "number" &&
    typeof value.chunkCount === "number"
  );
}

function isTranscriptSegment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    typeof value.text === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
