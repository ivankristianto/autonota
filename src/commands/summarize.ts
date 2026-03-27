import OpenAI from "openai";

import { assertWritable, readTranscript, writeText } from "../lib/fs.js";
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
  const baseURL = options.baseUrl ?? (process.env.OPENAI_BASE_URL?.trim() || undefined);

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
    ...(baseURL ? { baseURL } : {}),
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

        await writeText(summaryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
          overwrite: options.force ?? false,
        });
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
