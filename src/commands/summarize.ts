import { assertWritable, deriveSummaryPath, readTranscript, writeText } from "../lib/fs.js";
import { createOpenAiClient } from "../lib/openai.js";
import { checkSummarizeRequirements } from "../lib/requirements.js";
import { generateSummaryMarkdown } from "../lib/summary.js";
import { printArtifactPaths, runTasks } from "../lib/tui.js";

export interface SummarizeCommandOptions {
  output?: string;
  model?: string;
  summaryLang?: string;
  force?: boolean;
  baseUrl?: string;
}

export async function runSummarizeCommand(
  transcriptJson: string,
  options: SummarizeCommandOptions,
): Promise<{ summaryPath: string; markdown: string }> {
  const summaryPath = options.output ?? deriveSummaryPath(transcriptJson);
  let markdown: string | undefined;
  let client: ReturnType<typeof createOpenAiClient> | undefined;

  assertWritable(summaryPath, options.force ?? false);

  await runTasks([
    {
      title: "checking requirements",
      task: async (_setOutput) => {
        checkSummarizeRequirements(process.env);
        client = createOpenAiClient(process.env, options.baseUrl);
      },
    },
    {
      title: "summarizing transcript",
      task: async (_setOutput) => {
        if (!client) {
          throw new Error("OpenAI client was not initialized");
        }

        const transcript = await readTranscript(transcriptJson);
        markdown = await generateSummaryMarkdown(client, transcript, {
          model: options.model ?? "gpt-5-mini",
          summaryLanguage: options.summaryLang ?? "en",
        });
      },
    },
    {
      title: "writing markdown summary",
      task: async (_setOutput) => {
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
