import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertWritable,
  deriveTranscriptPath,
  slugifyFilenameSegment,
  writeJson,
} from "../lib/fs.js";
import { createOpenAiClient } from "../lib/openai.js";
import { checkTranscribeRequirements } from "../lib/requirements.js";
import {
  printArtifactPaths,
  renderDownloadEvent,
  renderTranscribeEvent,
  runTasks,
} from "../lib/tui.js";
import { transcribeAudio } from "../lib/transcription.js";
import { downloadYoutubeAudio, fetchYoutubeMetadata } from "../lib/youtube.js";
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
  const isDirMode = options.output.endsWith("/") || options.output.endsWith("\\");
  let transcriptPath: string | undefined;

  if (!isDirMode) {
    transcriptPath = deriveTranscriptPath(options.output);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nota-transcribe-"));

  try {
    if (!isDirMode && transcriptPath) {
      assertWritable(transcriptPath, options.force ?? false);
    }

    let client: ReturnType<typeof createOpenAiClient> | undefined;

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
        task: async (_setOutput) => {
          checkTranscribeRequirements(process.env);
          client = createOpenAiClient(process.env, options.baseUrl);
        },
      },
      {
        title: "downloading audio",
        task: async (setOutput) => {
          let audioFilePath: string | undefined;

          if (isDirMode) {
            const dir = options.output.replace(/[/\\]+$/, "");
            const meta = await fetchYoutubeMetadata(youtubeUrl, options.browser);
            const slug =
              slugifyFilenameSegment(meta.title ?? "") ||
              slugifyFilenameSegment(meta.videoId) ||
              meta.videoId;
            const base = path.join(dir, slug);
            transcriptPath = `${base}.transcript.json`;
            audioFilePath = `${base}.mp3`;
            assertWritable(transcriptPath, options.force ?? false);
          }

          const download = await downloadYoutubeAudio({
            url: youtubeUrl,
            outputBasePath: options.output,
            audioFilePath,
            browser: options.browser,
            onProgress: (event) => {
              const msg = renderDownloadEvent(event);
              if (msg) setOutput(msg);
            },
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
        task: async (setOutput) => {
          if (!client) {
            throw new Error("OpenAI client was not initialized");
          }

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
            onProgress: (event) => {
              const msg = renderTranscribeEvent(event);
              if (msg) setOutput(msg);
            },
          });
        },
      },
      {
        title: "writing transcript",
        task: async (_setOutput) => {
          if (!transcript || !transcriptPath) {
            throw new Error("Transcript was not created");
          }

          await writeJson(transcriptPath, transcript, {
            overwrite: options.force ?? false,
          });
        },
      },
    ]);

    if (!transcript || !transcriptPath) {
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
