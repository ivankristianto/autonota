import { Listr } from "listr2";

import type { DownloadProgressEvent, TranscribeProgressEvent } from "./progress.js";

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

export function stripYtDlpLine(line: string): string {
  return line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
}

export function renderDownloadEvent(event: DownloadProgressEvent): string | null {
  switch (event.type) {
    case "metadata":
      return "fetching video info...";
    case "downloading": {
      const cleaned = stripYtDlpLine(event.line);
      return cleaned || null;
    }
    case "done":
      return null;
  }
}

export function renderTranscribeEvent(event: TranscribeProgressEvent): string | null {
  switch (event.type) {
    case "uploading":
      return "uploading audio...";
    case "chunk":
      return `chunk ${event.index}/${event.total}...`;
    case "rate-limited":
      return `rate limited, waiting ${formatSeconds(event.waitSeconds)} (attempt ${event.attempt}/${event.max})...`;
    case "rate-limit-tick":
      return `retrying in ${formatSeconds(event.remainingSeconds)}...`;
    case "done":
      return null;
  }
}

export interface TaskEntry {
  title: string;
  task: (setOutput: (msg: string) => void) => Promise<void>;
}

export async function runTasks(tasks: TaskEntry[]): Promise<void> {
  const isTTY = Boolean(process.stdout.isTTY);
  const list = new Listr(
    tasks.map((entry) => ({
      title: entry.title,
      task: async (_ctx: unknown, listrTask: unknown) => {
        const setOutput = (msg: string): void => {
          if (isTTY) {
            (listrTask as { output: string }).output = msg;
          } else {
            process.stderr.write(`${msg}\n`);
          }
        };
        if (!isTTY) {
          process.stderr.write(`${entry.title}\n`);
        }
        await entry.task(setOutput);
      },
    })),
    {
      concurrent: false,
      exitOnError: true,
      renderer: isTTY ? "default" : "silent",
    },
  );

  await list.run();
}

export function printArtifactPaths(paths: { transcriptPath?: string; summaryPath?: string }): void {
  if (paths.transcriptPath) {
    process.stdout.write(`${paths.transcriptPath}\n`);
  }

  if (paths.summaryPath) {
    process.stdout.write(`${paths.summaryPath}\n`);
  }
}
