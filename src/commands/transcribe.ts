import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import OpenAI from "openai";

import { assertWritable, deriveTranscriptPath, writeJson } from "../lib/fs.js";
import { checkTranscribeRequirements } from "../lib/requirements.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";
import { transcribeAudio } from "../lib/transcription.js";
import { downloadYoutubeAudio } from "../lib/youtube.js";
import type { TranscriptDocument } from "../types.js";

export interface TranscribeCommandOptions {
  output: string;
  model?: string;
  lang?: string;
  browser?: string;
  force?: boolean;
  baseUrl?: string;
}

export async function runTranscribeCommand(
  youtubeUrl: string,
  options: TranscribeCommandOptions,
): Promise<{ transcriptPath: string; transcript: TranscriptDocument }> {
  if (options.model && options.model !== "whisper-1") {
    throw new Error(
      'Timestamped transcript generation currently supports only the "whisper-1" model.',
    );
  }

  const transcriptPath = deriveTranscriptPath(options.output);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-transcribe-"));

  try {
    assertWritable(transcriptPath, options.force ?? false);
    const baseURL = options.baseUrl ?? (process.env.OPENAI_BASE_URL?.trim() || undefined);

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      ...(baseURL ? { baseURL } : {}),
    });

    let audioPath: string | undefined;
    let source:
      | {
          type: "youtube";
          url: string;
          videoId: string;
          title: string;
        }
      | undefined;
    let transcript: TranscriptDocument | undefined;

    await runTasks([
      {
        title: "checking requirements",
        task: async () => {
          checkTranscribeRequirements(process.env);
        },
      },
      {
        title: "downloading audio",
        task: async () => {
          const download = await downloadYoutubeAudio({
            url: youtubeUrl,
            tempDir,
            browser: options.browser,
          });
          audioPath = download.audioPath;
          source = {
            type: "youtube",
            ...download.metadata,
          };
        },
      },
      {
        title: "transcribing audio",
        task: async () => {
          if (!audioPath || !source) {
            throw new Error("Audio download did not produce the expected inputs");
          }

          transcript = await transcribeAudio(client, {
            audioPath,
            source,
            transcription: {
              model: options.model ?? "whisper-1",
              language: options.lang ?? "auto",
            },
            tempDir,
          });
        },
      },
      {
        title: "writing transcript",
        task: async () => {
          if (!transcript) {
            throw new Error("Transcript was not created");
          }

          await writeJson(transcriptPath, transcript, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);

    if (!transcript) {
      throw new Error("Transcript was not created");
    }

    printArtifactPaths({ transcriptPath });

    return {
      transcriptPath,
      transcript,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
