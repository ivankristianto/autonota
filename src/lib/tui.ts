import { Listr } from "listr2";

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
