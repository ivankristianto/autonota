import { Listr } from "listr2";

export interface TaskEntry {
  title: string;
  task: () => Promise<void>;
}

export async function runTasks(tasks: TaskEntry[]): Promise<void> {
  const shouldPrintProgress = !process.stdout.isTTY;
  const list = new Listr(
    tasks.map((entry) => ({
      title: entry.title,
      task: async () => {
        if (shouldPrintProgress) {
          process.stderr.write(`${entry.title}\n`);
        }
        await entry.task();
      },
    })),
    {
      concurrent: false,
      exitOnError: true,
      renderer: process.stdout.isTTY ? "default" : "silent",
    },
  );

  await list.run();
}

export function printRetryNotice(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function printArtifactPaths(paths: { transcriptPath?: string; summaryPath?: string }): void {
  if (paths.transcriptPath) {
    process.stdout.write(`${paths.transcriptPath}\n`);
  }

  if (paths.summaryPath) {
    process.stdout.write(`${paths.summaryPath}\n`);
  }
}
