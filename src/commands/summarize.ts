import { writeFile } from "node:fs/promises";

import OpenAI from "openai";

import { assertWritable, ensureParentDir, readTranscript } from "../lib/fs.js";
import { checkSummarizeRequirements } from "../lib/requirements.js";
import { generateSummaryMarkdown } from "../lib/summary.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";

export interface SummarizeCommandOptions {
  output: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
}

export async function runSummarizeCommand(
  transcriptJson: string,
  options: SummarizeCommandOptions,
): Promise<{ summaryPath: string; markdown: string }> {
  const summaryPath = options.output;
  let markdown: string | undefined;

  assertWritable(summaryPath, options.force ?? false);

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  });

  await runTasks([
    {
      title: "checking requirements",
      task: async () => {
        checkSummarizeRequirements(process.env);
      },
    },
    {
      title: "summarizing transcript",
      task: async () => {
        const transcript = await readTranscript(transcriptJson);
        markdown = await generateSummaryMarkdown(client, transcript, {
          model: options.model ?? "gpt-4.1-mini",
          summaryLanguage: options.summaryLang ?? "en",
        });
      },
    },
    {
      title: "writing markdown summary",
      task: async () => {
        if (!markdown) {
          throw new Error("Summary markdown was not created");
        }

        await ensureParentDir(summaryPath);
        await writeFile(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, "utf8");
      },
    },
  ]);

  if (!markdown) {
    throw new Error("Summary markdown was not created");
  }

  printArtifactPaths({ summaryPath });

  return {
    summaryPath,
    markdown,
  };
}
