import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { SAFE_UPLOAD_BYTES, cleanupFiles, getAudioDurationSeconds, planChunkDuration, splitAudioToMp3Chunks } from "./audio.js";
import type { TranscribeProgressEvent } from "./progress.js";
import type { TranscriptDocument, TranscriptSegment, TranscriptSource } from "../types.js";

const MAX_RETRIES = 3;

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

type WhisperResponse = {
  segments?: WhisperSegment[];
};

export interface WhisperClient {
  audio: {
    transcriptions: {
      create(input: {
        file: ReturnType<typeof createReadStream>;
        model: string;
        language?: string;
        response_format: "verbose_json";
        timestamp_granularities: ["segment"];
      }): Promise<WhisperResponse>;
    };
  };
}

export interface TranscribeUploadOptions {
  audioPath: string;
  model: string;
  language: string;
}

export interface TranscribeChunkedUploadOptions extends TranscribeUploadOptions {
  chunkPaths: string[];
  chunkDurationSeconds: number;
}

export interface TranscribeAudioOptions {
  audioPath: string;
  source: TranscriptSource;
  transcription?: {
    model?: string;
    language?: string;
  };
  tempDir?: string;
  durationSeconds?: number;
}

export interface TranscriptDocumentInput {
  source: TranscriptSource;
  transcription: {
    model: string;
    language: string;
    generatedAt: string;
  };
  audio: {
    durationSeconds: number;
    chunkCount: number;
  };
  segments: TranscriptSegment[];
}

export function parseWaitTime(message: string): number {
  const minuteMatch = /try again in\s+(\d+)m([\d.]+)s/i.exec(message);
  if (minuteMatch) {
    return Number.parseInt(minuteMatch[1], 10) * 60 + Number.parseFloat(minuteMatch[2]);
  }

  const secondsMatch = /try again in\s+([\d.]+)s/i.exec(message);
  if (secondsMatch) {
    return Number.parseFloat(secondsMatch[1]);
  }

  return 60;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
  };

  return (
    record.status === 429 ||
    record.statusCode === 429 ||
    (typeof record.message === "string" && /rate limit/i.test(record.message))
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "";
}

async function delayWithTicks(
  seconds: number,
  onProgress: ((e: TranscribeProgressEvent) => void) | undefined,
): Promise<void> {
  return new Promise((resolve) => {
    const totalMs = seconds * 1000;
    const startTime = Date.now();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (onProgress) {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, (totalMs - elapsed) / 1000);
        onProgress({ type: "rate-limit-tick", remainingSeconds: remaining });
      }, 10_000);
    }

    setTimeout(() => {
      if (intervalId !== undefined) clearInterval(intervalId);
      resolve();
    }, totalMs);
  });
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  onProgress?: (e: TranscribeProgressEvent) => void,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error)) {
        throw error;
      }

      if (attempt >= MAX_RETRIES) {
        break;
      }

      const waitTime = parseWaitTime(getErrorMessage(error));
      onProgress?.({
        type: "rate-limited",
        waitSeconds: waitTime,
        attempt: attempt + 1,
        max: MAX_RETRIES,
      });
      await delayWithTicks(waitTime, onProgress);
    }
  }

  throw lastError;
}

function normalizeSegments(segments: WhisperSegment[] | undefined): TranscriptSegment[] {
  return (segments ?? []).map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text.trim(),
  }));
}

async function transcribeFile(
  client: WhisperClient,
  options: TranscribeUploadOptions & { offsetSeconds?: number },
): Promise<TranscriptSegment[]> {
  const { audioPath, model, language, offsetSeconds = 0 } = options;

  const response = await withRateLimitRetry(() =>
    client.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model,
      ...(language === "auto" ? {} : { language }),
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    }),
  );

  return normalizeSegments(response.segments).map((segment) => ({
    start: segment.start + offsetSeconds,
    end: segment.end + offsetSeconds,
    text: segment.text,
  }));
}

export async function transcribeSingleUpload(
  client: WhisperClient,
  options: TranscribeUploadOptions,
): Promise<TranscriptSegment[]> {
  return transcribeFile(client, options);
}

export async function transcribeChunkedUpload(
  client: WhisperClient,
  options: TranscribeChunkedUploadOptions,
): Promise<TranscriptSegment[]> {
  const segments: TranscriptSegment[] = [];
  let offsetSeconds = 0;

  try {
    for (const chunkPath of options.chunkPaths) {
      const chunkSegments = await transcribeFile(client, {
        audioPath: chunkPath,
        model: options.model,
        language: options.language,
        offsetSeconds,
      });
      segments.push(...chunkSegments);
      offsetSeconds += await getAudioDurationSeconds(chunkPath);
    }
  } finally {
    try {
      await cleanupFiles(options.chunkPaths);
    } catch {
      // Best-effort cleanup: never let temp-file removal replace the primary outcome.
    }
  }

  return segments;
}

export function buildTranscriptDocument(
  input: TranscriptDocumentInput,
): TranscriptDocument {
  const segments = input.segments.map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text.trim(),
  }));

  return {
    source: input.source,
    transcription: input.transcription,
    audio: input.audio,
    segments,
    fullText: segments.map((segment) => segment.text).join(" "),
  };
}

export async function transcribeAudio(
  client: WhisperClient,
  options: TranscribeAudioOptions,
): Promise<TranscriptDocument> {
  const transcription = {
    model: options.transcription?.model ?? "whisper-1",
    language: options.transcription?.language ?? "auto",
  };

  const fileSizeBytes = (await stat(options.audioPath)).size;
  const durationSeconds =
    options.durationSeconds ?? (await getAudioDurationSeconds(options.audioPath));
  const chunked = fileSizeBytes > SAFE_UPLOAD_BYTES;
  const chunkDurationSeconds = chunked
    ? planChunkDuration({
        fileSizeBytes,
        durationSeconds,
      })
    : 0;
  const chunkPaths = chunked
    ? await splitAudioToMp3Chunks(
        options.audioPath,
        chunkDurationSeconds,
        options.tempDir ?? path.dirname(options.audioPath),
      )
    : [];

  const segments =
    !chunked
      ? await transcribeSingleUpload(client, {
          audioPath: options.audioPath,
          model: transcription.model,
          language: transcription.language,
        })
      : await transcribeChunkedUpload(client, {
          audioPath: options.audioPath,
          model: transcription.model,
          language: transcription.language,
          chunkDurationSeconds,
          chunkPaths,
        });

  return buildTranscriptDocument({
    source: options.source,
    transcription: {
      ...transcription,
      generatedAt: new Date().toISOString(),
    },
    audio: {
      durationSeconds,
      chunkCount: chunked ? chunkPaths.length : 1,
    },
    segments,
  });
}
